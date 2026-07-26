import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Filter } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/Badge';
import { Input, Select } from '../components/ui/Input';
import { formatCurrency, formatDate, formatDateTime } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { api } from '../api/client';

interface Booking {
  id: string;
  reference: string;
  guestName: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  isAc: boolean;
  invoiceTotal: string;
  outstandingBalance: string;
  createdAt: string;
  room: { number: string };
  building: { name: string };
}

export default function Bookings() {
  const { currentBuildingId, can } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ data: Booking[]; total: number }>({
    queryKey: ['bookings', currentBuildingId, statusFilter, page],
    queryFn: () => api.get('/bookings', {
      params: { buildingId: currentBuildingId, status: statusFilter || undefined, page, limit: 30 }
    }).then(r => r.data),
  });

  const bookings = data?.data || [];
  const total = data?.total || 0;

  const filtered = search
    ? bookings.filter(b =>
        b.guestName.toLowerCase().includes(search.toLowerCase()) ||
        b.reference.toLowerCase().includes(search.toLowerCase()) ||
        b.room.number.includes(search)
      )
    : bookings;

  const statuses = ['', 'Reserved', 'Confirmed', 'CheckedIn', 'CheckedOut', 'Cancelled', 'NoShow'];
  const statusLabels: Record<string, string> = {
    '': 'All Statuses',
    CheckedIn: 'Checked In',
    CheckedOut: 'Checked Out',
    NoShow: 'No Show',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Bookings</h2>
          <p className="text-sm text-slate-500 mt-1">{total} total bookings</p>
        </div>
        {can('create_booking') && (
          <Button onClick={() => navigate('/book')}>
            <Plus className="w-4 h-4 mr-2" /> New Booking
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-9" placeholder="Search guest, reference, room…" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="sm:w-48">
          {statuses.map(s => (
            <option key={s} value={s}>{statusLabels[s] || s}</option>
          ))}
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Reference</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Guest</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Room</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Check-In</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Check-Out</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Nights</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Total</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Balance</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoading && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">No bookings found</td></tr>
                )}
                {filtered.map(b => (
                  <tr key={b.id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => navigate(`/bookings/${b.id}`)}>
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono font-medium text-indigo-600">{b.reference}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-900">{b.guestName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-slate-900">Room {b.room.number}</span>
                      {b.isAc && <span className="ml-1 text-xs text-blue-600">A/C</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{formatDate(b.checkInDate)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{formatDate(b.checkOutDate)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{b.nights}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900 text-right">{formatCurrency(Number(b.invoiceTotal))}</td>
                    <td className="px-4 py-3 text-right">
                      {Number(b.outstandingBalance) > 0
                        ? <span className="text-sm font-semibold text-rose-600">{formatCurrency(Number(b.outstandingBalance))}</span>
                        : <span className="text-sm text-emerald-600">Settled</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 30 && (
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-sm text-slate-500">Showing {Math.min(page * 30, total)} of {total}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page * 30 >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
