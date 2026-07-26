import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, canWrite, canManage } from '../middleware/auth.js';

export const guestsRouter = Router();
guestsRouter.use(requireAuth);

function maskDocumentNumber(num: string): string {
  if (num.length <= 4) return '****';
  return '*'.repeat(num.length - 4) + num.slice(-4);
}

guestsRouter.get('/', async (req, res, next) => {
  try {
    const { search, page = '1', limit = '50' } = req.query as Record<string, string>;

    const where: any = {};
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
    const guest = await prisma.guest.findUnique({
      where: { id: req.params.id },
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

    // Mask document number in response
    const { documentNumber: _, ...safeGuest } = guest as any;
    res.json({ ...safeGuest, documentNumberMasked: guest.documentNumberMasked });
  } catch (err) {
    next(err);
  }
});

const guestSchema = z.object({
  fullName: z.string().min(1, 'Full name required'),
  documentType: z.enum(['NIC', 'Passport']).default('NIC'),
  documentNumber: z.string().min(9, 'Valid document number required'),
  mobile: z.string().min(9, 'Valid mobile number required'),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  nationality: z.string().default('Sri Lankan'),
  emergencyContactName: z.string().optional(),
  emergencyContactNumber: z.string().optional(),
  internalNotes: z.string().optional(),
});

guestsRouter.post('/', canWrite, async (req, res, next) => {
  try {
    const data = guestSchema.parse(req.body);

    // Duplicate check
    const existingByDoc = await prisma.guest.findFirst({
      where: { documentNumber: data.documentNumber },
    });

    const existingByMobile = await prisma.guest.findFirst({
      where: { mobile: data.mobile },
    });

    const duplicateWarning = existingByDoc || existingByMobile
      ? {
          duplicateFound: true,
          existingGuest: existingByDoc || existingByMobile,
          reason: existingByDoc ? 'document_number' : 'mobile',
        }
      : null;

    const guest = await prisma.guest.create({
      data: {
        ...data,
        documentNumberMasked: maskDocumentNumber(data.documentNumber),
        createdById: req.user!.id,
      },
    });

    res.status(201).json({ guest, duplicateWarning });
  } catch (err) {
    next(err);
  }
});

guestsRouter.patch('/:id', canWrite, async (req, res, next) => {
  try {
    const data = guestSchema.partial().parse(req.body);
    const updateData: any = { ...data };
    if (data.documentNumber) {
      updateData.documentNumberMasked = maskDocumentNumber(data.documentNumber);
    }

    const guest = await prisma.guest.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json(guest);
  } catch (err) {
    next(err);
  }
});
