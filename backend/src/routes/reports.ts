import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { toNumber } from '../services/pricing.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

function getBuildingFilter(req: any) {
  const buildingId = req.query.buildingId as string;
  if (buildingId) return { buildingId };
  if (req.user.role !== 'SuperAdmin' && req.user.role !== 'OwnerAdmin') {
    return { buildingId: { in: req.user.buildingIds } };
  }
  return {};
}

function parseDateRange(req: any) {
  const from = req.query.from ? new Date(req.query.from as string) : new Date(new Date().setDate(1));
  const to = req.query.to ? new Date(req.query.to as string) : new Date();
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

// Dashboard overview
reportsRouter.get('/dashboard', async (req, res, next) => {
  try {
    const buildingFilter = getBuildingFilter(req);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [rooms, checkedIn, todayCheckIns, todayCheckOuts, todayPayments, outstanding] = await Promise.all([
      prisma.room.findMany({ where: { ...buildingFilter, isActive: true } }),
      prisma.booking.findMany({
        where: { ...buildingFilter, status: 'CheckedIn' },
        select: { totalGuests: true, guestName: true, checkOutDate: true, roomId: true },
      }),
      prisma.booking.count({
        where: { ...buildingFilter, checkInDate: { gte: today, lte: todayEnd }, status: { not: 'Cancelled' } },
      }),
      prisma.booking.count({
        where: { ...buildingFilter, checkOutDate: { gte: today, lte: todayEnd }, status: { not: 'Cancelled' } },
      }),
      prisma.payment.aggregate({
        where: {
          isReversed: false,
          paymentDate: { gte: today, lte: todayEnd },
          booking: buildingFilter,
        },
        _sum: { amount: true },
      }),
      prisma.booking.aggregate({
        where: { ...buildingFilter, status: { in: ['CheckedIn', 'Reserved', 'Confirmed'] } },
        _sum: { outstandingBalance: true },
      }),
    ]);

    const occupied = rooms.filter((r) => r.status === 'Occupied').length;
    const vacant = rooms.filter((r) => r.status === 'Vacant').length;
    const cleaning = rooms.filter((r) => r.status === 'Cleaning').length;
    const maintenance = rooms.filter((r) => r.status === 'Maintenance').length;

    res.json({
      rooms: {
        total: rooms.length,
        occupied,
        vacant,
        cleaning,
        maintenance,
        occupancyRate: rooms.length > 0 ? Math.round((occupied / rooms.length) * 100) : 0,
      },
      inHouse: {
        bookings: checkedIn.length,
        guests: checkedIn.reduce((s, b) => s + b.totalGuests, 0),
      },
      today: {
        checkIns: todayCheckIns,
        checkOuts: todayCheckOuts,
        revenue: toNumber(todayPayments._sum.amount),
      },
      outstanding: toNumber(outstanding._sum.outstandingBalance),
    });
  } catch (err) {
    next(err);
  }
});

// Occupancy report
reportsRouter.get('/occupancy', async (req, res, next) => {
  try {
    const buildingFilter = getBuildingFilter(req);
    const { from, to } = parseDateRange(req);

    const bookings = await prisma.booking.findMany({
      where: {
        ...buildingFilter,
        status: { in: ['CheckedIn', 'CheckedOut', 'Confirmed'] },
        OR: [
          { checkInDate: { gte: from, lte: to } },
          { checkOutDate: { gte: from, lte: to } },
          { checkInDate: { lt: from }, checkOutDate: { gt: to } },
        ],
      },
      include: {
        room: { select: { number: true, capacity: true } },
        building: { select: { name: true, code: true } },
      },
    });

    const rooms = await prisma.room.findMany({
      where: { ...buildingFilter, isActive: true },
    });

    const totalRoomNights = rooms.length * Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    const bookedNights = bookings.reduce((s, b) => s + b.nights, 0);

    res.json({
      period: { from, to },
      totalRooms: rooms.length,
      totalRoomNights,
      bookedNights,
      occupancyRate: totalRoomNights > 0 ? Math.round((bookedNights / totalRoomNights) * 100) : 0,
      bookings: bookings.length,
    });
  } catch (err) {
    next(err);
  }
});

// Revenue report
reportsRouter.get('/revenue', async (req, res, next) => {
  try {
    const buildingFilter = getBuildingFilter(req);
    const { from, to } = parseDateRange(req);

    const [payments, bookings] = await Promise.all([
      prisma.payment.findMany({
        where: {
          isReversed: false,
          paymentDate: { gte: from, lte: to },
          booking: buildingFilter,
        },
        include: {
          booking: { select: { reference: true, buildingId: true } },
          collectedBy: { select: { name: true } },
        },
        orderBy: { paymentDate: 'desc' },
      }),
      prisma.booking.findMany({
        where: {
          ...buildingFilter,
          status: { in: ['CheckedOut', 'CheckedIn'] },
          OR: [
            { checkInDate: { gte: from } },
            { actualCheckOut: { gte: from, lte: to } },
          ],
        },
        select: {
          invoiceTotal: true,
          paidAmount: true,
          outstandingBalance: true,
          isAc: true,
          discount: true,
          serviceCharge: true,
          building: { select: { name: true } },
        },
      }),
    ]);

    const totalCollected = payments.reduce((s, p) => s + toNumber(p.amount), 0);
    const byMethod = payments.reduce((acc: any, p) => {
      acc[p.method] = (acc[p.method] || 0) + toNumber(p.amount);
      return acc;
    }, {});
    const byPurpose = payments.reduce((acc: any, p) => {
      acc[p.purpose] = (acc[p.purpose] || 0) + toNumber(p.amount);
      return acc;
    }, {});

    const totalOutstanding = bookings.reduce((s, b) => s + toNumber(b.outstandingBalance), 0);
    const totalDiscounts = bookings.reduce((s, b) => s + toNumber(b.discount), 0);
    const totalServiceCharges = bookings.reduce((s, b) => s + toNumber(b.serviceCharge), 0);
    const acBookings = bookings.filter((b) => b.isAc).length;

    res.json({
      period: { from, to },
      collected: totalCollected,
      outstanding: totalOutstanding,
      byMethod,
      byPurpose,
      discounts: totalDiscounts,
      serviceCharges: totalServiceCharges,
      acBookings,
      nonAcBookings: bookings.length - acBookings,
      payments: payments.map((p) => ({
        id: p.id,
        paymentReference: p.paymentReference,
        bookingRef: p.booking.reference,
        guestName: p.guestName,
        amount: toNumber(p.amount),
        purpose: p.purpose,
        method: p.method,
        paymentDate: p.paymentDate,
        collectedBy: p.collectedBy?.name,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Bookings summary
reportsRouter.get('/bookings', async (req, res, next) => {
  try {
    const buildingFilter = getBuildingFilter(req);
    const { from, to } = parseDateRange(req);
    const status = req.query.status as string;

    const where: any = {
      ...buildingFilter,
      createdAt: { gte: from, lte: to },
    };
    if (status) where.status = status;

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        room: { select: { number: true } },
        building: { select: { name: true, code: true } },
        createdBy: { select: { name: true } },
      },
    });

    const summary = {
      total: bookings.length,
      byStatus: bookings.reduce((acc: any, b) => {
        acc[b.status] = (acc[b.status] || 0) + 1;
        return acc;
      }, {}),
      totalRevenue: bookings.reduce((s, b) => s + toNumber(b.invoiceTotal), 0),
      acBookings: bookings.filter((b) => b.isAc).length,
    };

    res.json({ summary, bookings });
  } catch (err) {
    next(err);
  }
});

// In-house guests
reportsRouter.get('/in-house', async (req, res, next) => {
  try {
    const buildingFilter = getBuildingFilter(req);

    const bookings = await prisma.booking.findMany({
      where: { ...buildingFilter, status: 'CheckedIn' },
      include: {
        room: { select: { number: true, capacity: true } },
        building: { select: { name: true } },
        guest: { select: { fullName: true, documentNumberMasked: true, mobile: true } },
        payments: { where: { isReversed: false }, select: { amount: true } },
      },
      orderBy: { checkOutDate: 'asc' },
    });

    res.json(bookings);
  } catch (err) {
    next(err);
  }
});

// Cashier collections
reportsRouter.get('/cashier', async (req, res, next) => {
  try {
    const buildingFilter = getBuildingFilter(req);
    const { from, to } = parseDateRange(req);

    const payments = await prisma.payment.groupBy({
      by: ['collectedById'],
      where: {
        isReversed: false,
        paymentDate: { gte: from, lte: to },
        booking: buildingFilter,
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    const userIds = payments.map((p) => p.collectedById).filter(Boolean) as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });

    const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

    res.json(
      payments.map((p) => ({
        userId: p.collectedById,
        userName: userMap[p.collectedById || ''] || 'Unknown',
        totalCollected: toNumber(p._sum.amount),
        transactionCount: p._count.id,
      })),
    );
  } catch (err) {
    next(err);
  }
});
