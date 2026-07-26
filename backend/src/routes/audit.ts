import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, canManage } from '../middleware/auth.js';

export const auditRouter = Router();
auditRouter.use(requireAuth, canManage);

auditRouter.get('/', async (req, res, next) => {
  try {
    const { buildingId, action, userId, page = '1', limit = '50' } = req.query as Record<string, string>;

    const where: any = {};
    if (buildingId) where.buildingId = buildingId;
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (userId) where.userId = userId;

    // Limit to org
    where.organizationId = req.user!.organizationId;

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        include: {
          user: { select: { name: true, email: true } },
          building: { select: { name: true, code: true } },
        },
      }),
    ]);

    res.json({ data: logs, total });
  } catch (err) {
    next(err);
  }
});
