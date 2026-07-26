import { prisma } from '../lib/prisma.js';
import { Request } from 'express';
import { AuthUser } from '../middleware/auth.js';

export interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string;
  buildingId?: string;
  previousValue?: object;
  newValue?: object;
  reason?: string;
}

export async function createAuditLog(
  user: AuthUser | undefined,
  req: Request,
  entry: AuditEntry,
) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: user?.organizationId,
        buildingId: entry.buildingId,
        userId: user?.id,
        userRole: user?.role,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        previousValue: entry.previousValue as any,
        newValue: entry.newValue as any,
        reason: entry.reason,
        ipAddress: req.ip,
        sessionId: req.cookies?.session_token,
      },
    });
  } catch (err) {
    // Non-fatal: log to console but don't fail the request
    console.error('[AuditLog] Failed to create audit entry:', err);
  }
}
