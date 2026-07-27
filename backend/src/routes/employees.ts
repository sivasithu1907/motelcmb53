import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, canManage } from '../middleware/auth.js';

export const employeesRouter = Router();
employeesRouter.use(requireAuth);

employeesRouter.get('/', async (req, res, next) => {
  try {
    const { buildingId } = req.query as Record<string, string>;
    const where: any = {};

    if (buildingId) {
      where.buildingId = buildingId;
    } else if (req.user!.role !== 'SuperAdmin' && req.user!.role !== 'OwnerAdmin') {
      where.buildingId = { in: req.user!.buildingIds };
    }

    const employees = await prisma.employee.findMany({
      where,
      orderBy: { fullName: 'asc' },
      include: {
        building: { select: { name: true, code: true } },
        user: { select: { email: true, role: true } },
      },
    });

    res.json(employees);
  } catch (err) {
    next(err);
  }
});

const employeeSchema = z.object({
  buildingId: z.string().min(1),
  fullName: z.string().min(1),
  mobile: z.string().min(9),
  nic: z.string().min(9),
  jobTitle: z.string().min(1),
  joiningDate: z.string(),
  status: z.enum(['Active', 'Inactive', 'Terminated']).default('Active'),
  emergencyContact: z.string().optional(),
  notes: z.string().optional(),
});

employeesRouter.post('/', canManage, async (req, res, next) => {
  try {
    const data = employeeSchema.parse(req.body);
    const employee = await prisma.employee.create({
      data: { ...data, joiningDate: new Date(data.joiningDate) } as any,
      include: { building: { select: { name: true } } },
    });
    res.status(201).json(employee);
  } catch (err) {
    next(err);
  }
});

employeesRouter.patch('/:id', canManage, async (req, res, next) => {
  try {
    const data = employeeSchema.partial().parse(req.body);
    const employee = await prisma.employee.update({
      where: { id: String(req.params.id) },
      data: { ...data, joiningDate: data.joiningDate ? new Date(data.joiningDate) : undefined } as any,
    });
    res.json(employee);
  } catch (err) {
    next(err);
  }
});
