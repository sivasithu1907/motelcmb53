import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserCheck, Clock, AlertTriangle, Upload, CheckCircle, CreditCard, Plus, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { formatCurrency } from '../lib/utils';
import { api, apiError } from '../api/client';
import { format, parseISO, isToday, isPast } from 'date-fns';

interface GuestDoc { id: string; side: string; }

interface BookingGuest {
  id: string;
  fullName: string;
  mobile: string;
  documentType: string;
  documentNumberMasked: string;
  hasValidDocNumber: boolean;
  documents: GuestDoc[];
}

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
  invoiceTotal: string;
  paidAmount: string;
  outstandingBalance: string;
  status: string;
  room: { number: string; capacity: number };
  guest: BookingGuest | null;
}

/** Compute all identity validation checks in one pass. */
function computeIdentityValidation(booking: Booking | undefined, hasFrontDoc: boolean) {
  if (!booking) return null;
  const g = booking.guest;
  return {
    hasGuestProfile:  !!g,
    hasName:          !!(booking.guestName?.trim()),
    hasMobile:        !!(booking.guestMobile?.trim()),
    hasDocType:       !!(g?.documentType?.trim()),
    hasValidDocNum:   !!(g?.hasValidDocNumber),
    hasFrontImage:    hasFrontDoc,
    get isComplete() {
      return this.hasGuestProfile && this.hasName && this.hasMobile &&
             this.hasDocType && this.hasValidDocNum && this.hasFrontImage;
    },
  };
}

