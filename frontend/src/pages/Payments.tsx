import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatDateTime } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { api, apiError } from '../api/client';

interface Payment {
  id: string;
  paymentReference: string;
  guestName: string;
  amount: string;
  purpose: string;
  method: string;
  paymentDate: string;
  isReversed: boolean;
  booking: { reference: string };
  invoice?: { number: string };
  collectedBy?: { name: string };
}

const PURPOSE_COLORS: Record<string, string> = {
  Deposit: 'info',
  PartialPayment: 'warning',
  FinalPayment: 'success',
  Refund: 'danger',
};

const PURPOSE_LABELS: Record<string, string> = {
  PartialPayment: 'Partial Payment',
  FinalPayment: 'Final Payment',
};

export default function Payments() {
  const { currentBuildingId, can } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Form state
  const [bookingRef, setBookingRef] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('FinalPayment');
  const [method, setMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [bookingId, setBookingId] = useState('');

  const { data, isLoading } = useQuery<{ data: Payment[]; total: number }>({
    queryKey: ['payments', currentBuildingId, page],
    queryFn: () => api.get('/payments', {
      params: { buildingId: currentBuildingId, page, limit: 30 }
    }).then(r => r.data),
  });

  const payments = data?.data || [];
  const total = data?.total || 0;

  const filtered = search
    ? payments.filter(p =>
        p.paymentReference.toLowerCase().includes(search.toLowerCase()) ||
        p.guestName.toLowerCase().includes(search.toLowerCase()) ||
        p.booking.reference.toLowerCase().includes(search.toLowerCase())
      )
    : payments;

  // Look up booking by reference
  const searchBookingMutation = useMutation({
    mutationFn: (ref: string) => api.get('/bookings', { params: { buildingId: currentBuildingId, limit: 5 } })
      .then(r => {
        const found = r.data.data.find((b: any) => b.reference === ref.toUpperCase());
        if (!found) throw new Error('Booking not found: ' + ref);
        return found;
      }),
    onSuccess: (b) => {
      setBookingId(b.id);
      setFormError('');
    },
    onError: (err) => setFormError(apiError(err)),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/payments', {
      bookingId,
      amount: Number(amount),
      purpose,
      method,
      notes: notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      setShowForm(false);
      setBookingRef(''); setAmount(''); setPurpose('FinalPayment'); setMethod('Cash'); setNotes(''); setBookingId('');
    },
    onError: (err) => setFormError(apiError(err)),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Payments</h2>
          <p className="text-sm text-slate-500 mt-1">{total} total payments</p>
        </div>
        {can('record_payment') && (
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4 mr-2" /> Record Payment
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Record Payment</CardTitle></CardHeader>
          <CardContent className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Booking Reference</label>
              <div className="flex gap-2">
                <Input value={bookingRef} onChange={e => setBookingRef(e.target.value)}
                  placeholder="e.g. BKG-0001" className="flex-1" />
                <Button variant="outline" onClick={() => searchBookingMutation.mutate(bookingRef)}
                  disabled={searchBookingMutation.isPending}>
                  {searchBookingMutation.isPending ? 'Finding…' : 'Find'}
                </Button>
              </div>
              {bookingId && <p className="text-xs text-emerald-600 mt-1">✓ Booking found</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (LKR)</label>
                <Input type="number" min={0.01} step={0.01} value={amount}
                  onChange={e => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Purpose</label>
                <Select value={purpose} onChange={e => setPurpose(e.target.value)}>
                  <option value="Deposit">Deposit</option>
                  <option value="PartialPayment">Partial Payment</option>
                  <option value="FinalPayment">Final Payment</option>
                  {can('refund') && <option value="Refund">Refund</option>}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Method</label>
                <Select value={method} onChange={e => setMethod(e.target.value)}>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="BankTransfer">Bank Transfer</option>
                  <option value="Other">Other</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
              </div>
            </div>
            {formError && (
              <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 px-4 py-3 rounded-lg">{formError}</div>
            )}
            <div className="flex gap-3">
              <Button onClick={() => createMutation.mutate()} disabled={!bookingId || !amount || createMutation.isPending}>
                {createMutation.isPending ? 'Recording…' : 'Record Payment'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input className="pl-9" placeholder="Search payment reference, guest, booking…" value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Reference</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Booking</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Guest</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Purpose</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Method</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Amount</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Collected By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoading && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
                {!isLoading && filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">No payments found</td></tr>}
                {filtered.map(p => (
                  <tr key={p.id} className={p.isReversed ? 'opacity-50' : ''}>
                    <td className="px-4 py-3 text-sm font-mono text-indigo-600">{p.paymentReference}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{p.booking.reference}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{p.guestName}</td>
                    <td className="px-4 py-3">
                      <Badge variant={PURPOSE_COLORS[p.purpose] || 'default'}>
                        {PURPOSE_LABELS[p.purpose] || p.purpose}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{p.method}</td>
                    <td className={`px-4 py-3 text-sm font-semibold text-right ${Number(p.amount) < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                      {Number(p.amount) < 0 ? `(${formatCurrency(Math.abs(Number(p.amount)))})` : formatCurrency(Number(p.amount))}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{formatDateTime(p.paymentDate)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{p.collectedBy?.name || '—'}</td>
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
