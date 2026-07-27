import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Shield, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { formatDateTime } from '../lib/utils';
import { api } from '../api/client';

interface AuditLog {
  id: string;
  action: string;
  entityType?: string;
  entityId?: string;
  reason?: string;
  ipAddress?: string;
  createdAt: string;
  user?: { name: string; email: string };
  building?: { name: string; code: string };
  userRole?: string;
}

interface BuildingOpt { id: string; code: string; name: string; }

const ACTION_COLORS: Record<string, string> = {
  LOGIN_SUCCESS: 'text-emerald-600',
  LOGIN_FAILED: 'text-rose-600',
  BOOKING_CREATED: 'text-indigo-600',
  BOOKING_CHECKED_IN: 'text-blue-600',
  BOOKING_CHECKED_OUT: 'text-slate-600',
  BOOKING_CANCELLED: 'text-rose-600',
  BOOKING_NO_SHOW: 'text-rose-600',
  CHARGE_ADDED: 'text-amber-600',
  CHARGE_REMOVED: 'text-amber-600',
  PAYMENT_RECORDED: 'text-emerald-600',
  PAYMENT_REVERSED: 'text-rose-600',
  ROOM_STATUS_CHANGED: 'text-cyan-600',
  DOCUMENT_VIEWED: 'text-amber-600',
  DOCUMENT_UPLOADED: 'text-indigo-600',
  USER_CREATED: 'text-violet-600',
  USER_DELETED: 'text-rose-600',
  USER_DEACTIVATED: 'text-rose-600',
  INVOICE_CANCELLED: 'text-rose-600',
  SETTINGS_UPDATED: 'text-orange-600',
};

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Login Success',
  LOGIN_FAILED: 'Login Failed',
  BOOKING_CREATED: 'Booking Created',
  BOOKING_CHECKED_IN: 'Checked In',
  BOOKING_CHECKED_OUT: 'Checked Out',
  BOOKING_CANCELLED: 'Booking Cancelled',
  BOOKING_NO_SHOW: 'No Show',
  CHARGE_ADDED: 'Charge Added',
  CHARGE_REMOVED: 'Charge Removed',
  PAYMENT_RECORDED: 'Payment Recorded',
  PAYMENT_REVERSED: 'Payment Reversed',
  ROOM_STATUS_CHANGED: 'Room Status Changed',
  DOCUMENT_VIEWED: 'Document Viewed',
  DOCUMENT_UPLOADED: 'Document Uploaded',
  USER_CREATED: 'User Created',
  USER_DELETED: 'User Deleted',
  USER_DEACTIVATED: 'User Deactivated',
  INVOICE_CANCELLED: 'Invoice Cancelled',
  SETTINGS_UPDATED: 'Settings Updated',
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] || action.replace(/_/g, ' ');
}

export default function AuditLog() {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [buildingFilter, setBuildingFilter] = useState(''); // '' = All buildings (correct default)
  const [page, setPage] = useState(1);

  const { data: buildings = [] } = useQuery<BuildingOpt[]>({
    queryKey: ['buildings'],
    queryFn: () => api.get('/buildings').then(r => r.data),
  });

  const { data, isLoading, refetch, isFetching } = useQuery<{ data: AuditLog[]; total: number }>({
    queryKey: ['audit', buildingFilter, actionFilter, page],
    queryFn: () => api.get('/audit', {
      params: {
        buildingId: buildingFilter || undefined,
        action: actionFilter || undefined,
        page,
        limit: 50,
      }
    }).then(r => r.data),
  });

  const logs = data?.data || [];
  const total = data?.total || 0;

  // Client-side free-text search across user name/email/reason/entity (in addition to the action dropdown)
  const filtered = search
    ? logs.filter(l =>
        l.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
        l.user?.email?.toLowerCase().includes(search.toLowerCase()) ||
        l.reason?.toLowerCase().includes(search.toLowerCase()) ||
        l.entityId?.toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  const knownActions = Object.keys(ACTION_LABELS);
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Audit Log</h2>
          <p className="text-sm text-slate-500 mt-1">{total} audit record{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
            <Shield className="w-3.5 h-3.5" />
            Immutable records
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-9" placeholder="Search by user, reason, or record ID…" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }} className="sm:w-56">
          <option value="">All Actions</option>
          {knownActions.map(a => (
            <option key={a} value={a}>{actionLabel(a)}</option>
          ))}
        </Select>
        <Select value={buildingFilter} onChange={e => { setBuildingFilter(e.target.value); setPage(1); }} className="sm:w-56">
          <option value="">All Buildings</option>
          {buildings.map(b => (
            <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
          ))}
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Timestamp</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">User</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Role</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Action</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Entity</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Reason</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    {logs.length === 0 ? 'No audit records match these filters' : 'No records match your search'}
                  </td></tr>
                )}
                {filtered.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-900">{log.user?.name || 'System'}</p>
                      <p className="text-xs text-slate-400">{log.user?.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{log.userRole || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${ACTION_COLORS[log.action] || 'text-slate-700'}`}>
                        {actionLabel(log.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {log.entityType && <span>{log.entityType}</span>}
                      {log.entityId && <span className="ml-1 font-mono text-slate-400">{log.entityId.slice(0, 8)}…</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[220px] truncate" title={log.reason}>{log.reason || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{log.building?.code || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 50 && (
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-sm text-slate-500">Page {page} of {totalPages} · {total} total</span>
              <div className="flex gap-2">
                <button className="text-sm text-slate-600 disabled:opacity-40 px-3 py-1 border border-slate-200 rounded hover:bg-slate-50"
                  disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
                <button className="text-sm text-slate-600 disabled:opacity-40 px-3 py-1 border border-slate-200 rounded hover:bg-slate-50"
                  disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
