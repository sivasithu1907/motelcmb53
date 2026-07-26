import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, canWrite, canManage } from '../middleware/auth.js';
import { calculatePricing, toNumber } from '../services/pricing.js';
import { createAuditLog } from '../services/audit.js';
import { BookingStatus, RoomStatus } from '../types';
import { differenceInCalendarDays } from 'date-fns';

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
          guest: { select: { fullName: true, documentNumber: true, documentNumberMasked: true } },
          invoice: { select: { id: true, number: true, status: true } },
          payments: { where: { isReversed: false }, select: { amount: true, purpose: true } },
          building: { select: { name: true, code: true } },
        },
      }),
    ]);

    res.json({ data: bookings, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

bookingsRouter.get('/:id', async (req, res, next) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
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
    res.json(booking);
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
  checkInDate: z.string().min(1),
  checkOutDate: z.string().min(1),
  adults: z.number().int().min(1),
  children: z.number().int().min(0).default(0),
  isAc: z.boolean().default(false),
  discountType: z.enum(['percentage', 'fixed']).nullable().optional(),
  discountValue: z.number().min(0).optional(),
  serviceChargeType: z.enum(['percentage', 'fixed']).nullable().optional(),
  serviceChargeValue: z.number().min(0).optional(),
  depositAmount: z.number().min(0).optional(),
  depositMethod: z.enum(['Cash', 'Card', 'BankTransfer', 'Other']).optional(),
  notes: z.string().optional(),
  status: z.enum(['Reserved', 'Confirmed', 'CheckedIn']).default('Reserved'),
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

      // Pricing
      const pricing = calculatePricing({
        baseNightlyRate: toNumber(room.nonAcRate),
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

      const booking = await tx.booking.create({
        data: {
          reference,
          buildingId: data.buildingId,
          roomId: data.roomId,
          guestId: data.guestId,
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
          actualCheckIn: data.status === 'CheckedIn' ? new Date() : undefined,
          checkedInById: data.status === 'CheckedIn' ? req.user!.id : undefined,
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

      // If checking in immediately, update room status
      if (data.status === 'CheckedIn') {
        await tx.room.update({ where: { id: data.roomId }, data: { status: 'Occupied' } });
        await tx.roomStatusHistory.create({
          data: {
            buildingId: data.buildingId,
            roomId: data.roomId,
            fromStatus: room.status,
            toStatus: 'Occupied',
            reason: 'Check-in',
            changedById: req.user!.id,
          },
        });
      }

      return { booking, pricing };
    });

    await createAuditLog(req.user, req, {
      action: 'BOOKING_CREATED',
      entityType: 'Booking',
      entityId: result.booking.id,
      buildingId: data.buildingId,
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
        where: { id: req.params.id },
        include: {
          guest: { include: { documents: true } },
          room: true,
        },
      });

      if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 });
      if (booking.status !== 'Reserved' && booking.status !== 'Confirmed') {
        throw Object.assign(new Error(`Cannot check in: booking is ${booking.status}`), { statusCode: 422 });
      }

      // Document check
      if (booking.guest) {
        const hasFrontDoc = booking.guest.documents.some((d) => d.side === 'front');
        if (!hasFrontDoc) {
          throw Object.assign(new Error('Identity document (front) required before check-in'), { statusCode: 422 });
        }
      } else {
        // Walk-in without guest record - check if mobile and doc number set
        if (!booking.guestMobile) {
          throw Object.assign(new Error('Guest mobile number required before check-in'), { statusCode: 422 });
        }
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
        throw Object.assign(new Error('Room is currently occupied by another guest'), { statusCode: 409 });
      }

      const updatedBooking = await tx.booking.update({
        where: { id: req.params.id },
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
    const { overrideReason, additionalCharges: extraCharges } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: req.params.id },
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
        where: { id: req.params.id },
        data: {
          status: 'CheckedOut',
          actualCheckOut: new Date(),
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

    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) { res.status(404).json({ error: 'Booking not found' }); return; }
    if (booking.status === 'CheckedIn' || booking.status === 'CheckedOut') {
      res.status(422).json({ error: 'Cannot cancel a checked-in or checked-out booking' });
      return;
    }

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: { status: 'Cancelled', cancellationReason: reason },
    });

    await createAuditLog(req.user, req, {
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

    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) { res.status(404).json({ error: 'Booking not found' }); return; }
    if (booking.status !== 'Reserved' && booking.status !== 'Confirmed') {
      res.status(422).json({ error: 'Can only mark Reserved/Confirmed bookings as No Show' });
      return;
    }

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: { status: 'NoShow', cancellationReason: reason },
    });

    await createAuditLog(req.user, req, {
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
