import { Router } from 'express';
import { z } from 'zod';
import * as argon2 from 'argon2';
import { prisma } from '../lib/prisma.js';
import { requireAuth, isAdmin, canManage } from '../middleware/auth.js';
import { createAuditLog } from '../services/audit.js';
import { UserRole } from '../types';

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get('/', canManage, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { organizationId: req.user!.organizationId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        buildingAccess: { include: { building: { select: { name: true, code: true } } } },
      },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.nativeEnum(UserRole),
  buildingIds: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

usersRouter.post('/', isAdmin, async (req, res, next) => {
  try {
    const data = createUserSchema.parse(req.body);
    const passwordHash = await argon2.hash(data.password);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash,
        role: data.role,
        isActive: data.isActive,
        organizationId: req.user!.organizationId,
        buildingAccess: {
          create: data.buildingIds.map((bid) => ({ buildingId: bid })),
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await createAuditLog(req.user, req, {
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: user.id,
      newValue: { name: user.name, email: user.email, role: user.role },
    });

    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
  buildingIds: z.array(z.string()).optional(),
  password: z.string().min(8).optional(),
});

usersRouter.patch('/:id', isAdmin, async (req, res, next) => {
  try {
    const data = updateUserSchema.parse(req.body);
    const updateData: any = {};

    if (data.name) updateData.name = data.name;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.password) updateData.passwordHash = await argon2.hash(data.password);

    const prev = await prisma.user.findUnique({ where: { id: req.params.id } });

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...updateData,
        ...(data.buildingIds !== undefined
          ? {
              buildingAccess: {
                deleteMany: {},
                create: data.buildingIds.map((bid) => ({ buildingId: bid })),
              },
            }
          : {}),
      },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    await createAuditLog(req.user, req, {
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: String(req.params.id),
      previousValue: { role: prev?.role, isActive: prev?.isActive },
      newValue: { role: user.role, isActive: user.isActive },
    });

    res.json(user);
  } catch (err) {
    next(err);
  }
});
