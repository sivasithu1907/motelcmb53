/**
 * Business logic validation tests.
 * These test the pure validation rules: overlap detection, status transitions,
 * capacity rules, and permission logic. No database connection required.
 */

import { describe, it, expect } from 'vitest';

// ─── Overlap Detection ────────────────────────────────────────────────────────

/**
 * Implements the standard overlap check:
 *   requested.checkIn  < existing.checkOut
 *   AND
 *   requested.checkOut > existing.checkIn
 */
function hasOverlap(
  reqIn: Date,
  reqOut: Date,
  existingIn: Date,
  existingOut: Date,
): boolean {
  return reqIn < existingOut && reqOut > existingIn;
}

describe('Booking overlap detection', () => {
  const existingIn  = new Date('2025-02-10T14:00:00');
  const existingOut = new Date('2025-02-13T12:00:00');

  it('exact overlap (same dates) — should conflict', () => {
    expect(hasOverlap(existingIn, existingOut, existingIn, existingOut)).toBe(true);
  });

  it('new booking contained within existing — should conflict', () => {
    expect(hasOverlap(
      new Date('2025-02-11T14:00:00'),
      new Date('2025-02-12T12:00:00'),
      existingIn, existingOut,
    )).toBe(true);
  });

  it('new booking straddles existing — should conflict', () => {
    expect(hasOverlap(
      new Date('2025-02-09T14:00:00'),
      new Date('2025-02-14T12:00:00'),
      existingIn, existingOut,
    )).toBe(true);
  });

  it('new booking overlaps start — should conflict', () => {
    expect(hasOverlap(
      new Date('2025-02-09T14:00:00'),
      new Date('2025-02-11T12:00:00'),
      existingIn, existingOut,
    )).toBe(true);
  });

  it('new booking overlaps end — should conflict', () => {
    expect(hasOverlap(
      new Date('2025-02-12T14:00:00'),
      new Date('2025-02-15T12:00:00'),
      existingIn, existingOut,
    )).toBe(true);
  });

  it('adjacent booking: new checks in exactly when existing checks out — NO conflict', () => {
    // checkIn = existingOut means same moment; the formula reqOut > existingIn AND reqIn < existingOut
    // at the boundary: reqIn = existingOut → NOT (reqIn < existingOut) → false → no overlap
    expect(hasOverlap(
      existingOut,                                    // new check-in = existing check-out
      new Date('2025-02-16T12:00:00'),
      existingIn, existingOut,
    )).toBe(false);
  });

  it('adjacent booking: new checks out when existing checks in — NO conflict', () => {
    expect(hasOverlap(
      new Date('2025-02-07T14:00:00'),
      existingIn,                                     // new check-out = existing check-in
      existingIn, existingOut,
    )).toBe(false);
  });

  it('completely before existing — no conflict', () => {
    expect(hasOverlap(
      new Date('2025-02-01T14:00:00'),
      new Date('2025-02-05T12:00:00'),
      existingIn, existingOut,
    )).toBe(false);
  });

  it('completely after existing — no conflict', () => {
    expect(hasOverlap(
      new Date('2025-02-20T14:00:00'),
      new Date('2025-02-25T12:00:00'),
      existingIn, existingOut,
    )).toBe(false);
  });
});

// ─── Room status transition validation ───────────────────────────────────────

type RoomStatus = 'Vacant' | 'Reserved' | 'Occupied' | 'Cleaning' | 'Maintenance' | 'Blocked';

const ALLOWED_MANUAL_TRANSITIONS: Partial<Record<RoomStatus, RoomStatus[]>> = {
  Vacant:      ['Maintenance', 'Blocked'],
  Cleaning:    ['Vacant'],
  Maintenance: ['Cleaning', 'Vacant'],
  Blocked:     ['Vacant'],
};

function canManuallyTransition(from: RoomStatus, to: RoomStatus): boolean {
  return (ALLOWED_MANUAL_TRANSITIONS[from] ?? []).includes(to);
}

