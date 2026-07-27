import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import {
  canCreateBooking,
  canEditBooking,
  canCancelBooking,
  canCheckIn,
  canCheckOut,
  canMarkNoShow,
  canExtendStay,
  canChangeRoom,
  canAddBookingCharge,
  canOverrideRate,
} from '../middleware/permissions.js';
import { calculatePricing, toNumber } from '../services/pricing.js';
import { createAuditLog } from '../services/audit.js';
import { BookingStatus, RoomStatus } from '../types.js';
import { differenceInCalendarDays } from 'date-fns';

// Legacy aliases kept so existing route uses below compile without mass refactor
const canWrite = canCreateBooking;
const canManage = canCancelBooking;

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

bookingsRouter.get('/', async (req, res, next) => {
  try {
    const {
      buildingId,
      status,
      page = '1',
      limit = '50',
    } = req.query as Record<string, string>;

    const where: any = {};

    if (buildingId) {
      where.buildingId = buildingId;
    } else if (req.user!.role !== 'SuperAdmin' && req.user!.role !== 'OwnerAdmin') {
      where.buildingId = { in: req.user!.buildingIds };
    }

    if (status) where.status = status;

    const [total, bookings] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        include: {
          room: { select: { number: true, capacity: true } },
          guest: { select: { fullName: true, documentType: true, documentNumber: true, documentNumberMasked: true } },
          invoice: { select: { id: true, number: true, status: true } },
          payments: { where: { isReversed: false }, select: { amount: true, purpose: true } },
          building: { select: { name: true, code: true } },
        },
      }),
    ]);

    // Strip raw document numbers; add hasValidDocNumber computed field
    const PLACEHOLDER_PREFIXES = ['PENDING', 'UNKNOWN', 'TEMP'];
    const sanitizeGuestInList = (g: any) => {
      if (!g) return null;
      const raw = g.documentNumber || '';
      const isPlaceholder = !raw || PLACEHOLDER_PREFIXES.some(p => raw.startsWith(p)) || raw.trim() === '';
      const { documentNumber: _dn, ...rest } = g;
      return { ...rest, hasValidDocNumber: !isPlaceholder };
    };
    const data = bookings.map(b => ({ ...b, guest: sanitizeGuestInList(b.guest) }));
    res.json({ data, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

bookingsRouter.get('/:id', async (req, res, next) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: String(req.params.id) },
      include: {
        room: true,
        guest: { include: { documents: true } },
        invoice: { include: { items: true } },
        payments: { orderBy: { paymentDate: 'asc' } },
        additionalChargeItems: true,
        building: true,
        createdBy: { select: { name: true } },
        checkedInBy: { select: { name: true } },
        checkedOutBy: { select: { name: true } },
      },
    });
    if (!booking) { res.status(404).json({ error: 'Booking not found' }); return; }
    // Strip raw document number; compute hasValidDocNumber for the frontend
    const PLACEHOLDER_PREFIXES_D = ['PENDING', 'UNKNOWN', 'TEMP'];
    const sanitizedBooking = {
      ...booking,
      guest: booking.guest ? (() => {
        const raw = (booking.guest as any).documentNumber || '';
        const isPlaceholder = !raw || PLACEHOLDER_PREFIXES_D.some(p => raw.startsWith(p)) || raw.trim() === '';
        const { documentNumber: _dn, ...safeGuest } = booking.guest as any;
        return { ...safeGuest, hasValidDocNumber: !isPlaceholder };
      })() : null,
    };
    res.json(sanitizedBooking);
  } catch (err) {
    next(err);
  }
});

const createBookingSchema = z.object({
  buildingId: z.string().min(1),
  roomId: z.string().min(1),
  guestId: z.string().optional(),
  guestName: z.string().min(1, 'Guest name required'),
  guestMobile: z.string().min(9, 'Valid mobile number required'),
  guestDocumentType: z.enum(['NIC', 'Passport']).optional(),
  guestDocumentNumber: z.string().optional(),
  checkInDate: z.string().min(1),
  checkOutDate: z.string().min(1),
  adults: z.number().int().min(1),
  children: z.number().int().min(0).default(0),
  isAc: z.boolean().default(false),
  overrideNightlyRate: z.number().min(0).optional(),
  discountType: z.enum(['percentage', 'fixed']).nullable().optional(),
  discountValue: z.number().min(0).optional(),
  serviceChargeType: z.enum(['percentage', 'fixed']).nullable().optional(),
  serviceChargeValue: z.number().min(0).optional(),
  depositAmount: z.number().min(0).optional(),
  depositMethod: z.enum(['Cash', 'Card', 'BankTransfer', 'Other']).optional(),
  notes: z.string().optional(),
  // NOTE: CheckedIn is intentionally excluded — bookings cannot be created
  // directly in a checked-in state. Use the dedicated POST /:id/check-in
  // endpoint after creating the reservation and uploading identity documents.
  status: z.enum(['Draft', 'Reserved', 'Confirmed']).default('Reserved'),
  capacityOverrideReason: z.string().optional(),
});

