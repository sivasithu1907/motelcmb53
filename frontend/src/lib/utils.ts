import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Module-level currency setting so every existing formatCurrency() call site
// picks up the org's configured currency without needing prop drilling or
// context everywhere. Set once via setCurrentCurrency() after settings load.
let _currentCurrency = 'LKR';

export function setCurrentCurrency(code: string) {
  if (code && typeof code === 'string') _currentCurrency = code;
}

export function getCurrentCurrency(): string {
  return _currentCurrency;
}

export function formatCurrency(amount: number | string | undefined | null): string {
  const n = Number(amount ?? 0);
  return `${_currentCurrency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(date: string | Date | undefined | null): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'dd MMM yyyy');
  } catch {
    return String(date);
  }
}

export function formatDateTime(date: string | Date | undefined | null): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'dd MMM yyyy HH:mm');
  } catch {
    return String(date);
  }
}

export function formatTime(date: string | Date | undefined | null): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'HH:mm');
  } catch {
    return String(date);
  }
}

export const ROLE_LABELS: Record<string, string> = {
  SuperAdmin: 'Super Admin',
  OwnerAdmin: 'Owner / Admin',
  BuildingManager: 'Building Manager',
  Operator: 'Operator / Receptionist',
  Cashier: 'Cashier',
  ReadOnly: 'Read-Only',
};

export const STATUS_COLORS: Record<string, string> = {
  Vacant: 'bg-emerald-100 text-emerald-800',
  Reserved: 'bg-purple-100 text-purple-800',
  Occupied: 'bg-blue-100 text-blue-800',
  Cleaning: 'bg-amber-100 text-amber-800',
  Maintenance: 'bg-rose-100 text-rose-800',
  Blocked: 'bg-slate-100 text-slate-700',
  Draft: 'bg-slate-100 text-slate-700',
  CheckedIn: 'bg-blue-100 text-blue-800',
  CheckedOut: 'bg-slate-100 text-slate-700',
  Cancelled: 'bg-red-100 text-red-800',
  NoShow: 'bg-orange-100 text-orange-800',
  Confirmed: 'bg-green-100 text-green-800',
  Unpaid: 'bg-red-100 text-red-800',
  PartiallyPaid: 'bg-amber-100 text-amber-800',
  Paid: 'bg-emerald-100 text-emerald-800',
  Refunded: 'bg-slate-100 text-slate-700',
};

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    CheckedIn: 'Checked In',
    CheckedOut: 'Checked Out',
    NoShow: 'No Show',
    PartiallyPaid: 'Partially Paid',
  };
  return labels[status] || status;
}
