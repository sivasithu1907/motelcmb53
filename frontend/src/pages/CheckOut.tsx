import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LogOut, Clock, AlertTriangle, CreditCard, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { formatCurrency, formatDateTime } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { api, apiError } from '../api/client';
import { parseISO, isToday, isPast, format } from 'date-fns';

interface Booking {
  id: string;
  reference: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  actualCheckIn?: string;
  nights: number;
  isAc: boolean;
  baseNightlyRate: string;
  acSurchargePerNight: string;
  roomCharge: string;
  additionalCharges: string;
  serviceCharge: string;
  discount: string;
  invoiceTotal: string;
  paidAmount: string;
  outstandingBalance: string;
  status: string;
  room: { number: string };
  payments: Array<{ id: string; paymentReference: string; amount: string; purpose: string; method: string; paymentDate: string }>;
}

export default function CheckOut() {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedId = searchParams.get('booking');
  const [selectedId, setSelectedId] = useState(preselectedId || '');
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('Cash');
  const [overrideReason, setOverrideReason] = useState('');
  const [checkoutTime, setCheckoutTime] = useState(''); // empty = now
  const [error, setError] = useState('');

  const { data: dueList = [] } = useQuery<Booking[]>({
    queryKey: ['checkout-due'],
    queryFn: () => api.get('/bookings', { params: { status: 'CheckedIn', limit: 50 } })
      .then(r => r.data.data.filter((b: Booking) => {
        const d = parseISO(b.checkOutDate);
        return isToday(d) || isPast(d);
      })),
    refetchInterval: 30000,
  });

  const { data: selectedBooking, refetch: refetchBooking } = useQuery<Booking>({
    queryKey: ['booking', selectedId],
    queryFn: () => api.get(`/bookings/${selectedId}`).then(r => r.data),
    enabled: !!selectedId,
  });

  const outstanding = selectedBooking ? Number(selectedBooking.outstandingBalance) : 0;
  const canOverride = can('manage_rooms'); // managers+

  const addPaymentMutation = useMutation({
    mutationFn: () => api.post('/payments', {
      bookingId: selectedId,
      amount: payAmount,
      purpose: 'FinalPayment',
      method: payMethod,
    }),
    onSuccess: () => {
      refetchBooking();
      setPayAmount(0);
    },
    onError: (err) => setError(apiError(err)),
  });

  const checkoutMutation = useMutation({
    mutationFn: () => api.post(`/bookings/${selectedId}/checkout`, {
      overrideReason: overrideReason || undefined,
      actualCheckOut: checkoutTime || undefined,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['checkout-due'] });
      const invId = res.data?.invoice?.id;
      navigate(invId ? `/invoices/${invId}` : '/invoices');
    },
    onError: (err) => setError(apiError(err)),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Checkout Queue</h2>
        <p className="text-sm text-slate-500 mt-1">Departures due today and overdue checkouts</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Queue */}
        <Card>
          <CardHeader><CardTitle>Due Departures ({dueList.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {dueList.length === 0 && (
                <p className="px-6 py-8 text-center text-sm text-slate-400">No pending checkouts</p>
              )}
              {dueList.map(b => {
                const date = parseISO(b.checkOutDate);
                const overdue = isPast(date) && !isToday(date);
                return (
                  <button key={b.id}
                    className={`w-full px-6 py-4 text-left hover:bg-slate-50 transition-colors ${selectedId === b.id ? 'bg-rose-50' : ''}`}
                    onClick={() => { setSelectedId(b.id); setError(''); }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{b.guestName}</p>
                        <p className="text-xs text-slate-500">{b.reference} · Room {b.room.number}</p>
                        <p className="text-xs text-slate-500">{format(date, 'MMM dd, HH:mm')}</p>
                      </div>
                      <div className="text-right space-y-1">
                        {overdue
                          ? <div className="text-xs text-rose-600 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Overdue</div>
                          : <div className="text-xs text-amber-600 font-medium flex items-center gap-1"><Clock className="w-3 h-3" />Today</div>}
                        {Number(b.outstandingBalance) > 0 && (
                          <div className="text-xs font-semibold text-rose-700">{formatCurrency(Number(b.outstandingBalance))}</div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Checkout detail */}
        {selectedBooking ? (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Checkout — {selectedBooking.reference}</CardTitle></CardHeader>
              <CardContent className="p-6 space-y-4">
                {/* Invoice breakdown */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-600">Guest</span><span className="font-medium">{selectedBooking.guestName}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Room</span><span className="font-medium">Room {selectedBooking.room.number} ({selectedBooking.isAc ? 'A/C' : 'Non-A/C'})</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Actual Check-In</span><span>{selectedBooking.actualCheckIn ? format(parseISO(selectedBooking.actualCheckIn), 'dd MMM HH:mm') : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Expected Check-Out</span><span>{format(parseISO(selectedBooking.checkOutDate), 'dd MMM HH:mm')}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Nights</span><span>{selectedBooking.nights}</span></div>
                  <div className="border-t border-slate-100 pt-2 mt-2 space-y-1.5">
                    <div className="flex justify-between"><span className="text-slate-600">Room Charge</span><span>{formatCurrency(Number(selectedBooking.baseNightlyRate) * selectedBooking.nights)}</span></div>
                    {selectedBooking.isAc && <div className="flex justify-between"><span className="text-slate-600">A/C Surcharge</span><span>{formatCurrency(Number(selectedBooking.acSurchargePerNight) * selectedBooking.nights)}</span></div>}
                    {Number(selectedBooking.additionalCharges) > 0 && <div className="flex justify-between"><span className="text-slate-600">Additional Charges</span><span>{formatCurrency(Number(selectedBooking.additionalCharges))}</span></div>}
                    {Number(selectedBooking.serviceCharge) > 0 && <div className="flex justify-between"><span className="text-slate-600">Service Charge</span><span>{formatCurrency(Number(selectedBooking.serviceCharge))}</span></div>}
                    {Number(selectedBooking.discount) > 0 && <div className="flex justify-between text-emerald-700"><span>Discount</span><span>−{formatCurrency(Number(selectedBooking.discount))}</span></div>}
                    <div className="flex justify-between font-bold border-t border-slate-200 pt-2"><span>Invoice Total</span><span>{formatCurrency(Number(selectedBooking.invoiceTotal))}</span></div>
                  </div>
                </div>

                {/* Payment history */}
                {selectedBooking.payments.length > 0 && (
                  <div className="bg-slate-50 rounded-lg p-3 space-y-1.5 text-sm">
                    <p className="font-medium text-slate-700 text-xs uppercase tracking-wide">Payments</p>
                    {selectedBooking.payments.map(p => (
                      <div key={p.id} className="flex justify-between text-slate-600">
                        <span>{p.purpose} ({p.method}) · {format(parseISO(p.paymentDate), 'dd MMM')}</span>
                        <span className="font-medium">{formatCurrency(Number(p.amount))}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-semibold border-t border-slate-200 pt-1.5">
                      <span>Paid</span><span className="text-emerald-700">{formatCurrency(Number(selectedBooking.paidAmount))}</span>
                    </div>
                    {outstanding > 0 && (
                      <div className="flex justify-between font-bold text-rose-700">
                        <span>Outstanding</span><span>{formatCurrency(outstanding)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Quick payment */}
                {outstanding > 0 && (
                  <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" /> Record Payment
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" min={0} max={outstanding} value={payAmount}
                        onChange={e => setPayAmount(Number(e.target.value))}
                        placeholder={`Amount (max ${outstanding})`} />
                      <Select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                        <option value="Cash">Cash</option>
                        <option value="Card">Card</option>
                        <option value="BankTransfer">Bank Transfer</option>
                        <option value="Other">Other</option>
                      </Select>
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={() => addPaymentMutation.mutate()}
                      disabled={addPaymentMutation.isPending || payAmount <= 0}>
                      <Plus className="w-3 h-3 mr-1" />
                      {addPaymentMutation.isPending ? 'Recording…' : 'Record Payment'}
                    </Button>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Check-Out Time</label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="datetime-local"
                      value={checkoutTime}
                      onChange={e => setCheckoutTime(e.target.value)}
                      className="w-56"
                    />
                    {checkoutTime ? (
                      <button type="button" className="text-xs text-indigo-600 hover:underline"
                        onClick={() => setCheckoutTime('')}>
                        Use current time
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">Leave empty = now (recorded automatically)</span>
                    )}
                  </div>
                </div>

                {/* Override for managers */}
                {outstanding > 0 && canOverride && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Override Reason (checkout with balance)</label>
                    <Input value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
                      placeholder="Manager authorization reason…" />
                  </div>
                )}

                {error && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                <Button
                  className="w-full"
                  variant={outstanding > 0 && !overrideReason ? 'secondary' : 'primary'}
                  disabled={checkoutMutation.isPending || (outstanding > 0 && !overrideReason && !canOverride)}
                  onClick={() => {
                    if (confirm(`Check out ${selectedBooking.guestName} from Room ${selectedBooking.room.number}?\n\nThis will finalise the invoice and move the room to Cleaning. This cannot be undone from the app.`)) {
                      checkoutMutation.mutate();
                    }
                  }}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {checkoutMutation.isPending ? 'Processing…' : 'Process Checkout & Generate Invoice'}
                </Button>

                {outstanding > 0 && !overrideReason && (
                  <p className="text-xs text-center text-amber-600">
                    {canOverride ? 'Enter override reason to checkout with outstanding balance' : 'Settle outstanding balance before checkout'}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex items-center justify-center h-48 bg-white border border-slate-200 rounded-xl text-sm text-slate-400">
            Select a booking from the queue to proceed
          </div>
        )}
      </div>
    </div>
  );
}