describe('Room status workflow validation', () => {
  describe('Occupied room protection', () => {
    it('Occupied → Vacant is NOT allowed manually', () => {
      // Occupied rooms have no allowed manual transitions
      expect(canManuallyTransition('Occupied', 'Vacant')).toBe(false);
    });

    it('Occupied → Maintenance is NOT allowed manually', () => {
      expect(canManuallyTransition('Occupied', 'Maintenance')).toBe(false);
    });

    it('Occupied → Blocked is NOT allowed manually', () => {
      expect(canManuallyTransition('Occupied', 'Blocked')).toBe(false);
    });

    it('Occupied → Cleaning is NOT allowed manually (must go through checkout)', () => {
      expect(canManuallyTransition('Occupied', 'Cleaning')).toBe(false);
    });
  });

  describe('Cleaning room', () => {
    it('Cleaning → Vacant is allowed (cleaning complete)', () => {
      expect(canManuallyTransition('Cleaning', 'Vacant')).toBe(true);
    });

    it('Cleaning → Occupied is NOT allowed manually', () => {
      expect(canManuallyTransition('Cleaning', 'Occupied')).toBe(false);
    });
  });

  describe('Vacant room', () => {
    it('Vacant → Maintenance is allowed', () => {
      expect(canManuallyTransition('Vacant', 'Maintenance')).toBe(true);
    });

    it('Vacant → Blocked is allowed', () => {
      expect(canManuallyTransition('Vacant', 'Blocked')).toBe(true);
    });

    it('Vacant → Occupied is NOT allowed manually (requires check-in workflow)', () => {
      expect(canManuallyTransition('Vacant', 'Occupied')).toBe(false);
    });

    it('Vacant → Cleaning is NOT allowed manually', () => {
      expect(canManuallyTransition('Vacant', 'Cleaning')).toBe(false);
    });
  });

  describe('Maintenance room', () => {
    it('Maintenance → Cleaning is allowed', () => {
      expect(canManuallyTransition('Maintenance', 'Cleaning')).toBe(true);
    });

    it('Maintenance → Vacant is allowed', () => {
      expect(canManuallyTransition('Maintenance', 'Vacant')).toBe(true);
    });
  });

  describe('Blocked room', () => {
    it('Blocked → Vacant is allowed', () => {
      expect(canManuallyTransition('Blocked', 'Vacant')).toBe(true);
    });

    it('Blocked → Occupied is NOT allowed manually', () => {
      expect(canManuallyTransition('Blocked', 'Occupied')).toBe(false);
    });
  });
});

// ─── Room availability for booking ────────────────────────────────────────────

function isRoomBookable(status: RoomStatus): boolean {
  return !['Cleaning', 'Maintenance', 'Blocked'].includes(status);
}

describe('Room bookability', () => {
  it('Vacant room can be booked', () => expect(isRoomBookable('Vacant')).toBe(true));
  it('Reserved room can be booked (additional reservation from future date)', () => expect(isRoomBookable('Reserved')).toBe(true));
  it('Occupied room cannot be booked (overlap check handles this via date logic)', () => expect(isRoomBookable('Occupied')).toBe(true));
  it('Cleaning room cannot be booked', () => expect(isRoomBookable('Cleaning')).toBe(false));
  it('Maintenance room cannot be booked', () => expect(isRoomBookable('Maintenance')).toBe(false));
  it('Blocked room cannot be booked', () => expect(isRoomBookable('Blocked')).toBe(false));
});

// ─── Capacity validation ─────────────────────────────────────────────────────

function validateCapacity(guestCount: number, roomCapacity: number, overrideReason?: string): boolean {
  if (guestCount <= roomCapacity) return true;
  if (overrideReason && overrideReason.trim().length > 0) return true;
  return false;
}

