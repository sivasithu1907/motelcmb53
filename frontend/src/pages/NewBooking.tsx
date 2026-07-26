import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays, format, addDays } from 'date-fns';
import { ChevronRight, ChevronLeft, Wind, Users, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { api, apiError } from '../api/client';

type Step = 'dates' | 'room' | 'guest' | 'summary';

interface AvailableRoom {
  id: string;
  number: string;
  capacity: number;
  nonAcRate: string;
  acSurcharge: string;
  isAvailable: boolean;
  conflictReason: string | null;
  status: string;
}

interface GuestSuggestion {
  id: string;
  fullName: string;
  documentNumberMasked: string;
  mobile: string;
}

export default function NewBooking() {
  const { currentBuildingId } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>('dates');
  const [checkIn, setCheckIn] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [checkInTime, setCheckInTime] = useState('14:00');
  const [checkOut, setCheckOut] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [checkOutTime, setCheckOutTime] = useState('12:00');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [selectedRoomId, setSelectedRoomId] = useState(searchParams.get('room') || '');
  const [isAc, setIsAc] = useState(false);
  const [guestSearch, setGuestSearch] = useState('');
  const [selectedGuestId, setSelectedGuestId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestMobile, setGuestMobile] = useState('');
  const [guestNic, setGuestNic] = useState('');
  const [nicFile, setNicFile] = useState<File | null>(null);
  const [depositAmount, setDepositAmount] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checkInNow, setCheckInNow] = useState(false);

  const nights = Math.max(1, differenceInCalendarDays(new Date(checkOut), new Date(checkIn)));
  const totalGuests = adults + children;

  // Fetch available rooms
  const { data: availableRooms = [], isLoading: roomsLoading } = useQuery<AvailableRoom[]>({
    queryKey: ['availability', currentBuildingId, checkIn, checkOut],
    queryFn: () => api.get('/rooms/availability', {
      params: {
        buildingId: currentBuildingId,
        checkIn: `${checkIn}T${checkInTime}:00`,
        checkOut: `${checkOut}T${checkOutTime}:00`,
      }
    }).then(r => r.data),
    enabled: !!checkIn && !!checkOut && checkOut > checkIn,
  });

  // Pre-select room from URL param
  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam && availableRooms.length > 0) {
      setSelectedRoomId(roomParam);
    }
  }, [searchParams, availableRooms]);

  // Guest search
  const { data: guestSuggestions = [] } = useQuery<GuestSuggestion[]>({
    queryKey: ['guests-search', guestSearch],
    queryFn: () => api.get('/guests', { params: { search: guestSearch, limit: 5 } }).then(r => r.data.data),
    enabled: guestSearch.length >= 2,
  });

  const selectedRoom = availableRooms.find(r => r.id === selectedRoomId);
  const nonAcRate = Number(selectedRoom?.nonAcRate || 0);
  const acSurcharge = Number(selectedRoom?.acSurcharge || 0);
  const acSurchargePerNight = isAc ? acSurcharge : 0;
  const roomCharge = (nonAcRate + acSurchargePerNight) * nights;
  const invoiceTotal = roomCharge - discountAmount;
  const balance = invoiceTotal - depositAmount;

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/bookings', data),
    onSuccess: async (res) => {
      // If a NIC copy was attached, upload it against the booking's guest record
      const guestId = res.data?.guestId;
      if (nicFile && guestId) {
        try {
          const fd = new FormData();
          fd.append('document', nicFile);
          fd.append('side', 'front');
          await api.post(`/documents/guests/${guestId}`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          alert('Booking created, but the NIC copy failed to upload. You can attach it again at check-in.');
        }
      }
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      navigate('/bookings');
    },
    onError: (err) => setErrors({ submit: apiError(err) }),
  });

  const validateStep = (s: Step): boolean => {
    const e: Record<string, string> = {};
    if (s === 'dates') {
      if (!checkIn) e.checkIn = 'Required';
      if (!checkOut) e.checkOut = 'Required';
      if (checkOut <= checkIn) e.checkOut = 'Must be after check-in';
      if (nights < 1) e.nights = 'Minimum 1 night';
    }
    if (s === 'room') {
      if (!selectedRoomId) e.room = 'Select a room';
      if (selectedRoom && !selectedRoom.isAvailable) e.room = 'Room is not available';
      if (selectedRoom && totalGuests > selectedRoom.capacity) e.room = `Room max capacity is ${selectedRoom.capacity}`;
    }
    if (s === 'guest') {
      if (!guestName.trim()) e.guestName = 'Guest name required';
      if (!guestMobile.trim()) e.guestMobile = 'Mobile number required';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    const order: Step[] = ['dates', 'room', 'guest', 'summary'];
    if (!validateStep(step)) return;
    const idx = order.indexOf(step);
    if (idx < order.length - 1) setStep(order[idx + 1]);
  };

  const back = () => {
    const order: Step[] = ['dates', 'room', 'guest', 'summary'];
    const idx = order.indexOf(step);
    if (idx > 0) setStep(order[idx - 1]);
  };

  const handleConfirm = () => {
    createMutation.mutate({
      buildingId: currentBuildingId,
      roomId: selectedRoomId,
      guestId: selectedGuestId || undefined,
      guestName,
      guestMobile,
      guestDocumentType: 'NIC',
      guestDocumentNumber: guestNic || undefined,
      checkInDate: `${checkIn}T${checkInTime}:00`,
      checkOutDate: `${checkOut}T${checkOutTime}:00`,
      adults,
      children,
      isAc,
      discountType: discountAmount > 0 ? 'fixed' : null,
      discountValue: discountAmount > 0 ? discountAmount : undefined,
      depositAmount: depositAmount > 0 ? depositAmount : undefined,
      depositMethod: 'Cash',
      notes,
      status: checkInNow ? 'CheckedIn' : 'Reserved',
    });
  };

  const StepIndicator = ({ label, active, done }: { label: string; active: boolean; done: boolean }) => (
    <div className={`flex items-center gap-2 text-sm font-medium ${active ? 'text-indigo-600' : done ? 'text-emerald-600' : 'text-slate-400'}`}>
      {done ? <CheckCircle className="w-4 h-4" /> : <div className={`w-4 h-4 rounded-full border-2 ${active ? 'border-indigo-600 bg-indigo-600' : 'border-current'}`} />}
      {label}
    </div>
  );

  const steps: Step[] = ['dates', 'room', 'guest', 'summary'];
  const stepLabels = { dates: 'Dates', room: 'Room', guest: 'Guest', summary: 'Confirm' };
  const currentIdx = steps.indexOf(step);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">New Booking</h2>
        <p className="text-sm text-slate-500 mt-1">Complete all steps to confirm the reservation</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4">
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <StepIndicator label={stepLabels[s]} active={s === step} done={currentIdx > i} />
            {i < steps.length - 1 && <div className="flex-1 h-px bg-slate-200 mx-2" />}
          </React.Fragment>
        ))}
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          {/* STEP: DATES */}
          {step === 'dates' && (
            <>
              <h3 className="text-lg font-semibold text-slate-900">Select Dates</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Check-In Date</label>
                  <Input type="date" value={checkIn} min={format(new Date(), 'yyyy-MM-dd')}
                    onChange={e => setCheckIn(e.target.value)} />
                  {errors.checkIn && <p className="text-xs text-rose-600 mt-1">{errors.checkIn}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Check-In Time</label>
                  <Input type="time" value={checkInTime} onChange={e => setCheckInTime(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Check-Out Date</label>
                  <Input type="date" value={checkOut} min={checkIn}
                    onChange={e => setCheckOut(e.target.value)} />
                  {errors.checkOut && <p className="text-xs text-rose-600 mt-1">{errors.checkOut}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Check-Out Time</label>
                  <Input type="time" value={checkOutTime} onChange={e => setCheckOutTime(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Adults</label>
                  <Input type="number" min={1} max={10} value={adults}
                    onChange={e => setAdults(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Children</label>
                  <Input type="number" min={0} max={10} value={children}
                    onChange={e => setChildren(Number(e.target.value))} />
                </div>
              </div>
              <div className="bg-indigo-50 rounded-lg p-3 text-sm text-indigo-700">
                <strong>{nights}</strong> night{nights !== 1 ? 's' : ''} · {totalGuests} guest{totalGuests !== 1 ? 's' : ''}
              </div>
            </>
          )}

          {/* STEP: ROOM */}
          {step === 'room' && (
            <>
              <h3 className="text-lg font-semibold text-slate-900">Select Room</h3>
              <div className="flex gap-4 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={!isAc} onChange={() => setIsAc(false)} />
                  <span className="text-sm font-medium text-slate-700">Non-A/C</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={isAc} onChange={() => setIsAc(true)} />
                  <Wind className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium text-slate-700">A/C (+LKR 2,500/night)</span>
                </label>
              </div>
              {errors.room && (
                <div className="flex items-center gap-2 text-rose-600 text-sm">
                  <AlertCircle className="w-4 h-4" />{errors.room}
                </div>
              )}
              {roomsLoading ? (
                <p className="text-sm text-slate-400">Checking availability…</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {availableRooms.map(room => {
                    const rate = Number(room.nonAcRate) + (isAc ? Number(room.acSurcharge) : 0);
                    const fits = totalGuests <= room.capacity;
                    const selectable = room.isAvailable && fits;
                    return (
                      <label key={room.id}
                        className={cn(
                          "flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors",
                          selectedRoomId === room.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300",
                          !selectable ? "opacity-50 cursor-not-allowed" : ""
                        )}
                      >
                        <input type="radio" name="room" value={room.id}
                          checked={selectedRoomId === room.id}
                          onChange={() => selectable && setSelectedRoomId(room.id)}
                          disabled={!selectable}
                          className="shrink-0"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">Room {room.number}</span>
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Users className="w-3 h-3" /> Max {room.capacity}
                            </span>
                            {!fits && <span className="text-xs text-rose-600">Exceeds capacity</span>}
                          </div>
                          {!room.isAvailable && (
                            <span className="text-xs text-rose-600">{room.conflictReason}</span>
                          )}
                        </div>
                        <span className="text-sm font-bold text-slate-900 shrink-0">{formatCurrency(rate)}/night</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* STEP: GUEST */}
          {step === 'guest' && (
            <>
              <h3 className="text-lg font-semibold text-slate-900">Guest Details</h3>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Search Existing Guest</label>
                <Input
                  placeholder="Search by name or mobile…"
                  value={guestSearch}
                  onChange={e => setGuestSearch(e.target.value)}
                />
                {guestSuggestions.length > 0 && guestSearch.length >= 2 && (
                  <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                    {guestSuggestions.map(g => (
                      <button key={g.id} type="button"
                        className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex justify-between items-center"
                        onClick={() => {
                          setSelectedGuestId(g.id);
                          setGuestName(g.fullName);
                          setGuestMobile(g.mobile);
                          setGuestSearch('');
                        }}>
                        <span className="font-medium">{g.fullName}</span>
                        <span className="text-slate-500 text-xs">{g.mobile}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs text-slate-500 mb-3">Or enter guest details manually:</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                    <Input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Full name as per ID" />
                    {errors.guestName && <p className="text-xs text-rose-600 mt-1">{errors.guestName}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Mobile Number *</label>
                    <Input value={guestMobile} onChange={e => setGuestMobile(e.target.value)} placeholder="07X XXXXXXX" />
                    {errors.guestMobile && <p className="text-xs text-rose-600 mt-1">{errors.guestMobile}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">NIC / Passport Number</label>
                    <Input value={guestNic} onChange={e => setGuestNic(e.target.value)} placeholder="NIC or passport number" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Attach NIC / Passport Copy</label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={e => setNicFile(e.target.files?.[0] || null)}
                      className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                    {nicFile ? (
                      <p className="text-xs text-emerald-600 mt-1">✓ {nicFile.name} attached — will be saved with the booking</p>
                    ) : (
                      <p className="text-xs text-slate-500 mt-1">Optional now — required before check-in</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Deposit (LKR)</label>
                  <Input type="number" min={0} value={depositAmount}
                    onChange={e => setDepositAmount(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Discount (LKR)</label>
                  <Input type="number" min={0} max={roomCharge} value={discountAmount}
                    onChange={e => setDiscountAmount(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    rows={2} placeholder="Special requests, preferences…" />
                </div>
              </div>
            </>
          )}

          {/* STEP: SUMMARY */}
          {step === 'summary' && selectedRoom && (
            <>
              <h3 className="text-lg font-semibold text-slate-900">Booking Summary</h3>
              <div className="bg-slate-50 rounded-xl p-5 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-600">Room</span><span className="font-semibold">Room {selectedRoom.number}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Guest</span><span className="font-semibold">{guestName}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Mobile</span><span>{guestMobile}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Check-In</span><span>{checkIn} {checkInTime}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Check-Out</span><span>{checkOut} {checkOutTime}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Nights</span><span>{nights}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Guests</span><span>{adults} adult{adults > 1 ? 's' : ''}{children > 0 ? `, ${children} child(ren)` : ''}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">A/C</span><span>{isAc ? 'Yes (+LKR 2,500/night)' : 'No'}</span></div>
                <div className="border-t border-slate-200 pt-3 space-y-1.5">
                  <div className="flex justify-between"><span className="text-slate-600">Base Room Charge</span><span>{formatCurrency(Number(selectedRoom.nonAcRate) * nights)}</span></div>
                  {isAc && <div className="flex justify-between"><span className="text-slate-600">A/C Surcharge</span><span>{formatCurrency(Number(selectedRoom.acSurcharge) * nights)}</span></div>}
                  {discountAmount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount</span><span>−{formatCurrency(discountAmount)}</span></div>}
                  <div className="flex justify-between font-bold text-base border-t border-slate-200 pt-2 mt-2">
                    <span>Total</span><span>{formatCurrency(invoiceTotal)}</span>
                  </div>
                  {depositAmount > 0 && <>
                    <div className="flex justify-between text-slate-600"><span>Deposit Paid</span><span>−{formatCurrency(depositAmount)}</span></div>
                    <div className="flex justify-between font-semibold text-rose-700"><span>Balance Due</span><span>{formatCurrency(balance)}</span></div>
                  </>}
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={checkInNow} onChange={e => setCheckInNow(e.target.checked)} className="w-4 h-4 rounded text-indigo-600" />
                <span className="text-sm font-medium text-slate-700">Check in guest immediately (walk-in)</span>
              </label>

              {errors.submit && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {errors.submit}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={step === 'dates' ? () => navigate('/rooms') : back}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          {step === 'dates' ? 'Cancel' : 'Back'}
        </Button>

        {step !== 'summary' ? (
          <Button onClick={next}>
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleConfirm} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : checkInNow ? 'Confirm & Check In' : 'Confirm Reservation'}
          </Button>
        )}
      </div>
    </div>
  );
}

function cn(...args: any[]) {
  return args.filter(Boolean).join(' ');
}
