/**
 * Pricing unit tests — no database required.
 * Tests the pure calculatePricing() service against the business rules
 * defined in the production spec (Section 3).
 *
 * Room rates (LKR):
 *   Rooms 1,2,8,9,10 (cap 6): Non-AC 8,000 | AC 10,500  → surcharge 2,500
 *   Rooms 3,4,5,6,7,11 (cap 2): Non-AC 5,000 | AC 7,500  → surcharge 2,500
 *   Room 12 (cap 3): Non-AC 5,500 | AC 8,000              → surcharge 2,500
 */

import { describe, it, expect } from 'vitest';
import { calculatePricing } from '../services/pricing.js';

// ─── Helper factories ─────────────────────────────────────────────────────────

const room1 = { nonAcRate: 8000, acSurcharge: 2500 }; // capacity-6 room
const room3 = { nonAcRate: 5000, acSurcharge: 2500 }; // capacity-2 room
const room12 = { nonAcRate: 5500, acSurcharge: 2500 }; // capacity-3 room

function nonAcInput(room: typeof room1, nights: number, extras = {}) {
  return {
    baseNightlyRate: room.nonAcRate,
    acSurchargePerNight: 0,
    nights,
    ...extras,
  };
}

function acInput(room: typeof room1, nights: number, extras = {}) {
  return {
    baseNightlyRate: room.nonAcRate,
    acSurchargePerNight: room.acSurcharge,
    nights,
    ...extras,
  };
}

// ─── 1. Non-A/C one-night pricing ────────────────────────────────────────────
describe('Non-A/C one-night pricing', () => {
  it('room1 non-AC 1 night = LKR 8,000', () => {
    const p = calculatePricing(nonAcInput(room1, 1));
    expect(p.baseRoomCharge).toBe(8000);
    expect(p.totalAcSurcharge).toBe(0);
    expect(p.roomCharge).toBe(8000);
    expect(p.invoiceTotal).toBe(8000);
  });

  it('room3 non-AC 1 night = LKR 5,000', () => {
    const p = calculatePricing(nonAcInput(room3, 1));
    expect(p.roomCharge).toBe(5000);
    expect(p.invoiceTotal).toBe(5000);
  });

  it('room12 non-AC 1 night = LKR 5,500', () => {
    const p = calculatePricing(nonAcInput(room12, 1));
    expect(p.roomCharge).toBe(5500);
    expect(p.invoiceTotal).toBe(5500);
  });
});

// ─── 2. A/C one-night pricing ────────────────────────────────────────────────
describe('A/C one-night pricing', () => {
  it('room1 AC 1 night: base 8,000 + surcharge 2,500 = 10,500', () => {
    const p = calculatePricing(acInput(room1, 1));
    expect(p.baseRoomCharge).toBe(8000);
    expect(p.totalAcSurcharge).toBe(2500);
    expect(p.roomCharge).toBe(10500);
    expect(p.invoiceTotal).toBe(10500);
  });

  it('room3 AC 1 night: base 5,000 + surcharge 2,500 = 7,500', () => {
    const p = calculatePricing(acInput(room3, 1));
    expect(p.roomCharge).toBe(7500);
    expect(p.invoiceTotal).toBe(7500);
  });

  it('room12 AC 1 night: base 5,500 + surcharge 2,500 = 8,000', () => {
    const p = calculatePricing(acInput(room12, 1));
    expect(p.roomCharge).toBe(8000);
    expect(p.invoiceTotal).toBe(8000);
  });
});

// ─── 3. Multi-night pricing ───────────────────────────────────────────────────
describe('Multi-night pricing', () => {
  it('room1 non-AC 3 nights = LKR 24,000', () => {
    const p = calculatePricing(nonAcInput(room1, 3));
    expect(p.baseRoomCharge).toBe(24000);
    expect(p.roomCharge).toBe(24000);
    expect(p.invoiceTotal).toBe(24000);
  });

  it('room3 non-AC 7 nights = LKR 35,000', () => {
    const p = calculatePricing(nonAcInput(room3, 7));
    expect(p.roomCharge).toBe(35000);
  });

  it('room1 AC 5 nights: (8000 + 2500) × 5 = 52,500', () => {
    const p = calculatePricing(acInput(room1, 5));
    expect(p.baseRoomCharge).toBe(40000);
    expect(p.totalAcSurcharge).toBe(12500);
    expect(p.roomCharge).toBe(52500);
    expect(p.invoiceTotal).toBe(52500);
  });
});

