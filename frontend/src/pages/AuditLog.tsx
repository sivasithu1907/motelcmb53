import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Shield } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { formatDateTime } from '../lib/utils';
import { api } from '../api/client';
import { useAuth } from '../lib/auth';

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

const ACTION_COLORS: Record<string, string> = {
  LOGIN_SUCCESS: 'text-emerald-600',
  LOGIN_FAILED: 'text-rose-600',
  BOOKING_CREATED: 'text-indigo-600',
  BOOKING_CHECKED_IN: 'text-blue-600',
  BOOKING_CHECKED_OUT: 'text-slate-600',
  BOOKING_CANCELLED: 'text-rose-600',
  PAYMENT_RECORDED: 'text-emerald-600',
  DOCUMENT_VIEWED: 'text-amber-600',
  DOCUMENT_UPLOADED: 'text-indigo-600',
  USER_CREATED: 'text-violet-600',
  SETTINGS_UPDATED: 'text-orange-600',
};

export default function AuditLog() {
  const { currentBuildingId } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ data: AuditLog[]; total: number }>({
    queryKey: ['audit', currentBuildingId, search, page],
    queryFn: () => api.get('/audit', {
      params: {
        buildingId: currentBuildingId,
        action: search || undefined,
        page,
        limit: 50,
      }
    }).then(r => r.data),
  });

  const logs = data?.data || [];
  const total = data?.total || 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Audit Log</h2>
          <p className="text-sm text-slate-500 mt-1">{total} audit records</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
          <Shield className="w-3.5 h-3.5" />
          Immutable records
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input className="pl-9" placeholder="Filter by action…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} />
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
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Building</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
                {!isLoading && logs.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No audit records</td></tr>}
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{formatDateTime(log.createdAt)}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-900">{log.user?.name || 'System'}</p>
                      <p className="text-xs text-slate-400">{log.user?.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{log.userRole || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-mono font-medium ${ACTION_COLORS[log.action] || 'text-slate-700'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {log.entityType && <span>{log.entityType}</span>}
                      {log.entityId && <span className="ml-1 font-mono text-slate-400">{log.entityId.slice(0, 8)}…</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate">{log.reason || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{log.building?.code || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 50 && (
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-sm text-slate-500">Page {page} · {total} total</span>
              <div className="flex gap-2">
                <button className="text-sm text-slate-600 disabled:opacity-40 px-3 py-1 border border-slate-200 rounded"
                  disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
                <button className="text-sm text-slate-600 disabled:opacity-40 px-3 py-1 border border-slate-200 rounded"
                  disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
