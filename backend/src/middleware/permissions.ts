/**
 * Centralized permission system for Motel CMB 53.
 *
 * Replaces the broad canWrite / canManage guards with action-specific
 * middleware so the intent at each route is explicit and auditable.
 *
 * Role hierarchy (higher overrides lower):
 *   SuperAdmin (100) > OwnerAdmin (90) > BuildingManager (70)
 *   > Operator (50) > Cashier (40) > ReadOnly (10)
 */

import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types.js';

const roleHierarchy: Record<UserRole, number> = {
  SuperAdmin: 100,
  OwnerAdmin: 90,
  BuildingManager: 70,
  Operator: 50,
  Cashier: 40,
  ReadOnly: 10,
};

function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const userLevel = roleHierarchy[req.user.role] ?? 0;
    const minRequired = Math.min(...roles.map((r) => roleHierarchy[r] ?? 999));
    if (userLevel >= minRequired) {
      next();
    } else {
      res.status(403).json({
        error: `This action requires one of: ${roles.join(', ')}. Your role: ${req.user.role}`,
      });
    }
  };
}

// ─── Booking Operations ──────────────────────────────────────────────────────

/** Operators and above can create reservations. Cashiers cannot. */
export const canCreateBooking = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager', 'Operator',
);

/** Operators and above can edit bookings. */
export const canEditBooking = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager', 'Operator',
);

/** Only managers and above can cancel bookings. */
export const canCancelBooking = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager',
);

/** Operators and above can check guests in. */
export const canCheckIn = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager', 'Operator',
);

/** Operators and above can check guests out. */
export const canCheckOut = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager', 'Operator',
);

/** Only managers and above may override the room rate. */
export const canOverrideRate = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager',
);

/** Only managers and above may apply discounts. */
export const canApplyDiscount = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager',
);

/** Extend stay requires manager authority. */
export const canExtendStay = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager', 'Operator',
);

/** Change room requires manager authority. */
export const canChangeRoom = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager',
);

/** Add ad-hoc booking charges — operators and above. */
export const canAddBookingCharge = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager', 'Operator',
);

/** Mark no-show — managers and above. */
export const canMarkNoShow = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager',
);

// ─── Payment Operations ──────────────────────────────────────────────────────

/** Cashiers and above can record payments. */
export const canRecordPayment = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager', 'Operator', 'Cashier',
);

/** Only managers and above can process refunds. */
export const canProcessRefund = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager',
);

/** Only managers and above can reverse payments. */
export const canReversePayment = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager',
);

// ─── Room Operations ─────────────────────────────────────────────────────────

/** Operators and above can manage rooms (create, edit). */
export const canManageRooms = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager',
);

/** Operators and above can update room status through permitted workflows. */
export const canUpdateRoomStatus = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager', 'Operator',
);

// ─── Guest & Document Operations ─────────────────────────────────────────────

/** Operators and above can register and edit guests. */
export const canManageGuests = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager', 'Operator',
);

/** Operators and above can view identity documents. */
export const canViewDocuments = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager', 'Operator',
);

/** Operators and above can upload identity documents. */
export const canUploadDocuments = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager', 'Operator',
);

// ─── Administrative Operations ───────────────────────────────────────────────

/** Only admins can manage users. */
export const canManageUsers = requireRole('SuperAdmin', 'OwnerAdmin');

/** Only admins can change system settings. */
export const canManageSettings = requireRole('SuperAdmin', 'OwnerAdmin');

/** Managers and above can view audit logs. */
export const canViewAuditLog = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager',
);

/** Managers and above can access reports. ReadOnly users can view but not act. */
export const canViewReports = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager', 'Operator', 'Cashier', 'ReadOnly',
);

/** Only managers and above can manage employees. */
export const canManageEmployees = requireRole(
  'SuperAdmin', 'OwnerAdmin', 'BuildingManager',
);

// ─── Building Access Guard ───────────────────────────────────────────────────

/**
 * Verifies the authenticated user belongs to the same organization as the
 * requested building, and has been granted access to it (unless SuperAdmin /
 * OwnerAdmin, who have org-wide access).
 *
 * Reads buildingId from:  req.params.buildingId  |  req.body.buildingId  |  req.query.buildingId
 */
export function requireBuildingAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // SuperAdmin and OwnerAdmin have unrestricted access
  if (req.user.role === 'SuperAdmin' || req.user.role === 'OwnerAdmin') {
    next();
    return;
  }

  const buildingId =
    (req.params.buildingId as string | undefined) ||
    (req.body?.buildingId as string | undefined) ||
    (req.query?.buildingId as string | undefined);

  if (buildingId && !req.user.buildingIds.includes(buildingId)) {
    res.status(403).json({ error: 'You do not have access to this building' });
    return;
  }

  next();
}
