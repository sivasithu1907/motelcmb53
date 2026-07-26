import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileText, Search, Printer } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/Badge';
import { Input, Select } from '../components/ui/Input';
import { formatCurrency, formatDate } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { api } from '../api/client';

interface Invoice {
  id: string;
  number: string;
  status: string;
  total: string;
  paidAmount: string;
  outstandingBalance: string;
  issueDate: string;
  booking: {
    reference: string;
    guestName: string;
    checkInDate: string;
    checkOutDate: string;
    room: { number: string };
    building: { name: string };
  };
}

export default function Invoices() {
  const { currentBuildingId } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ data: Invoice[]; total: number }>({
    queryKey: ['invoices', currentBuildingId, statusFilter, page],
    queryFn: () => api.get('/invoices', {
      params: { buildingId: currentBuildingId, status: statusFilter || undefined, page, limit: 30 }
    }).then(r => r.data),
  });

  const invoices = data?.data || [];
  const total = data?.total || 0;

  const filtered = search
    ? invoices.filter(i =>
        i.number.toLowerCase().includes(search.toLowerCase()) ||
        i.booking.guestName.toLowerCase().includes(search.toLowerCase()) ||
        i.booking.reference.toLowerCase().includes(search.toLowerCase())
      )
    : invoices;

  const statuses = ['', 'Draft', 'Unpaid', 'PartiallyPaid', 'Paid', 'Cancelled', 'Refunded'];
  const statusLabels: Record<string, string> = {
    '': 'All Statuses',
    PartiallyPaid: 'Partially Paid',
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Invoices</h2>
          <p className="text-sm text-slate-500 mt-1">{total} total invoices</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-9" placeholder="Search invoice number, guest, booking…" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="sm:w-48">
          {statuses.map(s => (
            <option key={s} value={s}>{statusLabels[s] || s || 'All Statuses'}</option>
          ))}
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Invoice #</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Booking Ref</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Guest</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Room</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Total</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Balance</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoading && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">No invoices found</td></tr>
                )}
                {filtered.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono font-semibold text-indigo-600">{inv.number}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{inv.booking.reference}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{inv.booking.guestName}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-900">Room {inv.booking.room.number}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{formatDate(inv.issueDate)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900 text-right">{formatCurrency(Number(inv.total))}</td>
                    <td className="px-4 py-3 text-right">
                      {Number(inv.outstandingBalance) > 0
                        ? <span className="text-sm font-semibold text-rose-600">{formatCurrency(Number(inv.outstandingBalance))}</span>
                        : <span className="text-sm text-emerald-600">—</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/${inv.id}`)}>
                        <FileText className="w-3.5 h-3.5 mr-1" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