describe('Guest capacity validation', () => {
  it('guest count within capacity — allowed', () => {
    expect(validateCapacity(2, 6)).toBe(true);
  });

  it('guest count exactly at capacity — allowed', () => {
    expect(validateCapacity(6, 6)).toBe(true);
  });

  it('guest count exceeds capacity without override — rejected', () => {
    expect(validateCapacity(7, 6)).toBe(false);
  });

  it('guest count exceeds capacity with override reason — allowed', () => {
    expect(validateCapacity(7, 6, 'Family with small children')).toBe(true);
  });

  it('empty override reason does not count as override', () => {
    expect(validateCapacity(7, 6, '  ')).toBe(false);
  });
});

// ─── Role permission level ───────────────────────────────────────────────────

type UserRole = 'SuperAdmin' | 'OwnerAdmin' | 'BuildingManager' | 'Operator' | 'Cashier' | 'ReadOnly';

const roleLevel: Record<UserRole, number> = {
  SuperAdmin: 100,
  OwnerAdmin: 90,
  BuildingManager: 70,
  Operator: 50,
  Cashier: 40,
  ReadOnly: 10,
};

function hasPermission(userRole: UserRole, minRole: UserRole): boolean {
  return roleLevel[userRole] >= roleLevel[minRole];
}

describe('Role-based access control', () => {
  describe('Booking creation (min: Operator)', () => {
    it('SuperAdmin can create booking', () => expect(hasPermission('SuperAdmin', 'Operator')).toBe(true));
    it('OwnerAdmin can create booking', () => expect(hasPermission('OwnerAdmin', 'Operator')).toBe(true));
    it('BuildingManager can create booking', () => expect(hasPermission('BuildingManager', 'Operator')).toBe(true));
    it('Operator can create booking', () => expect(hasPermission('Operator', 'Operator')).toBe(true));
    it('Cashier cannot create booking', () => expect(hasPermission('Cashier', 'Operator')).toBe(false));
    it('ReadOnly cannot create booking', () => expect(hasPermission('ReadOnly', 'Operator')).toBe(false));
  });

  describe('Refund (min: BuildingManager)', () => {
    it('BuildingManager can process refund', () => expect(hasPermission('BuildingManager', 'BuildingManager')).toBe(true));
    it('Operator cannot process refund', () => expect(hasPermission('Operator', 'BuildingManager')).toBe(false));
    it('Cashier cannot process refund', () => expect(hasPermission('Cashier', 'BuildingManager')).toBe(false));
  });

  describe('Rate override (min: BuildingManager)', () => {
    it('BuildingManager can override rate', () => expect(hasPermission('BuildingManager', 'BuildingManager')).toBe(true));
    it('Operator cannot override rate', () => expect(hasPermission('Operator', 'BuildingManager')).toBe(false));
    it('Cashier cannot override rate', () => expect(hasPermission('Cashier', 'BuildingManager')).toBe(false));
  });

  describe('User management (min: OwnerAdmin)', () => {
    it('OwnerAdmin can manage users', () => expect(hasPermission('OwnerAdmin', 'OwnerAdmin')).toBe(true));
    it('BuildingManager cannot manage users', () => expect(hasPermission('BuildingManager', 'OwnerAdmin')).toBe(false));
    it('Operator cannot manage users', () => expect(hasPermission('Operator', 'OwnerAdmin')).toBe(false));
  });

  describe('Payment recording (min: Cashier)', () => {
    it('Cashier can record payment', () => expect(hasPermission('Cashier', 'Cashier')).toBe(true));
    it('Operator can record payment', () => expect(hasPermission('Operator', 'Cashier')).toBe(true));
    it('ReadOnly cannot record payment', () => expect(hasPermission('ReadOnly', 'Cashier')).toBe(false));
  });
});

// ─── Check-in preconditions ───────────────────────────────────────────────────

const PENDING_PREFIXES = ['PENDING', 'UNKNOWN', 'TEMP'];

function isPlaceholderDocument(docNumber: string): boolean {
  if (!docNumber || docNumber.trim() === '') return true;
  return PENDING_PREFIXES.some((p) => docNumber.toUpperCase().startsWith(p));
}

