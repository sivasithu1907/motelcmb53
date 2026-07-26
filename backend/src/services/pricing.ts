import { Decimal } from '@prisma/client/runtime/library';

export interface PricingInput {
  baseNightlyRate: number;
  acSurchargePerNight: number;
  nights: number;
  additionalCharges?: number;
  serviceChargeType?: 'percentage' | 'fixed' | null;
  serviceChargeValue?: number;
  discountType?: 'percentage' | 'fixed' | null;
  discountValue?: number;
}

export interface PricingResult {
  baseNightlyRate: number;
  acSurchargePerNight: number;
  nights: number;
  baseRoomCharge: number;
  totalAcSurcharge: number;
  roomCharge: number;
  additionalCharges: number;
  subtotal: number;
  serviceCharge: number;
  discount: number;
  invoiceTotal: number;
}

export function calculatePricing(input: PricingInput): PricingResult {
  const {
    baseNightlyRate,
    acSurchargePerNight,
    nights,
    additionalCharges = 0,
    serviceChargeType,
    serviceChargeValue = 0,
    discountType,
    discountValue = 0,
  } = input;

  // Core pricing - AC surcharge applied separately, never doubled
  const baseRoomCharge = baseNightlyRate * nights;
  const totalAcSurcharge = acSurchargePerNight * nights;
  const roomCharge = baseRoomCharge + totalAcSurcharge;

  // Subtotal before service charge and discount
  const subtotal = roomCharge + additionalCharges;

  // Service charge (on subtotal)
  let serviceCharge = 0;
  if (serviceChargeType === 'percentage' && serviceChargeValue > 0) {
    serviceCharge = Math.round(subtotal * (serviceChargeValue / 100));
  } else if (serviceChargeType === 'fixed' && serviceChargeValue > 0) {
    serviceCharge = serviceChargeValue;
  }

  // Discount (on subtotal, before service charge)
  let discount = 0;
  if (discountType === 'percentage' && discountValue > 0) {
    const pct = Math.min(100, discountValue);
    discount = Math.round(subtotal * (pct / 100));
  } else if (discountType === 'fixed' && discountValue > 0) {
    discount = Math.min(subtotal, discountValue);
  }

  // Invoice total
  const invoiceTotal = subtotal + serviceCharge - discount;

  return {
    baseNightlyRate,
    acSurchargePerNight,
    nights,
    baseRoomCharge,
    totalAcSurcharge,
    roomCharge,
    additionalCharges,
    subtotal,
    serviceCharge,
    discount,
    invoiceTotal,
  };
}

export function toNumber(d: Decimal | number | null | undefined): number {
  if (d === null || d === undefined) return 0;
  if (typeof d === 'number') return d;
  return d.toNumber();
}
