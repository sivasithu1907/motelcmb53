import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, canWrite, canManage } from '../middleware/auth.js';
import { createAuditLog } from '../services/audit.js';
import { toNumber } from '../services/pricing.js';

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

paymentsRouter.get('/', async (req, res, next) => {
  try {
    const { buildingId, page = '1', limit = '50', date } = req.query as Record<string, string>;

    const where: any = { isReversed: false };

    if (buildingId) {
      where.booking = { buildingId };
    } else if (req.user!.role !== 'SuperAdmin' && req.user!.role !== 'OwnerAdmin') {
      where.booking = { buildingId: { in: req.user!.buildingIds } };
    }

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.paymentDate = { gte: start, lte: end };
    }

    const [total, payments] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        orderBy: { paymentDate: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        include: {
          booking: { select: { reference: true, buildingId: true } },
          invoice: { select: { number: true } },
          collectedBy: { select: { name: true } },
        },
      }),
    ]);

    res.json({ data: payments, total });
  } catch (err) {
    next(err);
  }
});

const createPaymentSchema = z.object({
  bookingId: z.string().min(1),
  amount: z.number().positive('Amount must be positive'),
  purpose: z.enum(['Deposit', 'PartialPayment', 'FinalPayment', 'Refund']),
  method: z.enum(['Cash', 'Card', 'BankTransfer', 'Other']).default('Cash'),
  paymentDate: z.string().optional(),
  notes: z.string().optional(),
});

paymentsRouter.post('/', canWrite, async (req, res, next) => {
  try {
    const data = createPaymentSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: data.bookingId },
        include: {
          invoice: true,
          payments: { where: { isReversed: false } },
        },
      });

      if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 });

      const totalPreviouslyPaid = booking.payments.reduce((s, p) => s + toNumber(p.amount), 0);
      const invoiceTotal = toNumber(booking.invoiceTotal);

      // Validate
      if (data.purpose === 'Refund') {
        if (totalPreviouslyPaid <= 0) {
          throw Object.assign(new Error('No payments to refund'), { statusCode: 422 });
        }
        if (req.user!.role !== 'SuperAdmin' && req.user!.role !== 'OwnerAdmin' && req.user!.role !== 'BuildingManager') {
          throw Object.assign(new Error('Insufficient permissions for refund'), { statusCode: 403 });
        }
      }

      // Build payment reference
      const payCount = booking.payments.length + 1;
      const payRef = `${booking.reference}-PAY-${String(payCount).padStart(2, '0')}`;

      const payment = await tx.payment.create({
        data: {
          paymentReference: payRef,
          bookingId: data.bookingId,
          invoiceId: booking.invoice?.id,
          guestName: booking.guestName,
          amount: data.purpose === 'Refund' ? -Math.abs(data.amount) : data.amount,
          purpose: data.purpose,
          method: data.method,
          paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
          collectedById: req.user!.id,
          notes: data.notes,
        },
      });

      // Recalculate paid amount from all non-reversed payments
      const allPayments = [...booking.payments, payment];
      const newPaidAmount = allPayments.reduce((s, p) => s + toNumber(p.amount), 0);
      const newOutstanding = Math.max(0, invoiceTotal - newPaidAmount);

      await tx.booking.update({
        where: { id: data.bookingId },
        data: { paidAmount: newPaidAmount, outstandingBalance: newOutstanding },
      });

      // Update invoice
      if (booking.invoice) {
        let newStatus = booking.invoice.status;
        if (newPaidAmount <= 0) newStatus = 'Unpaid';
        else if (newPaidAmount >= invoiceTotal) newStatus = 'Paid';
        else newStatus = 'PartiallyPaid';

        await tx.invoice.update({
          where: { id: booking.invoice.id },
          data: {
            paidAmount: newPaidAmount,
            outstandingBalance: newOutstanding,
            status: newStatus,
          },
        });
      }

      return payment;
    });

    await createAuditLog(req.user, req, {
      action: 'PAYMENT_RECORDED',
      entityType: 'Payment',
      entityId: result.id,
      newValue: {
        paymentReference: result.paymentReference,
        amount: result.amount,
        purpose: result.purpose,
        method: result.method,
      },
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Reverse payment
paymentsRouter.post('/:id/reverse', canManage, async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: req.params.id },
        include: { booking: { include: { invoice: true, payments: { where: { isReversed: false } } } } },
      });

      if (!payment) throw Object.assign(new Error('Payment not found'), { statusCode: 404 });
      if (payment.isReversed) throw Object.assign(new Error('Payment already reversed'), { statusCode: 422 });

      await tx.payment.update({
        where: { id: req.params.id },
        data: { isReversed: true, reversalReason: reason, reversedAt: new Date() },
      });

      // Recalculate
      const otherPayments = payment.booking.payments.filter((p) => p.id !== payment.id);
      const newPaidAmount = otherPayments.reduce((s, p) => s + toNumber(p.amount), 0);
      const invoiceTotal = toNumber(payment.booking.invoiceTotal);
      const newOutstanding = Math.max(0, invoiceTotal - newPaidAmount);

      await tx.booking.update({
        where: { id: payment.bookingId },
        data: { paidAmount: newPaidAmount, outstandingBalance: newOutstanding },
      });

      if (payment.invoiceId) {
        const newStatus = newPaidAmount <= 0 ? 'Unpaid' : newPaidAmount >= invoiceTotal ? 'Paid' : 'PartiallyPaid';
        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: { paidAmount: newPaidAmount, outstandingBalance: newOutstanding, status: newStatus },
        });
      }

      return payment;
    });

    await createAuditLog(req.user, req, {
      action: 'PAYMENT_REVERSED',
      entityType: 'Payment',
      entityId: String(req.params.id),
      reason,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});
