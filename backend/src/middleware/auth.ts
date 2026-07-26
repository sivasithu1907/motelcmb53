import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { UserRole } from '../types';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId: string;
  buildingIds: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionToken = req.cookies?.session_token;

  if (!sessionToken) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const session = await prisma.session.findFirst({
      where: {
        id: sessionToken,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          include: {
            buildingAccess: true,
          },
        },
      },
    });

    if (!session || !session.user.isActive) {
      res.clearCookie('session_token');
      res.status(401).json({ error: 'Session expired or invalid' });
      return;
    }

    req.user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
      organizationId: session.user.organizationId,
      buildingIds: session.user.buildingAccess.map((a) => a.buildingId),
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
}

// Role hierarchy
const roleHierarchy: Record<UserRole, number> = {
  SuperAdmin: 100,
  OwnerAdmin: 90,
  BuildingManager: 70,
  Operator: 50,
  Cashier: 40,
  ReadOnly: 10,
};

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userLevel = roleHierarchy[req.user.role] ?? 0;
    const minRequired = Math.min(...roles.map((r) => roleHierarchy[r] ?? 999));

    if (userLevel >= minRequired) {
      next();
    } else {
      res.status(403).json({ error: 'Insufficient permissions' });
    }
  };
}

export function requireBuildingAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // SuperAdmin and OwnerAdmin have access to all buildings
  if (req.user.role === 'SuperAdmin' || req.user.role === 'OwnerAdmin') {
    next();
    return;
  }

  const buildingId = req.params.buildingId || req.body?.buildingId || req.query?.buildingId as string;

  if (buildingId && !req.user.buildingIds.includes(buildingId)) {
    res.status(403).json({ error: 'No access to this building' });
    return;
  }

  next();
}

export const canWrite = requireRole(
  'SuperAdmin',
  'OwnerAdmin',
  'BuildingManager',
  'Operator',
  'Cashier',
);

export const canManage = requireRole(
  'SuperAdmin',
  'OwnerAdmin',
  'BuildingManager',
);

export const isAdmin = requireRole('SuperAdmin', 'OwnerAdmin');
