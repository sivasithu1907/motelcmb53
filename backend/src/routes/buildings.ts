import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, isAdmin, canManage } from '../middleware/auth.js';

export const buildingsRouter = Router();
buildingsRouter.use(requireAuth);

buildingsRouter.get('/', async (req, res, next) => {
  try {
    const { user } = req;
    let buildings;

    if (user!.role === 'SuperAdmin' || user!.role === 'OwnerAdmin') {
      buildings = await prisma.building.findMany({
        where: { organizationId: user!.organizationId },
        orderBy: { code: 'asc' },
      });
    } else {
      buildings = await prisma.building.findMany({
        where: {
          organizationId: user!.organizationId,
          id: { in: user!.buildingIds },
          isActive: true,
        },
        orderBy: { code: 'asc' },
      });
    }

    res.json(buildings);
  } catch (err) {
    next(err);
  }
});

buildingsRouter.get('/:id', async (req, res, next) => {
  try {
    const building = await prisma.building.findUnique({
      where: { id: String(req.params.id) },
      include: { rooms: { orderBy: { number: 'asc' } } },
    });
    if (!building) { res.status(404).json({ error: 'Building not found' }); return; }
    res.json(building);
  } catch (err) {
    next(err);
  }
});

const buildingSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().min(1),
  contactNumbers: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  bookingPrefix: z.string().optional(),
  invoicePrefix: z.string().optional(),
});

buildingsRouter.post('/', isAdmin, async (req, res, next) => {
  try {
    const data = buildingSchema.parse(req.body);
    const building = await prisma.building.create({
      data: {
        ...data,
        organizationId: req.user!.organizationId,
        contactNumbers: data.contactNumbers || [],
      } as any,
    });
    res.status(201).json(building);
  } catch (err) {
    next(err);
  }
});

buildingsRouter.patch('/:id', canManage, async (req, res, next) => {
  try {
    const data = buildingSchema.partial().parse(req.body);
    const building = await prisma.building.update({
      where: { id: String(req.params.id) },
      data: data as any,
    });
    res.json(building);
  } catch (err) {
    next(err);
  }
});
