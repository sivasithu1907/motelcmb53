import { Router } from 'express';
import { z } from 'zod';
import * as argon2 from 'argon2';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { createAuditLog } from '../services/audit.js';
import { createId } from '@paralleldrive/cuid2';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
});

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { buildingAccess: true },
    });

    if (!user || !user.isActive) {
      // Constant-time response to prevent enumeration
      await new Promise((r) => setTimeout(r, 200));
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      await createAuditLog(undefined, req, {
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        newValue: { email, reason: 'Bad password' },
      });
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Create session
    const sessionId = createId();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    await prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        data: JSON.stringify({ userId: user.id }),
        expiresAt,
      },
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await createAuditLog(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        buildingIds: user.buildingAccess.map((a) => a.buildingId),
      },
      req,
      { action: 'LOGIN_SUCCESS', entityType: 'User', entityId: user.id },
    );

    res.cookie('session_token', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: SESSION_DURATION_MS,
      path: '/',
    });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        buildingIds: user.buildingAccess.map((a) => a.buildingId),
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const sessionToken = req.cookies?.session_token;
    if (sessionToken) {
      await prisma.session.deleteMany({ where: { id: sessionToken } });
    }
    res.clearCookie('session_token');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});
