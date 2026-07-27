import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, canManage } from '../middleware/auth.js';
import { createAuditLog } from '../services/audit.js';

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth);

invoicesRouter.get('/', async (req, res, next) => {
  try {
    const { buildingId, status, page = '1', limit = '50' } = req.query as Record<string, string>;

    const where: any = {};

    if (status) where.status = status;

    if (buildingId) {
      where.booking = { buildingId };
    } else if (req.user!.role !== 'SuperAdmin' && req.user!.role !== 'OwnerAdmin') {
      where.booking = { buildingId: { in: req.user!.buildingIds } };
    }

    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy: { issueDate: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        include: {
          booking: {
            select: {
              reference: true,
              guestName: true,
              checkInDate: true,
              checkOutDate: true,
              room: { select: { number: true } },
              building: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    res.json({ data: invoices, total });
  } catch (err) {
    next(err);
  }
});

invoicesRouter.get('/:id', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        payments: { where: { isReversed: false }, orderBy: { paymentDate: 'asc' } },
        booking: {
          include: {
            room: true,
            building: true,
            guest: { select: { fullName: true, documentNumberMasked: true, mobile: true } },
          },
        },
      },
    });

    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    res.json(invoice);
  } catch (err) {
    next(err);
  }
});

invoicesRouter.post('/:id/cancel', canManage, async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);

    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { booking: { select: { buildingId: true } } },
    });
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    if (invoice.status === 'Cancelled') { res.status(422).json({ error: 'Already cancelled' }); return; }

    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        status: 'Cancelled',
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });

    await createAuditLog(req.user, req, {
      buildingId: invoice.booking.buildingId,
      action: 'INVOICE_CANCELLED',
      entityType: 'Invoice',
      entityId: String(req.params.id),
      reason,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});