// ─── 4. A/C surcharge is NOT counted twice ───────────────────────────────────
describe('A/C surcharge counted exactly once', () => {
  it('AC surcharge appears once in roomCharge, not in additionalCharges', () => {
    const p = calculatePricing(acInput(room1, 2));
    // roomCharge = baseRoomCharge + totalAcSurcharge
    expect(p.roomCharge).toBe(p.baseRoomCharge + p.totalAcSurcharge);
    // subtotal = roomCharge + additionalCharges (no extra surcharge)
    expect(p.subtotal).toBe(p.roomCharge + p.additionalCharges);
    // invoiceTotal does not add surcharge again
    expect(p.invoiceTotal).toBe(p.subtotal + p.serviceCharge - p.discount);
  });

  it('baseNightlyRate never includes acSurcharge when stored', () => {
    // Confirmed: the spec says stored rate is always the Non-AC rate
    const p = calculatePricing({ baseNightlyRate: 8000, acSurchargePerNight: 2500, nights: 1 });
    expect(p.baseNightlyRate).toBe(8000);            // stored Non-AC rate unchanged
    expect(p.acSurchargePerNight).toBe(2500);        // separate field
    expect(p.roomCharge).toBe(10500);                // combined for billing
  });
});

// ─── 5. Fixed discount ───────────────────────────────────────────────────────
describe('Fixed discount', () => {
  it('applies fixed discount of LKR 1,000 on room1 1 night', () => {
    const p = calculatePricing({
      ...nonAcInput(room1, 1),
      discountType: 'fixed',
      discountValue: 1000,
    });
    expect(p.discount).toBe(1000);
    expect(p.invoiceTotal).toBe(7000);
  });

  it('discount cannot exceed subtotal — clamped to subtotal', () => {
    const p = calculatePricing({
      ...nonAcInput(room3, 1),
      discountType: 'fixed',
      discountValue: 99999,
    });
    expect(p.discount).toBe(p.subtotal);
    expect(p.invoiceTotal).toBe(0);
  });

  it('zero discount value has no effect', () => {
    const p = calculatePricing({ ...nonAcInput(room1, 1), discountType: 'fixed', discountValue: 0 });
    expect(p.discount).toBe(0);
    expect(p.invoiceTotal).toBe(8000);
  });
});

// ─── 6. Percentage discount ───────────────────────────────────────────────────
describe('Percentage discount', () => {
  it('10% discount on room1 1 night = LKR 800', () => {
    const p = calculatePricing({
      ...nonAcInput(room1, 1),
      discountType: 'percentage',
      discountValue: 10,
    });
    expect(p.discount).toBe(800);
    expect(p.invoiceTotal).toBe(7200);
  });

  it('100% discount gives zero invoice total', () => {
    const p = calculatePricing({
      ...nonAcInput(room1, 1),
      discountType: 'percentage',
      discountValue: 100,
    });
    expect(p.discount).toBe(8000);
    expect(p.invoiceTotal).toBe(0);
  });

  it('percentage over 100 is clamped to 100%', () => {
    const p = calculatePricing({
      ...nonAcInput(room1, 1),
      discountType: 'percentage',
      discountValue: 150,
    });
    expect(p.discount).toBe(8000);
    expect(p.invoiceTotal).toBe(0);
  });

  it('percentage applied on subtotal including additional charges', () => {
    const p = calculatePricing({
      ...nonAcInput(room1, 1),
      additionalCharges: 2000,
      discountType: 'percentage',
      discountValue: 10,
    });
    // subtotal = 8000 + 2000 = 10000; 10% = 1000
    expect(p.subtotal).toBe(10000);
    expect(p.discount).toBe(1000);
    expect(p.invoiceTotal).toBe(9000);
  });
});