bookingsRouter.post('/', canWrite, async (req, res, next) => {
  try {
    const data = createBookingSchema.parse(req.body);

    const checkInDate = new Date(data.checkInDate);
    const checkOutDate = new Date(data.checkOutDate);

    if (checkOutDate <= checkInDate) {
      res.status(400).json({ error: 'Check-out must be after check-in' });
      return;
    }

    const nights = differenceInCalendarDays(checkOutDate, checkInDate);
    if (nights < 1) {
      res.status(400).json({ error: 'Minimum 1 night required' });
      return;
    }

    const totalGuests = data.adults + data.children;

    // Fetch room inside transaction to prevent race condition
    const result = await prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({ where: { id: data.roomId } });
      if (!room) throw new Error('Room not found');
      if (!room.isActive) throw new Error('Room is not active');

      // Capacity check
      if (totalGuests > room.capacity) {
        if (!data.capacityOverrideReason) {
          throw Object.assign(new Error(`Room capacity is ${room.capacity} but ${totalGuests} guests requested. Provide capacityOverrideReason to override.`), { statusCode: 422 });
        }
      }

      // Room availability check
      if (room.status === 'Maintenance' || room.status === 'Blocked' || room.status === 'Cleaning') {
        throw Object.assign(new Error(`Room is ${room.status} and cannot be booked`), { statusCode: 409 });
      }

      // Date overlap check
      const overlap = await tx.booking.findFirst({
        where: {
          roomId: data.roomId,
          status: { in: ['Reserved', 'Confirmed', 'CheckedIn'] },
          checkInDate: { lt: checkOutDate },
          checkOutDate: { gt: checkInDate },
        },
      });

      if (overlap) {
        throw Object.assign(new Error(`Room is already booked from ${overlap.checkInDate.toISOString()} to ${overlap.checkOutDate.toISOString()}`), { statusCode: 409 });
      }

      // Get building for sequence
      const building = await tx.building.findUnique({ where: { id: data.buildingId } });
      if (!building) throw new Error('Building not found');

      // Generate booking reference
      let seq = await tx.bookingSequence.findUnique({ where: { buildingId: data.buildingId } });
      if (!seq) {
        seq = await tx.bookingSequence.create({ data: { buildingId: data.buildingId, lastNumber: 0 } });
      }
      const nextNum = seq.lastNumber + 1;
      await tx.bookingSequence.update({ where: { buildingId: data.buildingId }, data: { lastNumber: nextNum } });
      const reference = `${building.bookingPrefix}-${String(nextNum).padStart(4, '0')}`;

      // Rate override: only managers and above may override the room rate
      if (data.overrideNightlyRate !== undefined && data.overrideNightlyRate > 0) {
        const level = { SuperAdmin: 100, OwnerAdmin: 90, BuildingManager: 70, Operator: 50, Cashier: 40, ReadOnly: 10 };
        const userLevel = level[req.user!.role] ?? 0;
        if (userLevel < 70) {
          throw Object.assign(
            new Error('Only Building Managers and above may override the room rate'),
            { statusCode: 403 },
          );
        }
      }

      // Pricing
      const pricing = calculatePricing({
        baseNightlyRate: data.overrideNightlyRate !== undefined && data.overrideNightlyRate > 0
          ? data.overrideNightlyRate
          : toNumber(room.nonAcRate),
        acSurchargePerNight: data.isAc ? toNumber(room.acSurcharge) : 0,
        nights,
        discountType: data.discountType,
        discountValue: data.discountValue,
        serviceChargeType: data.serviceChargeType,
        serviceChargeValue: data.serviceChargeValue,
      });

      // Validate discount
      if (pricing.discount > pricing.subtotal) {
        throw Object.assign(new Error('Discount cannot exceed subtotal'), { statusCode: 400 });
      }

      // Auto-create a Guest record if not linking an existing one,
      // so identity documents (NIC copy) can be attached to this booking's guest.
      // Organization-scoped: guest lookup and creation always includes organizationId.
      let guestId = data.guestId;
      if (!guestId) {
        const docNumber = (data.guestDocumentNumber ?? '').trim();
        const orgId = building.organizationId;

        // Reuse existing guest with same document number (within org) or fall back to mobile
        const existing = docNumber
          ? await tx.guest.findFirst({ where: { organizationId: orgId, documentNumber: docNumber } })
          : await tx.guest.findFirst({ where: { organizationId: orgId, mobile: data.guestMobile } });

        if (existing) {
          guestId = existing.id;
        } else {
          // Document number is not validated here — it will be validated/confirmed
          // at check-in. Walk-in bookings must upload ID before calling POST /:id/check-in.
          const masked = docNumber.length > 4
            ? '*'.repeat(docNumber.length - 4) + docNumber.slice(-4)
            : docNumber ? '****' : 'PENDING';
          const newGuest = await tx.guest.create({
            data: {
              organizationId: orgId,
              fullName: data.guestName,
              mobile: data.guestMobile,
              documentType: data.guestDocumentType || 'NIC',
              documentNumber: docNumber || `PENDING-${reference}`,
              documentNumberMasked: masked,
              nationality: 'Sri Lankan',
              createdById: req.user!.id,
            },
          });
          guestId = newGuest.id;
        }
      }

      const booking = await tx.booking.create({
        data: {
          reference,
          organizationId: building.organizationId,
          buildingId: data.buildingId,
          roomId: data.roomId,
          guestId: guestId,
          guestName: data.guestName,
          guestMobile: data.guestMobile,
          checkInDate,
          checkOutDate,
          nights,
          adults: data.adults,
          children: data.children,
          totalGuests,
          isAc: data.isAc,
          baseNightlyRate: pricing.baseNightlyRate,
          acSurchargePerNight: pricing.acSurchargePerNight,
          roomCharge: pricing.roomCharge,
          additionalCharges: 0,
          serviceChargeType: data.serviceChargeType,
          serviceChargeValue: data.serviceChargeValue,
          serviceCharge: pricing.serviceCharge,
          discountType: data.discountType,
          discountValue: data.discountValue,
          discount: pricing.discount,
          invoiceTotal: pricing.invoiceTotal,
          paidAmount: 0,
          outstandingBalance: pricing.invoiceTotal,
          status: data.status,
          capacityOverrideReason: data.capacityOverrideReason,
          notes: data.notes,
          createdById: req.user!.id,
          // No immediate check-in at creation time — status can only be Draft/Reserved/Confirmed
        },
      });

      // Handle deposit
      if (data.depositAmount && data.depositAmount > 0) {
        const payRef = `PAY-${reference}`;
        const payment = await tx.payment.create({
          data: {
            paymentReference: payRef,
            bookingId: booking.id,
            guestName: data.guestName,
            amount: data.depositAmount,
            purpose: 'Deposit',
            method: (data.depositMethod as any) || 'Cash',
            paymentDate: new Date(),
            collectedById: req.user!.id,
          },
        });
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            paidAmount: data.depositAmount,
            outstandingBalance: pricing.invoiceTotal - data.depositAmount,
          },
        });
      }

      return { booking, pricing };
    });

    await createAuditLog(req.user, req, {
      buildingId: data.buildingId,
      action: 'BOOKING_CREATED',
      entityType: 'Booking',
      entityId: result.booking.id,
      newValue: { reference: result.booking.reference, status: result.booking.status },
    });

    res.status(201).json(result.booking);
  } catch (err) {
    next(err);
  }
});

