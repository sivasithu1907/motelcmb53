import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { canManageGuests } from '../middleware/permissions.js';

export const guestsRouter = Router();
guestsRouter.use(requireAuth);

function maskDocumentNumber(num: string): string {
  if (num.length <= 4) return '****';
  return '*'.repeat(num.length - 4) + num.slice(-4);
}

/** Derive the user's organizationId from auth context. */
function getOrgId(req: any): string {
  return req.user.organizationId;
}

guestsRouter.get('/', async (req, res, next) => {
  try {
    const { search, page = '1', limit = '50' } = req.query as Record<string, string>;
    const orgId = getOrgId(req);

    const where: any = { organizationId: orgId };
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { mobile: { contains: search } },
        { documentNumberMasked: { contains: search } },
      ];
    }

    const [total, guests] = await Promise.all([
      prisma.guest.count({ where }),
      prisma.guest.findMany({
        where,
        orderBy: { fullName: 'asc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        select: {
          id: true,
          fullName: true,
          documentType: true,
          documentNumberMasked: true,
          mobile: true,
          nationality: true,
          status: true,
          createdAt: true,
          _count: { select: { bookings: true } },
        },
      }),
    ]);

    res.json({ data: guests, total });
  } catch (err) {
    next(err);
  }
});

guestsRouter.get('/:id', async (req, res, next) => {
  try {
    const orgId = getOrgId(req);

    const guest = await prisma.guest.findUnique({
      where: { id: String(req.params.id) },
      include: {
        bookings: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { room: { select: { number: true } }, building: { select: { name: true } } },
        },
        documents: {
          select: {
            id: true,
            side: true,
            originalFilename: true,
            mimeType: true,
            fileSize: true,
            uploadedAt: true,
          },
        },
      },
    });

    if (!guest) { res.status(404).json({ error: 'Guest not found' }); return; }

    // Organization gate: prevent cross-org data access
    if (guest.organizationId !== orgId && req.user!.role !== 'SuperAdmin') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Never return the raw document number in list/detail views
    const { documentNumber: _raw, ...safeGuest } = guest as any;
    res.json({ ...safeGuest, documentNumberMasked: guest.documentNumberMasked });
  } catch (err) {
    next(err);
  }
});

const guestSchema = z.object({
  fullName: z.string().min(1, 'Full name required'),
  documentType: z.enum(['NIC', 'Passport']).default('NIC'),
  documentNumber: z.string().min(9, 'Valid document number required (min 9 characters)'),
  mobile: z.string().min(9, 'Valid mobile number required'),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  nationality: z.string().default('Sri Lankan'),
  emergencyContactName: z.string().optional(),
  emergencyContactNumber: z.string().optional(),
  internalNotes: z.string().optional(),
});

guestsRouter.post('/', canManageGuests, async (req, res, next) => {
  try {
    const data = guestSchema.parse(req.body);
    const orgId = getOrgId(req);

    // Org-scoped duplicate check — return only limited info to avoid leaking full records
    const existingByDoc = await prisma.guest.findFirst({
      where: { organizationId: orgId, documentNumber: data.documentNumber },
      select: { id: true, fullName: true, documentNumberMasked: true, mobile: true },
    });

    const existingByMobile = await prisma.guest.findFirst({
      where: { organizationId: orgId, mobile: data.mobile },
      select: { id: true, fullName: true, documentNumberMasked: true, mobile: true },
    });

    const duplicateWarning = existingByDoc || existingByMobile
      ? {
          duplicateFound: true,
          existingGuestId: (existingByDoc || existingByMobile)!.id,
          maskedName: (existingByDoc || existingByMobile)!.fullName.replace(/(?<=.).(?=.*\s)/g, '*'),
          maskedDocument: (existingByDoc || existingByMobile)!.documentNumberMasked,
          reason: existingByDoc ? 'document_number' : 'mobile',
        }
      : null;

    const guest = await prisma.guest.create({
      data: {
        organizationId: orgId,
        ...data,
        documentNumberMasked: maskDocumentNumber(data.documentNumber!),
        createdById: req.user!.id,
      } as any,
    });

    // Return masked document number, never raw
    const { documentNumber: _raw, ...safeGuest } = guest as any;
    res.status(201).json({ guest: safeGuest, duplicateWarning });
  } catch (err) {
    next(err);
  }
});

guestsRouter.patch('/:id', canManageGuests, async (req, res, next) => {
  try {
    const orgId = getOrgId(req);

    const existing = await prisma.guest.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) { res.status(404).json({ error: 'Guest not found' }); return; }
    if (existing.organizationId !== orgId && req.user!.role !== 'SuperAdmin') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const data = guestSchema.partial().parse(req.body);
    const updateData: any = { ...data };
    if (data.documentNumber) {
      updateData.documentNumberMasked = maskDocumentNumber(data.documentNumber);
    }

    const guest = await prisma.guest.update({
      where: { id: String(req.params.id) },
      data: updateData,
    });

    const { documentNumber: _raw, ...safeGuest } = guest as any;
    res.json(safeGuest);
  } catch (err) {
    next(err);
  }
});
