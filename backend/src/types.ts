// Mirrored from Prisma schema for use when @prisma/client enums aren't generated
export const UserRole = {
  SuperAdmin: 'SuperAdmin',
  OwnerAdmin: 'OwnerAdmin',
  BuildingManager: 'BuildingManager',
  Operator: 'Operator',
  Cashier: 'Cashier',
  ReadOnly: 'ReadOnly',
} as const;
export type UserRole = typeof UserRole[keyof typeof UserRole];

export const BookingStatus = {
  Reserved: 'Reserved',
  Confirmed: 'Confirmed',
  CheckedIn: 'CheckedIn',
  CheckedOut: 'CheckedOut',
  Cancelled: 'Cancelled',
  NoShow: 'NoShow',
} as const;
export type BookingStatus = typeof BookingStatus[keyof typeof BookingStatus];

export const RoomStatus = {
  Vacant: 'Vacant',
  Reserved: 'Reserved',
  Occupied: 'Occupied',
  Cleaning: 'Cleaning',
  Maintenance: 'Maintenance',
  Blocked: 'Blocked',
} as const;
export type RoomStatus = typeof RoomStatus[keyof typeof RoomStatus];