// Check-in
bookingsRouter.post('/:id/check-in', canWrite, async (req, res, next) => {
  try {
    const { roomConditionNotes, guestCountConfirmed } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: String(req.params.id) },
        include: {
          guest: { include: { documents: true } },
          room: true,
        },
      });

      if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 });
      if (booking.status !== 'Reserved' && booking.status !== 'Confirmed') {
        throw Object.assign(new Error(`Cannot check in: booking is ${booking.status}`), { statusCode: 422, code: 'INVALID_BOOKING_STATUS' });
      }

      // Document check — every check-in requires a linked guest record with:
      //   1. A valid (non-placeholder) document number
      //   2. A front-side identity image uploaded
      if (!booking.guest) {
        throw Object.assign(
          new Error('A guest record must be linked before check-in. Register the guest and upload their ID.'),
          { statusCode: 422, code: 'GUEST_PROFILE_REQUIRED' },
        );
      }

      const docNum = booking.guest.documentNumber;
      const isPlaceholder =
        !docNum ||
        docNum.startsWith('PENDING') ||
        docNum.startsWith('UNKNOWN') ||
        docNum.startsWith('TEMP') ||
        docNum.trim() === '';
      if (isPlaceholder) {
        throw Object.assign(
          new Error('A valid NIC or passport number is required before check-in. Update the guest record.'),
          { statusCode: 422, code: 'DOCUMENT_NUMBER_REQUIRED' },
        );
      }

      const hasFrontDoc = booking.guest.documents.some((d: { side: string }) => d.side === 'front');
      if (!hasFrontDoc) {
        throw Object.assign(
          new Error('A front-side identity document image must be uploaded before check-in.'),
          { statusCode: 422, code: 'IDENTITY_IMAGE_REQUIRED' },
        );
      }

      if (!booking.guestMobile) {
        throw Object.assign(new Error('Guest mobile number required before check-in'), { statusCode: 422, code: 'GUEST_MOBILE_REQUIRED' });
      }

      // Room availability
      const conflictingCheckIn = await tx.booking.findFirst({
        where: {
          id: { not: booking.id },
          roomId: booking.roomId,
          status: 'CheckedIn',
        },
      });

      if (conflictingCheckIn) {
        throw Object.assign(new Error('Room is currently occupied by another guest'), { statusCode: 409, code: 'ROOM_NOT_AVAILABLE' });
      }

      const updatedBooking = await tx.booking.update({
        where: { id: String(req.params.id) },
        data: {
          status: 'CheckedIn',
          actualCheckIn: new Date(),
          checkedInById: req.user!.id,
          notes: roomConditionNotes
            ? `${booking.notes || ''}\nRoom condition: ${roomConditionNotes}`.trim()
            : booking.notes,
        },
      });

      await tx.room.update({
        where: { id: booking.roomId },
        data: { status: 'Occupied' },
      });

      await tx.roomStatusHistory.create({
        data: {
          buildingId: booking.buildingId,
          roomId: booking.roomId,
          fromStatus: booking.room.status,
          toStatus: 'Occupied',
          reason: `Check-in: ${booking.reference}`,
          changedById: req.user!.id,
        },
      });

      return updatedBooking;
    });

    await createAuditLog(req.user, req, {
      buildingId: result.buildingId,
      action: 'BOOKING_CHECKED_IN',
      entityType: 'Booking',
      entityId: String(req.params.id),
      newValue: { reference: result.reference, actualCheckIn: result.actualCheckIn },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Checkout
bookingsRouter.post('/:id/checkout', canWrite, async (req, res, next) => {
  try {
    const { overrideReason, additionalCharges: extraCharges, actualCheckOut: checkoutTimeStr } = req.body;
    const checkoutTime = checkoutTimeStr ? new Date(checkoutTimeStr) : new Date();
    if (isNaN(checkoutTime.getTime())) {
      res.status(400).json({ error: 'Invalid checkout time' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: String(req.params.id) },
        include: {
          room: true,
          building: true,
          payments: { where: { isReversed: false } },
          additionalChargeItems: true,
          invoice: true,
        },
      });

      if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 });
      if (booking.status !== 'CheckedIn') {
        throw Object.assign(new Error('Only checked-in bookings can be checked out'), { statusCode: 422 });
      }

      const totalPaid = booking.payments.reduce((s, p) => s + toNumber(p.amount), 0);
      const outstanding = toNumber(booking.invoiceTotal) - totalPaid;

      if (outstanding > 0 && !overrideReason) {
        throw Object.assign(
          new Error(`Outstanding balance of LKR ${outstanding.toFixed(2)} must be settled or provide overrideReason`),
          { statusCode: 422 },
        );
      }

      if (outstanding > 0 && overrideReason) {
        // Only managers/admins can override
        if (req.user!.role === 'Operator' || req.user!.role === 'Cashier' || req.user!.role === 'ReadOnly') {
          throw Object.assign(new Error('Insufficient permissions to checkout with outstanding balance'), { statusCode: 403 });
        }
      }

      // Generate invoice number
      let invSeq = await tx.invoiceSequence.findUnique({ where: { buildingId: booking.buildingId } });
      if (!invSeq) {
        invSeq = await tx.invoiceSequence.create({ data: { buildingId: booking.buildingId, lastNumber: 0 } });
      }
      const nextInvNum = invSeq.lastNumber + 1;
      await tx.invoiceSequence.update({ where: { buildingId: booking.buildingId }, data: { lastNumber: nextInvNum } });
      const invoiceNumber = `${booking.building.invoicePrefix}-${String(nextInvNum).padStart(5, '0')}`;

      const invoiceTotal = toNumber(booking.invoiceTotal);
      const paidAmount = totalPaid;
      const invoiceOutstanding = Math.max(0, invoiceTotal - paidAmount);

      // Create invoice
      const invoice = await tx.invoice.create({
        data: {
          number: invoiceNumber,
          bookingId: booking.id,
          status: invoiceOutstanding === 0 ? 'Paid' : paidAmount > 0 ? 'PartiallyPaid' : 'Unpaid',
          subtotal: toNumber(booking.roomCharge) + toNumber(booking.additionalCharges),
          serviceCharge: toNumber(booking.serviceCharge),
          discount: toNumber(booking.discount),
          total: invoiceTotal,
          paidAmount,
          outstandingBalance: invoiceOutstanding,
          createdById: req.user!.id,
          items: {
            create: buildInvoiceItems(booking),
          },
        },
      });

      // Update payments with invoice reference
      await tx.payment.updateMany({
        where: { bookingId: booking.id, invoiceId: null },
        data: { invoiceId: invoice.id },
      });

      const updatedBooking = await tx.booking.update({
        where: { id: String(req.params.id) },
        data: {
          status: 'CheckedOut',
          actualCheckOut: checkoutTime,
          checkedOutById: req.user!.id,
          paidAmount,
          outstandingBalance: invoiceOutstanding,
        },
      });

      // Move room to Cleaning
      await tx.room.update({
        where: { id: booking.roomId },
        data: { status: 'Cleaning' },
      });

      await tx.roomStatusHistory.create({
        data: {
          buildingId: booking.buildingId,
          roomId: booking.roomId,
          fromStatus: 'Occupied',
          toStatus: 'Cleaning',
          reason: `Checkout: ${booking.reference}`,
          changedById: req.user!.id,
        },
      });

      return { booking: updatedBooking, invoice };
    });

    await createAuditLog(req.user, req, {
      buildingId: result.booking.buildingId,
      action: 'BOOKING_CHECKED_OUT',
      entityType: 'Booking',
      entityId: String(req.params.id),
      newValue: {
        reference: result.booking.reference,
        invoiceNumber: result.invoice.number,
        actualCheckOut: result.booking.actualCheckOut,
      },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Cancel booking
bookingsRouter.post('/:id/cancel', canManage, async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);

    const booking = await prisma.booking.findUnique({ where: { id: String(req.params.id) } });
    if (!booking) { res.status(404).json({ error: 'Booking not found' }); return; }
    if (booking.status === 'CheckedIn' || booking.status === 'CheckedOut') {
      res.status(422).json({ error: 'Cannot cancel a checked-in or checked-out booking' });
      return;
    }

    const updated = await prisma.booking.update({
      where: { id: String(req.params.id) },
      data: { status: 'Cancelled', cancellationReason: reason },
    });

    await createAuditLog(req.user, req, {
      buildingId: booking.buildingId,
      action: 'BOOKING_CANCELLED',
      entityType: 'Booking',
      entityId: String(req.params.id),
      reason,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// No-show
bookingsRouter.post('/:id/no-show', canManage, async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);

    const booking = await prisma.booking.findUnique({ where: { id: String(req.params.id) } });
    if (!booking) { res.status(404).json({ error: 'Booking not found' }); return; }
    if (booking.status !== 'Reserved' && booking.status !== 'Confirmed') {
      res.status(422).json({ error: 'Can only mark Reserved/Confirmed bookings as No Show' });
      return;
    }

    const updated = await prisma.booking.update({
      where: { id: String(req.params.id) },
      data: { status: 'NoShow', cancellationReason: reason },
    });

    await createAuditLog(req.user, req, {
      buildingId: booking.buildingId,
      action: 'BOOKING_NO_SHOW',
      entityType: 'Booking',
      entityId: String(req.params.id),
      reason,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

function buildInvoiceItems(booking: any) {
  const items: any[] = [];
  let sort = 0;

  items.push({
    description: `Room ${booking.room?.number || booking.roomId} - ${booking.nights} night(s) @ LKR ${toNumber(booking.baseNightlyRate).toLocaleString()}`,
    quantity: booking.nights,
    unitPrice: toNumber(booking.baseNightlyRate),
    total: toNumber(booking.baseNightlyRate) * booking.nights,
    sortOrder: sort++,
  });

  if (booking.isAc && toNumber(booking.acSurchargePerNight) > 0) {
    items.push({
      description: `A/C Surcharge - ${booking.nights} night(s) @ LKR ${toNumber(booking.acSurchargePerNight).toLocaleString()}`,
      quantity: booking.nights,
      unitPrice: toNumber(booking.acSurchargePerNight),
      total: toNumber(booking.acSurchargePerNight) * booking.nights,
      sortOrder: sort++,
    });
  }

  for (const charge of (booking.additionalChargeItems || [])) {
    items.push({
      description: `${charge.chargeType}${charge.description ? ': ' + charge.description : ''}`,
      quantity: 1,
      unitPrice: toNumber(charge.amount),
      total: toNumber(charge.amount),
      sortOrder: sort++,
    });
  }

  return items;
}

// ─── Additional charges (extra guest, food, damage, etc.) ───────────────────

const addChargeSchema = z.object({
  chargeType: z.enum(['Food', 'RoomService', 'Laundry', 'Damage', 'LateCheckout', 'Other']),
  description: z.string().optional(),
  amount: z.number().positive('Amount must be greater than zero'),
});

async function recalcBookingTotals(tx: any, bookingId: string) {
  const charges = await tx.bookingCharge.findMany({ where: { bookingId } });
  const additionalCharges = charges.reduce((s: number, ch: any) => s + toNumber(ch.amount), 0);

  const booking = await tx.booking.findUnique({ where: { id: bookingId } });
  const invoiceTotal =
    toNumber(booking.roomCharge) +
    additionalCharges +
    toNumber(booking.serviceCharge) -
    toNumber(booking.discount);
  const outstanding = Math.max(0, invoiceTotal - toNumber(booking.paidAmount));

  return tx.booking.update({
    where: { id: bookingId },
    data: {
      additionalCharges,
      invoiceTotal,
      outstandingBalance: outstanding,
    },
  });
}

bookingsRouter.post('/:id/charges', canWrite, async (req, res, next) => {
  try {
    const data = addChargeSchema.parse(req.body);
    const bookingId = String(req.params.id);

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) { res.status(404).json({ error: 'Booking not found' }); return; }
    if (!['Reserved', 'Confirmed', 'CheckedIn'].includes(booking.status)) {
      res.status(422).json({ error: 'Charges can only be added to active bookings (not checked-out or cancelled)' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const charge = await tx.bookingCharge.create({
        data: {
          bookingId,
          chargeType: data.chargeType,
          description: data.description,
          amount: data.amount,
        },
      });
      const updated = await recalcBookingTotals(tx, bookingId);
      return { charge, booking: updated };
    });

    await createAuditLog(req.user, req, {
      buildingId: booking.buildingId,
      action: 'CHARGE_ADDED',
      entityType: 'Booking',
      entityId: bookingId,
      newValue: { chargeType: data.chargeType, amount: data.amount, description: data.description },
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Extend Stay ─────────────────────────────────────────────────────────────

bookingsRouter.post('/:id/extend', canExtendStay, async (req, res, next) => {
  try {
    const { newCheckOutDate: newCheckOutStr, reason } = z
      .object({
        newCheckOutDate: z.string().min(1),
        reason: z.string().optional(),
      })
      .parse(req.body);

    const newCheckOut = new Date(newCheckOutStr);
    if (isNaN(newCheckOut.getTime())) {
      res.status(400).json({ error: 'Invalid checkout date' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: String(req.params.id) },
        include: { room: true, building: true },
      });

      if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 });
      if (!['Reserved', 'Confirmed', 'CheckedIn'].includes(booking.status)) {
        throw Object.assign(new Error('Can only extend active bookings'), { statusCode: 422 });
      }
      if (newCheckOut <= booking.checkOutDate) {
        throw Object.assign(new Error('New checkout must be later than current checkout'), { statusCode: 422 });
      }

      // Check for conflicts in the extended period
      const conflict = await tx.booking.findFirst({
        where: {
          id: { not: booking.id },
          roomId: booking.roomId,
          status: { in: ['Reserved', 'Confirmed', 'CheckedIn'] },
          checkInDate: { lt: newCheckOut },
          checkOutDate: { gt: booking.checkOutDate },
        },
      });

      if (conflict) {
        throw Object.assign(
          new Error(`Cannot extend: room is already booked from ${conflict.checkInDate.toISOString()} to ${conflict.checkOutDate.toISOString()}`),
          { statusCode: 409 },
        );
      }

      const newNights = differenceInCalendarDays(newCheckOut, booking.checkInDate);
      const pricing = calculatePricing({
        baseNightlyRate: toNumber(booking.baseNightlyRate),
        acSurchargePerNight: toNumber(booking.acSurchargePerNight),
        nights: newNights,
        additionalCharges: toNumber(booking.additionalCharges),
        serviceChargeType: booking.serviceChargeType as 'percentage' | 'fixed' | null | undefined,
        serviceChargeValue: toNumber(booking.serviceChargeValue),
        discountType: booking.discountType as 'percentage' | 'fixed' | null | undefined,
        discountValue: toNumber(booking.discountValue),
      });

      const newOutstanding = Math.max(0, pricing.invoiceTotal - toNumber(booking.paidAmount));

      return tx.booking.update({
        where: { id: String(req.params.id) },
        data: {
          checkOutDate: newCheckOut,
          nights: newNights,
          roomCharge: pricing.roomCharge,
          serviceCharge: pricing.serviceCharge,
          discount: pricing.discount,
          invoiceTotal: pricing.invoiceTotal,
          outstandingBalance: newOutstanding,
          notes: reason
            ? `${booking.notes || ''}\nStay extended to ${newCheckOut.toISOString().slice(0, 10)}: ${reason}`.trim()
            : booking.notes,
        },
      });
    });

    await createAuditLog(req.user, req, {
      buildingId: result.buildingId,
      action: 'BOOKING_EXTENDED',
      entityType: 'Booking',
      entityId: result.id,
      newValue: { newCheckOutDate: newCheckOut, newNights: result.nights, reason },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Change Room ─────────────────────────────────────────────────────────────

bookingsRouter.post('/:id/change-room', canChangeRoom, async (req, res, next) => {
  try {
    const { newRoomId, reason } = z
      .object({
        newRoomId: z.string().min(1),
        reason: z.string().min(1, 'Reason required for room change'),
      })
      .parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: String(req.params.id) },
        include: { room: true, building: true },
      });

      if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 });
      if (!['Reserved', 'Confirmed', 'CheckedIn'].includes(booking.status)) {
        throw Object.assign(new Error('Can only change room on active bookings'), { statusCode: 422 });
      }

      const newRoom = await tx.room.findUnique({ where: { id: newRoomId } });
      if (!newRoom) throw Object.assign(new Error('Destination room not found'), { statusCode: 404 });
      if (newRoom.buildingId !== booking.buildingId) {
        throw Object.assign(new Error('Destination room must be in the same building'), { statusCode: 422 });
      }
      if (!newRoom.isActive) throw Object.assign(new Error('Destination room is not active'), { statusCode: 422 });
      if (newRoom.status === 'Maintenance' || newRoom.status === 'Blocked' || newRoom.status === 'Cleaning') {
        throw Object.assign(new Error(`Destination room is ${newRoom.status}`), { statusCode: 409 });
      }
      if (newRoom.id === booking.roomId) {
        throw Object.assign(new Error('Guest is already in this room'), { statusCode: 422 });
      }

      // Capacity check for new room
      if (booking.totalGuests > newRoom.capacity && !booking.capacityOverrideReason) {
        throw Object.assign(
          new Error(`Destination room capacity (${newRoom.capacity}) is less than guest count (${booking.totalGuests})`),
          { statusCode: 422 },
        );
      }

      // Availability check for new room
      const conflict = await tx.booking.findFirst({
        where: {
          id: { not: booking.id },
          roomId: newRoomId,
          status: { in: ['Reserved', 'Confirmed', 'CheckedIn'] },
          checkInDate: { lt: booking.checkOutDate },
          checkOutDate: { gt: booking.checkInDate },
        },
      });
      if (conflict) {
        throw Object.assign(new Error('Destination room is not available for this booking period'), { statusCode: 409 });
      }

      // Recalculate pricing for new room rate
      const newBaseRate = toNumber(newRoom.nonAcRate);
      const newAcSurcharge = booking.isAc ? toNumber(newRoom.acSurcharge) : 0;
      const pricing = calculatePricing({
        baseNightlyRate: newBaseRate,
        acSurchargePerNight: newAcSurcharge,
        nights: booking.nights,
        additionalCharges: toNumber(booking.additionalCharges),
        serviceChargeType: booking.serviceChargeType as 'percentage' | 'fixed' | null | undefined,
        serviceChargeValue: toNumber(booking.serviceChargeValue),
        discountType: booking.discountType as 'percentage' | 'fixed' | null | undefined,
        discountValue: toNumber(booking.discountValue),
      });

      const newOutstanding = Math.max(0, pricing.invoiceTotal - toNumber(booking.paidAmount));

      // Update old room status if checked in
      if (booking.status === 'CheckedIn') {
        await tx.room.update({ where: { id: booking.roomId }, data: { status: 'Cleaning' } });
        await tx.roomStatusHistory.create({
          data: {
            buildingId: booking.buildingId,
            roomId: booking.roomId,
            fromStatus: 'Occupied',
            toStatus: 'Cleaning',
            reason: `Guest moved to room ${newRoom.number}: ${reason}`,
            changedById: req.user!.id,
          },
        });

        await tx.room.update({ where: { id: newRoomId }, data: { status: 'Occupied' } });
        await tx.roomStatusHistory.create({
          data: {
            buildingId: booking.buildingId,
            roomId: newRoomId,
            fromStatus: newRoom.status,
            toStatus: 'Occupied',
            reason: `Guest moved from room ${booking.room.number}: ${reason}`,
            changedById: req.user!.id,
          },
        });
      }

      const updatedBooking = await tx.booking.update({
        where: { id: String(req.params.id) },
        data: {
          roomId: newRoomId,
          baseNightlyRate: newBaseRate,
          acSurchargePerNight: newAcSurcharge,
          roomCharge: pricing.roomCharge,
          serviceCharge: pricing.serviceCharge,
          discount: pricing.discount,
          invoiceTotal: pricing.invoiceTotal,
          outstandingBalance: newOutstanding,
          notes: `${booking.notes || ''}\nRoom changed from ${booking.room.number} to ${newRoom.number}: ${reason}`.trim(),
        },
      });

      return {
        booking: updatedBooking,
        oldRoomNumber: booking.room.number,
        newRoomNumber: newRoom.number,
      };
    });

    await createAuditLog(req.user, req, {
      buildingId: result.booking.buildingId,
      action: 'BOOKING_ROOM_CHANGED',
      entityType: 'Booking',
      entityId: result.booking.id,
      previousValue: { roomNumber: result.oldRoomNumber },
      newValue: { roomNumber: result.newRoomNumber, reason },
    });

    res.json(result.booking);
  } catch (err) {
    next(err);
  }
});

bookingsRouter.delete('/:id/charges/:chargeId', canManage, async (req, res, next) => {
  try {
    const bookingId = String(req.params.id);
    const chargeId = String(req.params.chargeId);

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) { res.status(404).json({ error: 'Booking not found' }); return; }
    if (booking.status === 'CheckedOut') {
      res.status(422).json({ error: 'Cannot modify charges after checkout' });
      return;
    }

    const charge = await prisma.bookingCharge.findUnique({ where: { id: chargeId } });
    if (!charge || charge.bookingId !== bookingId) {
      res.status(404).json({ error: 'Charge not found' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.bookingCharge.delete({ where: { id: chargeId } });
      return recalcBookingTotals(tx, bookingId);
    });

    await createAuditLog(req.user, req, {
      buildingId: booking.buildingId,
      action: 'CHARGE_REMOVED',
      entityType: 'Booking',
      entityId: bookingId,
      previousValue: { chargeType: charge.chargeType, amount: toNumber(charge.amount) },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});
