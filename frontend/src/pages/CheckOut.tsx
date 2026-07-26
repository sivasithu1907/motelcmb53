import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserCheck, Clock, AlertTriangle, Upload, CheckCircle, CreditCard, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { StatusBadge } from '../components/ui/Badge';
import { formatCurrency, formatDateTime } from '../lib/utils';
import { api, apiError } from '../api/client';
import { format, parseISO, isToday, isPast } from 'date-fns';

interface Booking {
  id: string;
  reference: string;
  guestName: string;
  guestMobile: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  totalGuests: number;
  nights: number;
  isAc: boolean;
  baseNightlyRate: string;
  acSurchargePerNight: string;
  invoiceTotal: string;
  paidAmount: string;
  outstandingBalance: string;
  status: string;
  room: { number: string; capacity: number };
  guest: { id: string; fullName: string; documentNumberMasked: string; mobile: string; documents: Array<{id: string; side: string}> } | null;
}

export default function CheckIn() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedId = searchParams.get('booking');
  const [selectedId, setSelectedId] = useState(preselectedId || '');
  const [roomNotes, setRoomNotes] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFront, setUploadedFront] = useState(false);
  const [error, setError] = useState('');
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('Cash');
  const [payPurpose, setPayPurpose] = useState('Deposit');

  const { data: dueList = [] } = useQuery<Booking[]>({
    queryKey: ['checkin-due'],
    queryFn: () => api.get('/bookings', { params: { status: 'Reserved', limit: 50 } })
      .then(r => r.data.data.filter((b: Booking) => {
        const d = parseISO(b.checkInDate);
        return isToday(d) || isPast(d);
      })),
    refetchInterval: 30000,
  });

  const { data: selectedBooking, refetch: refetchBooking } = useQuery<Booking>({
    queryKey: ['booking', selectedId],
    queryFn: () => api.get(`/bookings/${selectedId}`).then(r => r.data),
    enabled: !!selectedId,
  });

  const addPaymentMutation = useMutation({
    mutationFn: () => api.post('/payments', {
      bookingId: selectedId,
      amount: payAmount,
      purpose: payPurpose,
      method: payMethod,
    }),
    onSuccess: () => {
      refetchBooking();
      setPayAmount(0);
    },
    onError: (err) => setError(apiError(err)),
  });

  const hasFrontDoc = selectedBooking?.guest?.documents?.some(d => d.side === 'front') || uploadedFront;

  const uploadDoc = async () => {
    if (!uploadFile || !selectedBooking?.guest) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('document', uploadFile);
      fd.append('side', 'front');
      await api.post(`/documents/guests/${selectedBooking.guest.id}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadedFront(true);
      qc.invalidateQueries({ queryKey: ['booking', selectedId] });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setUploading(false);
    }
  };

  const checkInMutation = useMutation({
    mutationFn: () => api.post(`/bookings/${selectedId}/check-in`, { roomConditionNotes: roomNotes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['checkin-due'] });
      navigate('/rooms');
    },
    onError: (err) => setError(apiError(err)),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Check-In Queue</h2>
        <p className="text-sm text-slate-500 mt-1">Arrivals due today and overdue arrivals</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Queue */}
        <Card>
          <CardHeader><CardTitle>Due Arrivals ({dueList.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {dueList.length === 0 && (
                <p className="px-6 py-8 text-center text-sm text-slate-400">No pending check-ins</p>
              )}
              {dueList.map(b => {
                const date = parseISO(b.checkInDate);
                const overdue = isPast(date) && !isToday(date);
                return (
                  <button key={b.id}
                    className={`w-full px-6 py-4 text-left hover:bg-slate-50 transition-colors ${selectedId === b.id ? 'bg-indigo-50' : ''}`}
                    onClick={() => { setSelectedId(b.id); setError(''); setUploadedFront(false); }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{b.guestName}</p>
                        <p className="text-xs text-slate-500">{b.reference} · Room {b.room.number}</p>
                        <p className="text-xs text-slate-500">{format(date, 'MMM dd, HH:mm')}</p>
                      </div>
                      <div className="text-right">
                        {overdue
                          ? <span className="inline-flex items-center text-xs text-rose-600 font-medium"><AlertTriangle className="w-3 h-3 mr-1" />Overdue</span>
                          : <span className="inline-flex items-center text-xs text-indigo-600 font-medium"><Clock className="w-3 h-3 mr-1" />Today</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Check-in form */}
        {selectedBooking ? (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Booking {selectedBooking.reference}</CardTitle></CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-slate-500">Guest</span><p className="font-medium">{selectedBooking.guestName}</p></div>
                  <div><span className="text-slate-500">Room</span><p className="font-bold text-lg">Room {selectedBooking.room.number}</p></div>
                  <div><span className="text-slate-500">Check-In</span><p className="font-medium">{format(parseISO(selectedBooking.checkInDate), 'dd MMM yyyy HH:mm')}</p></div>
                  <div><span className="text-slate-500">Check-Out</span><p className="font-medium">{format(parseISO(selectedBooking.checkOutDate), 'dd MMM yyyy HH:mm')}</p></div>
                  <div><span className="text-slate-500">Nights</span><p className="font-medium">{selectedBooking.nights}</p></div>
                  <div><span className="text-slate-500">Guests</span><p className="font-medium">{selectedBooking.totalGuests}</p></div>
                  <div><span className="text-slate-500">Type</span><p className="font-medium">{selectedBooking.isAc ? 'A/C' : 'Non-A/C'}</p></div>
                  <div><span className="text-slate-500">Total</span><p className="font-semibold">{formatCurrency(Number(selectedBooking.invoiceTotal))}</p></div>
                </div>

                {/* Document check */}
                <div className={`rounded-lg p-3 border ${hasFrontDoc ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {hasFrontDoc
                      ? <><CheckCircle className="w-4 h-4 text-emerald-600" /><span className="text-emerald-700">Identity document on file</span></>
                      : <><AlertTriangle className="w-4 h-4 text-amber-600" /><span className="text-amber-700">Identity document required before check-in</span></>}
                  </div>
                  {!hasFrontDoc && selectedBooking.guest && (
                    <div className="mt-3 space-y-2">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={e => setUploadFile(e.target.files?.[0] || null)}
                        className="text-sm text-slate-600"
                      />
                      {uploadFile && (
                        <Button size="sm" variant="outline" onClick={uploadDoc} disabled={uploading}>
                          <Upload className="w-3 h-3 mr-1" />
                          {uploading ? 'Uploading…' : 'Upload ID Document'}
                        </Button>
                      )}
                    </div>
                  )}
                  {!selectedBooking.guest && (
                    <p className="text-xs text-amber-600 mt-1">Create a guest record first to upload documents</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Room Condition Notes (optional)</label>
                  <textarea
                    value={roomNotes}
                    onChange={e => setRoomNotes(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    rows={2}
                    placeholder="Note any pre-existing room condition issues…"
                  />
                </div>

                {/* Balance summary */}
                <div className="bg-slate-50 rounded-lg p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-slate-600">Invoice Total</span><span className="font-semibold">{formatCurrency(Number(selectedBooking.invoiceTotal))}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Paid so far</span><span className="font-medium text-emerald-700">{formatCurrency(Number(selectedBooking.paidAmount))}</span></div>
                  <div className="flex justify-between font-bold border-t border-slate-200 pt-1.5">
                    <span>Balance Due</span>
                    <span className={Number(selectedBooking.outstandingBalance) > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                      {formatCurrency(Number(selectedBooking.outstandingBalance))}
                    </span>
                  </div>
                </div>

                {/* Collect payment at check-in */}
                {Number(selectedBooking.outstandingBalance) > 0 && (
                  <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" /> Collect Payment (optional)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input type="number" min={0} max={Number(selectedBooking.outstandingBalance)} value={payAmount || ''}
                        onChange={e => setPayAmount(Number(e.target.value))}
                        placeholder="Amount" />
                      <Select value={payPurpose} onChange={e => setPayPurpose(e.target.value)}>
                        <option value="Deposit">Deposit</option>
                        <option value="PartialPayment">Partial</option>
                        <option value="FinalPayment">Full Payment</option>
                      </Select>
                      <Select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                        <option value="Cash">Cash</option>
                        <option value="Card">Card</option>
                        <option value="BankTransfer">Bank Transfer</option>
                        <option value="Other">Other</option>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => addPaymentMutation.mutate()}
                        disabled={addPaymentMutation.isPending || payAmount <= 0}>
                        <Plus className="w-3 h-3 mr-1" />
                        {addPaymentMutation.isPending ? 'Recording…' : 'Record Payment'}
                      </Button>
                      <Button variant="ghost" size="sm"
                        onClick={() => setPayAmount(Number(selectedBooking.outstandingBalance))}>
                        Full amount
                      </Button>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                <Button
                  className="w-full"
                  disabled={checkInMutation.isPending || (!hasFrontDoc && !!selectedBooking.guest)}
                  onClick={() => checkInMutation.mutate()}
                >
                  <UserCheck className="w-4 h-4 mr-2" />
                  {checkInMutation.isPending ? 'Processing…' : 'Process Check-In'}
                </Button>

                {!hasFrontDoc && !selectedBooking.guest && (
                  <p className="text-xs text-center text-amber-600">
                    Note: Guest profile not linked — check-in proceeding without document verification
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
