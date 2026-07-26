import React from 'react';
import { cn, STATUS_COLORS, statusLabel } from '../../lib/utils';

export function Badge({ children, variant = 'default', className }: { children: React.ReactNode; variant?: string; className?: string }) {
  const variants: Record<string, string> = {
    default: "bg-slate-100 text-slate-800",
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-rose-100 text-rose-800",
    info: "bg-blue-100 text-blue-800",
    purple: "bg-purple-100 text-purple-800",
  };
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", variants[variant] || variants.default, className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[status] || "bg-slate-100 text-slate-800")}>
      {statusLabel(status)}
    </span>
  );
}
