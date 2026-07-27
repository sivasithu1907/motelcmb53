import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { canManageRooms, canUpdateRoomStatus } from '../middleware/permissions.js';
import { createAuditLog } from '../services/audit.js';
import { RoomStatus } from '../types.js';

// Legacy aliases for existing route uses
const canManage = canManageRooms;
const canWrite = canUpdateRoomStatus;

export const roomsRouter = Router();
roomsRouter.use(requireAuth);

roomsRouter.get('/', async (req, res, next) => {
  try {
    const buildingId = req.query.buildingId as string;
    const where: any = {};

    if (buildingId) {
      where.buildingId = buildingId;
    } else if (req.user!.role !== 'SuperAdmin' && req.user!.role !== 'OwnerAdmin') {
      where.buildingId = { in: req.user!.buildingIds };
    }

    const rooms = await prisma.room.findMany({
      where: { ...where, isActive: true },
      orderBy: [{ buildingId: 'asc' }, { number: 'asc' }],
      include: {
        bookings: {
          where: {
            status: { in: ['CheckedIn', 'Reserved', 'Confirmed'] },
          },
          orderBy: { checkInDate: 'asc' },
          take: 1,
          include: { guest: { select: { fullName: true } } },
        },
      },
    });

    // Numeric room-number ordering (room numbers stored as strings: "1", "2", ..., "12")
    rooms.sort((a, b) => {
      if (a.buildingId !== b.buildingId) return a.buildingId < b.buildingId ? -1 : 1;
      const na = parseInt(a.number, 10);
      const nb = parseInt(b.number, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.number.localeCompare(b.number, undefined, { numeric: true });
    });

    res.json(rooms);
  } catch (err) {
    next(err);
  }
});

// Check room availability for a date range
roomsRouter.get('/availability', async (req, res, next) => {
  try {
    const { buildingId, checkIn, checkOut, excludeBookingId } = req.query as Record<string, string>;

    if (!buildingId || !checkIn || !checkOut) {
      res.status(400).json({ error: 'buildingId, checkIn and checkOut required' });
      return;
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (checkInDate >= checkOutDate) {
      res.status(400).json({ error: 'Check-out must be after check-in' });
      return;
    }

    // Find rooms with conflicting bookings
    const conflictingBookingWhere: any = {
      roomId: { not: undefined },
      status: { in: ['Reserved', 'Confirmed', 'CheckedIn'] },
      checkInDate: { lt: checkOutDate },
      checkOutDate: { gt: checkInDate },
    };

    if (excludeBookingId) {
      conflictingBookingWhere.id = { not: excludeBookingId };
    }

    const conflictingBookings = await prisma.booking.findMany({
      where: conflictingBookingWhere,
      select: { roomId: true },
    });

    const blockedRoomIds = new Set(conflictingBookings.map((b) => b.roomId));

    // Get all rooms in building
    const rooms = await prisma.room.findMany({
      where: { buildingId, isActive: true },
      orderBy: { number: 'asc' },
    });

    // Numeric room-number ordering
    rooms.sort((a, b) => {
      const na = parseInt(a.number, 10);
      const nb = parseInt(b.number, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.number.localeCompare(b.number, undefined, { numeric: true });
    });

    const result = rooms.map((room) => ({
      ...room,
      isAvailable:
        !blockedRoomIds.has(room.id) &&
        room.status !== 'Maintenance' &&
        room.status !== 'Blocked' &&
        room.status !== 'Cleaning',
      conflictReason: blockedRoomIds.has(room.id)
        ? 'Booking conflict'
        : room.status === 'Maintenance'
          ? 'Under maintenance'
          : room.status === 'Blocked'
            ? 'Blocked'
            : room.status === 'Cleaning'
              ? 'Under cleaning'
              : null,
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

roomsRouter.get('/:id', async (req, res, next) => {
  try {
    const room = await prisma.room.findUnique({
      where: { id: req.params.id },
      include: {
        bookings: {
          where: { status: { in: ['CheckedIn', 'Reserved', 'Confirmed'] } },
          orderBy: { checkInDate: 'asc' },
          take: 3,
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!room) { res.status(404).json({ error: 'Room not found' }); return; }
    res.json(room);
  } catch (err) {
    next(err);
  }
});

const roomSchema = z.object({
  buildingId: z.string(),
  number: z.string().min(1),
  capacity: z.number().int().min(1).max(20),
  nonAcRate: z.number().positive(),
  acSurcharge: z.number().min(0).optional(),
  maintenanceNote: z.string().optional(),
});

roomsRouter.post('/', canManage, async (req, res, next) => {
  try {
    const data = roomSchema.parse(req.body);
    const room = await prisma.room.create({ data });
    res.status(201).json(room);
  } catch (err) {
    next(err);
  }
});

roomsRouter.patch('/:id', canManage, async (req, res, next) => {
  try {
    const data = roomSchema.partial().omit({ buildingId: true }).parse(req.body);
    const room = await prisma.room.update({
      where: { id: req.params.id },
      data,
    });
    res.json(room);
  } catch (err) {
    next(err);
  }
});

const statusChangeSchema = z.object({
  status: z.nativeEnum(RoomStatus),
  reason: z.string().optional(),
  notes: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * Controlled room status transition table.
 * Occupied and Cleaning statuses are set ONLY by booking workflows (check-in / checkout).
 * This endpoint handles operator-initiated transitions: maintenance, blocking, cleaning completion.
 *
 * Allowed via this endpoint:
 *   Vacant    → Maintenance | Blocked
 *   Cleaning  → Vacant (cleaning complete)
 *   Maintenance → Cleaning | Vacant
 *   Blocked   → Vacant
 *   Occupied  → (NONE — must go through checkout)
 */
const ALLOWED_MANUAL_TRANSITIONS: Partial<Record<RoomStatus, RoomStatus[]>> = {
  Vacant: ['Maintenance', 'Blocked'],
  Cleaning: ['Vacant'],
  Maintenance: ['Cleaning', 'Vacant'],
  Blocked: ['Vacant'],
};

roomsRouter.patch('/:id/status', canWrite, async (req, res, next) => {
  try {
    const { status, reason, notes, startDate, endDate } = statusChangeSchema.parse(req.body);

    const current = await prisma.room.findUnique({ where: { id: req.params.id } });
    if (!current) { res.status(404).json({ error: 'Room not found' }); return; }

    // Occupied rooms can never be manually changed — they must go through checkout
    if (current.status === 'Occupied') {
      res.status(422).json({
        error: 'Occupied rooms cannot have their status changed manually. Process a checkout first.',
      });
      return;
    }

    // Validate transition (SuperAdmin may override for emergency corrections)
    const allowed = ALLOWED_MANUAL_TRANSITIONS[current.status] ?? [];
    const isSuperAdmin = req.user!.role === 'SuperAdmin';
    if (!allowed.includes(status) && !isSuperAdmin) {
      res.status(422).json({
        error: `Cannot manually change status from '${current.status}' to '${status}'. Allowed: ${allowed.join(', ') || 'none (use booking workflow)'}`,
      });
      return;
    }

    // Maintenance or Blocked requires a reason
    if ((status === 'Maintenance' || status === 'Blocked') && !reason) {
      res.status(400).json({ error: `A reason is required when setting status to ${status}` });
      return;
    }

    const [room] = await prisma.$transaction([
      prisma.room.update({
        where: { id: req.params.id },
        data: { status, maintenanceNote: status === 'Maintenance' ? (notes || reason) : null },
      }),
      prisma.roomStatusHistory.create({
        data: {
          buildingId: current.buildingId,
          roomId: current.id,
          fromStatus: current.status,
          toStatus: status,
          reason,
          notes,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          changedById: req.user!.id,
        },
      }),
    ]);

    await createAuditLog(req.user, req, {
      action: 'ROOM_STATUS_CHANGED',
      entityType: 'Room',
      entityId: current.id,
      buildingId: current.buildingId,
      previousValue: { status: current.status },
      newValue: { status },
      reason,
    });

    res.json(room);
  } catch (err) {
    next(err);
  }
});
