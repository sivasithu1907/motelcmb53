import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, isAdmin } from '../middleware/auth.js';
import { createAuditLog } from '../services/audit.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get('/', async (req, res, next) => {
  try {
    const buildingId = req.query.buildingId as string | undefined;

    const settings = await prisma.setting.findMany({
      where: {
        organizationId: req.user!.organizationId,
        buildingId: buildingId || null,
      },
    });

    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

const settingsSchema = z.record(z.string(), z.string());

settingsRouter.put('/', isAdmin, async (req, res, next) => {
  try {
    const settings = settingsSchema.parse(req.body);
    const buildingId = req.query.buildingId as string | undefined;

    const upserts = Object.entries(settings).map(([key, value]) =>
      prisma.setting.upsert({
        where: {
          organizationId_buildingId_key: {
            organizationId: req.user!.organizationId,
            buildingId: buildingId || null,
            key,
          },
        },
        create: {
          organizationId: req.user!.organizationId,
          buildingId: buildingId || null,
          key,
          value,
        },
        update: { value },
      }),
    );

    await prisma.$transaction(upserts);

    await createAuditLog(req.user, req, {
      action: 'SETTINGS_UPDATED',
      newValue: settings,
    });

    res.json({ message: 'Settings saved' });
  } catch (err) {
    next(err);
  }
});