export default function CheckIn() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedId = searchParams.get('booking') || searchParams.get('bookingId');

  const [selectedId, setSelectedId] = useState(preselectedId || '');
  const [roomNotes, setRoomNotes] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFront, setUploadedFront] = useState(false);
  const [error, setError] = useState('');

  // Inline guest detail correction
  const [editDocType, setEditDocType] = useState('NIC');
  const [editDocNumber, setEditDocNumber] = useState('');
  const [savingGuestDetails, setSavingGuestDetails] = useState(false);

  // Payment collection
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('Cash');
  const [payPurpose, setPayPurpose] = useState('Deposit');

  const { data: dueList = [] } = useQuery<Booking[]>({
    queryKey: ['checkin-due'],
    queryFn: () => api.get('/bookings', { params: { limit: 100 } })
      .then(r => r.data.data.filter((b: Booking) => {
        const d = parseISO(b.checkInDate);
        return (isToday(d) || isPast(d)) && ['Reserved', 'Confirmed'].includes(b.status);
      })),
    refetchInterval: 30000,
  });

  const { data: selectedBooking, refetch: refetchBooking } = useQuery({
    queryKey: ['booking', selectedId] as const,
    queryFn: (): Promise<Booking> => api.get(`/bookings/${selectedId}`).then(r => r.data),
    enabled: !!selectedId,
  });

  const hasFrontDoc = selectedBooking?.guest?.documents?.some(d => d.side === 'front') || uploadedFront;
  const identity = computeIdentityValidation(selectedBooking, hasFrontDoc);

  const needsInlineDocEdit =
    identity && identity.hasGuestProfile && (!identity.hasDocType || !identity.hasValidDocNum);

  const saveGuestDetails = async () => {
    if (!selectedBooking?.guest || !editDocNumber.trim()) return;
    setSavingGuestDetails(true);
    setError('');
    try {
      await api.patch(`/guests/${selectedBooking.guest.id}`, {
        documentType: editDocType,
        documentNumber: editDocNumber.trim(),
      });
      const updated = await refetchBooking();
      const updatedGuest = (updated.data as Booking | undefined)?.guest;
      setEditDocType(updatedGuest?.documentType || 'NIC');
      setEditDocNumber('');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSavingGuestDetails(false);
    }
  };

  const uploadDoc = async () => {
    if (!uploadFile || !selectedBooking?.guest) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('document', uploadFile);
      fd.append('side', 'front');
      await api.post(`/documents/guests/${selectedBooking.guest.id}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadedFront(true);
      setUploadFile(null);
      await refetchBooking();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setUploading(false);
    }
  };

  const addPaymentMutation = useMutation({
    mutationFn: () => api.post('/payments', {
      bookingId: selectedId,
      amount: payAmount,
      purpose: payPurpose,
      method: payMethod,
    }),
    onSuccess: () => { refetchBooking(); setPayAmount(0); },
    onError: (err) => setError(apiError(err)),
  });

  const checkInMutation = useMutation({
    mutationFn: () => api.post(`/bookings/${selectedId}/check-in`, {
      roomConditionNotes: roomNotes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['checkin-due'] });
      qc.invalidateQueries({ queryKey: ['in-house'] });
      navigate('/rooms');
    },
    onError: (err) => setError(apiError(err)),
  });

  const selectBooking = (id: string) => {
    setSelectedId(id);
    setError('');
    setUploadedFront(false);
    setUploadFile(null);
    setEditDocNumber('');
  };

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
                    className={`w-full px-6 py-4 text-left hover:bg-slate-50 transition-colors ${selectedId === b.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''}`}
                    onClick={() => selectBooking(b.id)}>
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

        {/* Check-in panel */}
        {selectedBooking ? (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Booking {selectedBooking.reference}</CardTitle></CardHeader>
              <CardContent className="p-6 space-y-4">

                {/* Booking summary */}
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

                {/* ─── Identity Verification Panel ─── */}
                {identity && (
                  <div className="rounded-lg border divide-y divide-slate-100 overflow-hidden">
                    <div className={`px-4 py-3 flex items-center gap-2 text-sm font-medium ${
                      identity.isComplete ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                      {identity.isComplete
                        ? <><CheckCircle className="w-4 h-4" /> Guest identity verification complete</>
                        : <><AlertTriangle className="w-4 h-4" /> Identity verification incomplete</>}
                    </div>

                    {/* Per-field status */}
                    <div className="bg-white divide-y divide-slate-50">
                      {/* No guest profile */}
                      {!identity.hasGuestProfile && (
                        <div className="px-4 py-3 flex items-center gap-2 bg-rose-50">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="text-sm text-rose-700">Guest profile must be linked before check-in</span>
                        </div>
                      )}

                      {/* Doc type missing or invalid doc number */}
                      {identity.hasGuestProfile && needsInlineDocEdit && (
                        <div className="px-4 py-3 space-y-3 bg-amber-50">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="text-sm text-amber-800">
                              {!identity.hasDocType
                                ? 'Document type is missing'
                                : 'NIC or passport number is invalid or missing'}
                            </span>
                          </div>
                          {/* Inline edit */}
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Document Type</label>
                              <Select value={editDocType} onChange={e => setEditDocType(e.target.value)}>
                                <option value="NIC">NIC</option>
                                <option value="Passport">Passport</option>
                              </Select>
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1">Document Number</label>
                              <Input
                                value={editDocNumber}
                                onChange={e => setEditDocNumber(e.target.value)}
                                placeholder={editDocType === 'Passport' ? 'N12345678' : '199X12345678'}
                              />
                            </div>
                          </div>
                          <Button size="sm" variant="outline" onClick={saveGuestDetails}
                            disabled={savingGuestDetails || !editDocNumber.trim()}>
                            <Save className="w-3.5 h-3.5 mr-1.5" />
                            {savingGuestDetails ? 'Saving…' : 'Save Guest Details'}
                          </Button>
                        </div>
                      )}

                      {/* Valid doc number — show masked */}
                      {identity.hasGuestProfile && identity.hasValidDocNum && (
                        <div className="px-4 py-2.5 flex items-center gap-2">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="text-xs text-slate-600">
                            {selectedBooking.guest?.documentType} {selectedBooking.guest?.documentNumberMasked}
                          </span>
                        </div>
                      )}

                      {/* Front image */}
                      <div className="px-4 py-3">
                        {identity.hasFrontImage ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="text-sm text-emerald-700">Identity document image on file</span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span className="text-sm text-amber-800">Front identity document image is missing</span>
                            </div>
                            {identity.hasGuestProfile ? (
                              <div className="space-y-2">
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                                  className="block text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700"
                                />
                                {uploadFile && (
                                  <Button size="sm" variant="outline" onClick={uploadDoc} disabled={uploading}>
                                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                                    {uploading ? 'Uploading…' : 'Upload Identity Document'}
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-rose-600">Link a guest profile first to upload documents</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Room condition notes */}
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

                {/* Optional payment at check-in */}
                {Number(selectedBooking.outstandingBalance) > 0 && (
                  <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" /> Collect Payment (optional)
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="number" min={0} max={Number(selectedBooking.outstandingBalance)}
                        value={payAmount || ''} onChange={e => setPayAmount(Number(e.target.value))} placeholder="Amount" />
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
                      <Button variant="outline" size="sm" className="flex-1"
                        onClick={() => addPaymentMutation.mutate()}
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

                {/* Error display */}
                {error && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Process Check-In button */}
                <Button
                  className="w-full"
                  disabled={checkInMutation.isPending || !identity?.isComplete}
                  onClick={() => { setError(''); checkInMutation.mutate(); }}
                >
                  <UserCheck className="w-4 h-4 mr-2" />
                  {checkInMutation.isPending ? 'Processing…' : 'Process Check-In'}
                </Button>

                {/* Explain why disabled (no generic bypass) */}
                {!identity?.isComplete && (
                  <p className="text-xs text-center text-slate-500">
                    {!identity?.hasGuestProfile
                      ? 'Guest profile must be linked before check-in'
                      : !identity?.hasValidDocNum
                      ? 'Valid NIC or passport number required'
                      : !identity?.hasFrontImage
                      ? 'Upload the front identity document to proceed'
                      : 'Complete all identity requirements above'}
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