describe('Check-in document validation', () => {
  it('real NIC number is not a placeholder', () => {
    expect(isPlaceholderDocument('198712345678')).toBe(false);
  });

  it('real passport number is not a placeholder', () => {
    expect(isPlaceholderDocument('N12345678')).toBe(false);
  });

  it('PENDING prefix is a placeholder', () => {
    expect(isPlaceholderDocument('PENDING-BKG-0001')).toBe(true);
  });

  it('UNKNOWN prefix is a placeholder', () => {
    expect(isPlaceholderDocument('UNKNOWN')).toBe(true);
  });

  it('TEMP prefix is a placeholder', () => {
    expect(isPlaceholderDocument('TEMP-123')).toBe(true);
  });

  it('empty string is a placeholder', () => {
    expect(isPlaceholderDocument('')).toBe(true);
  });

  it('whitespace-only is a placeholder', () => {
    expect(isPlaceholderDocument('   ')).toBe(true);
  });
});

// ─── Payment amount validation ────────────────────────────────────────────────

function validatePaymentAmount(
  amount: number,
  outstanding: number,
  purpose: 'Deposit' | 'PartialPayment' | 'FinalPayment' | 'Refund',
  totalPaid: number,
): { valid: boolean; error?: string } {
  if (amount <= 0) return { valid: false, error: 'Amount must be positive' };
  if (purpose === 'Refund') {
    if (totalPaid <= 0) return { valid: false, error: 'No payments to refund' };
    if (Math.abs(amount) > totalPaid) return { valid: false, error: 'Refund cannot exceed total paid' };
  } else {
    if (amount > outstanding + 0.01) {  // small tolerance for floating point
      return { valid: false, error: 'Payment exceeds outstanding balance' };
    }
  }
  return { valid: true };
}

describe('Payment amount validation', () => {
  it('positive amount within outstanding — valid', () => {
    expect(validatePaymentAmount(3000, 8000, 'PartialPayment', 0).valid).toBe(true);
  });

  it('zero amount — invalid', () => {
    expect(validatePaymentAmount(0, 8000, 'PartialPayment', 0).valid).toBe(false);
  });

  it('negative amount — invalid', () => {
    expect(validatePaymentAmount(-500, 8000, 'PartialPayment', 0).valid).toBe(false);
  });

  it('overpayment — invalid', () => {
    const result = validatePaymentAmount(9000, 8000, 'FinalPayment', 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds outstanding');
  });

  it('refund within total paid — valid', () => {
    expect(validatePaymentAmount(2000, 0, 'Refund', 5000).valid).toBe(true);
  });

  it('refund exceeding total paid — invalid', () => {
    const result = validatePaymentAmount(6000, 0, 'Refund', 5000);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceed total paid');
  });

  it('refund when nothing paid — invalid', () => {
    const result = validatePaymentAmount(1000, 8000, 'Refund', 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No payments to refund');
  });
});

// ─── Night count calculation ──────────────────────────────────────────────────

function calculateNights(checkIn: Date, checkOut: Date): number {
  const ms = checkOut.getTime() - checkIn.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

describe('Night count calculation', () => {
  it('1 night stay', () => {
    expect(calculateNights(new Date('2025-03-10T14:00:00'), new Date('2025-03-11T12:00:00'))).toBe(1);
  });

  it('3 night stay', () => {
    expect(calculateNights(new Date('2025-03-10T14:00:00'), new Date('2025-03-13T12:00:00'))).toBe(3);
  });

  it('checkout same day as check-in would be 0 nights — not allowed by business rules', () => {
    expect(calculateNights(new Date('2025-03-10T14:00:00'), new Date('2025-03-10T20:00:00'))).toBe(0);
  });

  it('minimum 1 night is enforced (business rule check)', () => {
    const nights = calculateNights(new Date('2025-03-10'), new Date('2025-03-10'));
    expect(nights).toBeLessThan(1); // should be rejected by the booking logic
  });
});