// ─── 7. Service charge ───────────────────────────────────────────────────────
describe('Service charge (optional, disabled by default)', () => {
  it('no service charge when type is null', () => {
    const p = calculatePricing({ ...nonAcInput(room1, 1) });
    expect(p.serviceCharge).toBe(0);
  });

  it('percentage service charge: 10% on room1 1 night', () => {
    const p = calculatePricing({
      ...nonAcInput(room1, 1),
      serviceChargeType: 'percentage',
      serviceChargeValue: 10,
    });
    expect(p.serviceCharge).toBe(800);
    expect(p.invoiceTotal).toBe(8800);
  });

  it('fixed service charge: LKR 500 flat', () => {
    const p = calculatePricing({
      ...nonAcInput(room1, 1),
      serviceChargeType: 'fixed',
      serviceChargeValue: 500,
    });
    expect(p.serviceCharge).toBe(500);
    expect(p.invoiceTotal).toBe(8500);
  });

  it('service charge is added after discount', () => {
    const p = calculatePricing({
      ...nonAcInput(room1, 1),
      discountType: 'fixed',
      discountValue: 1000,
      serviceChargeType: 'fixed',
      serviceChargeValue: 500,
    });
    // subtotal=8000, discount=1000, serviceCharge=500, total=7500
    expect(p.invoiceTotal).toBe(7500);
  });
});

// ─── 8. Additional charges ───────────────────────────────────────────────────
describe('Additional charges', () => {
  it('additional charges added to subtotal', () => {
    const p = calculatePricing({ ...nonAcInput(room1, 1), additionalCharges: 1500 });
    expect(p.additionalCharges).toBe(1500);
    expect(p.subtotal).toBe(9500);
    expect(p.invoiceTotal).toBe(9500);
  });

  it('additional charges with AC room', () => {
    const p = calculatePricing({ ...acInput(room1, 2), additionalCharges: 3000 });
    expect(p.roomCharge).toBe(21000);    // (8000+2500)×2
    expect(p.subtotal).toBe(24000);
    expect(p.invoiceTotal).toBe(24000);
  });
});

// ─── 9. Outstanding balance calculation ──────────────────────────────────────
describe('Outstanding balance', () => {
  it('outstanding = invoiceTotal - paymentsReceived', () => {
    const p = calculatePricing(nonAcInput(room1, 1));
    const paid = 3000;
    const outstanding = Math.max(0, p.invoiceTotal - paid);
    expect(outstanding).toBe(5000);
  });

  it('outstanding is never negative', () => {
    const p = calculatePricing(nonAcInput(room3, 1));
    const overpaid = 10000;
    const outstanding = Math.max(0, p.invoiceTotal - overpaid);
    expect(outstanding).toBe(0);
  });
});

// ─── 10. Full booking scenario ───────────────────────────────────────────────
describe('Full booking scenario: room1 AC 3 nights + food charge + 10% discount', () => {
  it('computes correctly end to end', () => {
    const p = calculatePricing({
      baseNightlyRate: 8000,
      acSurchargePerNight: 2500,
      nights: 3,
      additionalCharges: 1500,   // food
      discountType: 'percentage',
      discountValue: 10,
    });
    //  roomCharge = (8000+2500)×3 = 31,500
    //  subtotal   = 31,500+1,500  = 33,000
    //  discount   = 10% of 33,000 = 3,300
    //  total      = 33,000 - 3,300 = 29,700
    expect(p.baseRoomCharge).toBe(24000);
    expect(p.totalAcSurcharge).toBe(7500);
    expect(p.roomCharge).toBe(31500);
    expect(p.subtotal).toBe(33000);
    expect(p.discount).toBe(3300);
    expect(p.invoiceTotal).toBe(29700);
  });
});
