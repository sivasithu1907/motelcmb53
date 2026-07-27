import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays, format, addDays } from 'date-fns';
import {
  ChevronRight, ChevronLeft, Wind, Users, CheckCircle, AlertCircle,
  UserCheck, CalendarDays, X, RefreshCw,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { api, apiError } from '../api/client';

type Step = 'dates' | 'room' | 'guest' | 'summary';
type DocType = 'NIC' | 'Passport';

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
  documentType: string;
  documentNumberMasked: string;
  mobile: string;
}

interface ExistingGuestDetail {
  documentType: string;
  documentNumberMasked: string;
  hasValidDocNumber: boolean;
  hasFrontDoc: boolean;
}

const PLACEHOLDER_PREFIXES = ['PENDING', 'UNKNOWN', 'TEMP'];
function isPlaceholderDoc(num: string): boolean {
  if (!num || num.trim() === '') return true;
  return PLACEHOLDER_PREFIXES.some(p => num.toUpperCase().startsWith(p));
}

/** Returns current date/time in Asia/Colombo timezone. */
function colomboNow(): { date: string; time: string } {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }));
  return { date: format(local, 'yyyy-MM-dd'), time: format(local, 'HH:mm') };
}

// ─── Booking Type Selection ───────────────────────────────────────────────────

function BookingTypeSelection({ roomId }: { roomId: string | null }) {
  const navigate = useNavigate();
  const go = (mode: string) => {
    const params = new URLSearchParams();
    if (roomId) params.set('room', roomId);
    params.set('mode', mode);
    navigate(`/book?${params.toString()}`);
  };
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">New Booking</h2>
        <p className="text-sm text-slate-500 mt-1">How is this guest booking?</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button onClick={() => go('walk-in')}
          className="group text-left p-6 bg-white border-2 border-slate-200 rounded-2xl hover:border-indigo-500 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-200 transition-colors">
            <UserCheck className="w-6 h-6 text-indigo-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Walk-In Check-In</h3>
          <p className="text-sm text-slate-500">Guest is at reception and will check in immediately.</p>
          <div className="mt-4 inline-flex items-center gap-1 text-indigo-600 text-sm font-medium group-hover:gap-2 transition-all">
            Select <ChevronRight className="w-4 h-4" />
          </div>
        </button>
        <button onClick={() => go('reservation')}
          className="group text-left p-6 bg-white border-2 border-slate-200 rounded-2xl hover:border-emerald-500 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500">
          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-emerald-200 transition-colors">
            <CalendarDays className="w-6 h-6 text-emerald-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Reservation</h3>
          <p className="text-sm text-slate-500">Guest will arrive and check in later.</p>
          <div className="mt-4 inline-flex items-center gap-1 text-emerald-600 text-sm font-medium group-hover:gap-2 transition-all">
            Select <ChevronRight className="w-4 h-4" />
          </div>
        </button>
      </div>
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <X className="w-4 h-4 mr-1" /> Cancel
      </Button>
    </div>
  );
}

// ─── Booking Wizard ───────────────────────────────────────────────────────────

export default function NewBooking() {
  const { currentBuildingId } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const mode = searchParams.get('mode');
  const isWalkIn = mode === 'walk-in';
  if (!mode) return <BookingTypeSelection roomId={searchParams.get('room')} />;
  return (
    <BookingWizard
      isWalkIn={isWalkIn}
      preselectedRoom={searchParams.get('room') || ''}
      buildingId={currentBuildingId}
      navigate={navigate}
      qc={qc}
    />
  );
}

function BookingWizard({
  isWalkIn, preselectedRoom, buildingId, navigate, qc,
}: {
  isWalkIn: boolean;
  preselectedRoom: string;
  buildingId: string;
  navigate: ReturnType<typeof useNavigate>;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const now = colomboNow();

  const [step, setStep] = useState<Step>('dates');
  const [checkIn, setCheckIn] = useState(now.date);
  const [checkInTime, setCheckInTime] = useState(isWalkIn ? now.time : '14:00');
  const [checkOut, setCheckOut] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [checkOutTime, setCheckOutTime] = useState('12:00');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [selectedRoomId, setSelectedRoomId] = useState(preselectedRoom);
  const [isAc, setIsAc] = useState(false);

  // Guest fields
  const [guestSearch, setGuestSearch] = useState('');
  const [selectedGuestId, setSelectedGuestId] = useState('');
  const [existingGuestDetail, setExistingGuestDetail] = useState<ExistingGuestDetail | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestMobile, setGuestMobile] = useState('');
  const [guestDocType, setGuestDocType] = useState<DocType>('NIC');
  const [guestDocNumber, setGuestDocNumber] = useState('');
  const [primaryIdFile, setPrimaryIdFile] = useState<File | null>(null);
  const [primaryIdPreview, setPrimaryIdPreview] = useState<string | null>(null);

  // Booking extras
  const [customRate, setCustomRate] = useState<number | null>(null);
  const [depositAmount, setDepositAmount] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Walk-in failure state
  const [walkInBookingRef, setWalkInBookingRef] = useState('');
  const [walkInBookingId, setWalkInBookingId] = useState('');
  const [walkInFailed, setWalkInFailed] = useState<'upload' | 'checkin' | null>(null);
  const [walkInFailedMsg, setWalkInFailedMsg] = useState('');

  const nights = Math.max(1, differenceInCalendarDays(new Date(checkOut), new Date(checkIn)));
  const totalGuests = adults + children;

  const { data: availableRooms = [], isLoading: roomsLoading } = useQuery<AvailableRoom[]>({
    queryKey: ['availability', buildingId, checkIn, checkOut],
    queryFn: () => api.get('/rooms/availability', {
      params: { buildingId, checkIn: `${checkIn}T${checkInTime}:00`, checkOut: `${checkOut}T${checkOutTime}:00` }
    }).then(r => r.data),
    enabled: !!checkIn && !!checkOut && checkOut > checkIn,
  });

  useEffect(() => {
    if (preselectedRoom && availableRooms.length > 0) setSelectedRoomId(preselectedRoom);
  }, [preselectedRoom, availableRooms]);

  const { data: guestSuggestions = [] } = useQuery<GuestSuggestion[]>({
    queryKey: ['guests-search', guestSearch],
    queryFn: () => api.get('/guests', { params: { search: guestSearch, limit: 5 } }).then(r => r.data.data),
    enabled: guestSearch.length >= 2,
  });

  const selectedRoom = availableRooms.find(r => r.id === selectedRoomId);
  const standardRate = Number(selectedRoom?.nonAcRate || 0);
  const nonAcRate = customRate !== null && customRate > 0 ? customRate : standardRate;
  const acSurcharge = Number(selectedRoom?.acSurcharge || 0);
  const acSurchargePerNight = isAc ? acSurcharge : 0;
  const roomCharge = (nonAcRate + acSurchargePerNight) * nights;
  const invoiceTotal = roomCharge - discountAmount;
  const balance = invoiceTotal - depositAmount;

  // Derive validation-relevant guest doc states
  const existingDocValid = existingGuestDetail?.hasValidDocNumber ?? false;
  const existingImageValid = existingGuestDetail?.hasFrontDoc ?? false;
  const docNumberCovered = guestDocNumber.trim() !== '' || (!!selectedGuestId && existingDocValid);
  const imageCovered = !!primaryIdFile || (!!selectedGuestId && existingImageValid);

  const handlePrimaryIdChange = (file: File | null) => {
    setPrimaryIdFile(file);
    if (primaryIdPreview) URL.revokeObjectURL(primaryIdPreview);
    setPrimaryIdPreview(file ? URL.createObjectURL(file) : null);
  };

  const selectExistingGuest = async (g: GuestSuggestion) => {
    setSelectedGuestId(g.id);
    setGuestName(g.fullName);
    setGuestMobile(g.mobile);
    setGuestSearch('');
    try {
      const res = await api.get(`/guests/${g.id}`);
      const detail = res.data;
      setExistingGuestDetail({
        documentType: detail.documentType || 'NIC',
        documentNumberMasked: detail.documentNumberMasked || '',
        hasValidDocNumber: detail.hasValidDocNumber ?? !isPlaceholderDoc(detail.documentNumberMasked || ''),
        hasFrontDoc: detail.documents?.some((d: any) => d.side === 'front') ?? false,
      });
      setGuestDocType((detail.documentType as DocType) || 'NIC');
    } catch {
      setExistingGuestDetail(null);
    }
  };

  const clearExistingGuest = () => {
    setSelectedGuestId('');
    setExistingGuestDetail(null);
    setGuestName('');
    setGuestMobile('');
    setGuestDocType('NIC');
    setGuestDocNumber('');
    handlePrimaryIdChange(null);
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/bookings', data),
    onSuccess: async (res) => {
      const bookingId = res.data?.id;
      const guestId = res.data?.guestId;
      const ref = res.data?.reference;
      setWalkInBookingId(bookingId || '');
      setWalkInBookingRef(ref || '');

      // Upload primary ID if provided
      if (primaryIdFile && guestId) {
        try {
          const fd = new FormData();
          fd.append('document', primaryIdFile);
          fd.append('side', 'front');
          await api.post(`/documents/guests/${guestId}`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (err) {
          if (isWalkIn) {
            setWalkInFailed('upload');
            setWalkInFailedMsg(`ID document upload failed: ${apiError(err)}`);
            setStep('summary');
            qc.invalidateQueries({ queryKey: ['bookings'] });
            return;
          } else {
            // Reservation: continue but warn
            setErrors({ submit: `Booking saved (${ref}) but ID upload failed. Upload from the Check-In page before check-in.` });
            qc.invalidateQueries({ queryKey: ['bookings'] });
            return;
          }
        }
      }

      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['bookings'] });

      if (isWalkIn && bookingId) {
        try {
          const ciRes = await api.post(`/bookings/${bookingId}/check-in`, { roomConditionNotes: notes || undefined });
          const newInvId = ciRes.data?.invoiceId;
          qc.invalidateQueries({ queryKey: ['checkin-due'] });
          qc.invalidateQueries({ queryKey: ['in-house'] });
          qc.invalidateQueries({ queryKey: ['rooms'] });
          navigate(newInvId ? `/check-in-payment/${newInvId}?from=checkin` : '/in-house');
        } catch (err) {
          setWalkInFailed('checkin');
          setWalkInFailedMsg(apiError(err));
          setStep('summary');
        }
      } else {
        navigate('/bookings');
      }
    },
    onError: (err) => setErrors({ submit: apiError(err) }),
  });

  const retryCheckIn = async () => {
    if (!walkInBookingId) return;
    setWalkInFailed(null);
    setWalkInFailedMsg('');
    try {
      await api.post(`/bookings/${walkInBookingId}/check-in`, { roomConditionNotes: notes || undefined });
      qc.invalidateQueries({ queryKey: ['rooms', 'bookings', 'checkin-due', 'in-house'] });
      navigate('/in-house');
    } catch (err) {
      setWalkInFailed('checkin');
      setWalkInFailedMsg(apiError(err));
    }
  };

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
      if (!guestName.trim()) e.guestName = 'Guest name is required';
      if (!guestMobile.trim()) e.guestMobile = 'Mobile number is required';
      // Both modes: NIC/passport number required (no placeholders, no empty)
      if (!docNumberCovered) {
        e.guestDocNumber = `${guestDocType === 'Passport' ? 'Passport' : 'NIC'} number is required`;
      }
      // Walk-in: front identity image required (unless existing guest already has one on file)
      if (isWalkIn && !imageCovered) {
        e.nicDoc = 'Front identity document image is required for walk-in check-in';
      }
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
    setWalkInFailed(null);
    setWalkInFailedMsg('');
    createMutation.mutate({
      buildingId,
      roomId: selectedRoomId,
      guestId: selectedGuestId || undefined,
      guestName,
      guestMobile,
      guestDocumentType: guestDocType,
      guestDocumentNumber: guestDocNumber.trim() || undefined,
      overrideNightlyRate: customRate !== null && customRate > 0 && customRate !== standardRate ? customRate : undefined,
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
      status: 'Confirmed',
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
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">New Booking</h2>
          <p className="text-sm text-slate-500 mt-1">Complete all steps to {isWalkIn ? 'check in the guest' : 'confirm the reservation'}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${isWalkIn ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {isWalkIn ? <><UserCheck className="w-3.5 h-3.5" /> Walk-In</> : <><CalendarDays className="w-3.5 h-3.5" /> Reservation</>}
        </span>
      </div>

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
              {isWalkIn && (
                <div className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
                  <UserCheck className="w-4 h-4 shrink-0" />
                  Check-in time defaults to now — adjust if needed.
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Check-In Date</label>
                  <Input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} />
                  {errors.checkIn && <p className="text-xs text-rose-600 mt-1">{errors.checkIn}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Check-In Time</label>
                  <Input type="time" value={checkInTime} onChange={e => setCheckInTime(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Check-Out Date</label>
                  <Input type="date" value={checkOut} min={checkIn} onChange={e => setCheckOut(e.target.value)} />
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
                  <Input type="number" min={1} max={10} value={adults} onChange={e => setAdults(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Children</label>
                  <Input type="number" min={0} max={10} value={children} onChange={e => setChildren(Number(e.target.value))} />
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
              {errors.room && <div className="flex items-center gap-2 text-rose-600 text-sm"><AlertCircle className="w-4 h-4" />{errors.room}</div>}
              {roomsLoading ? (
                <p className="text-sm text-slate-400">Checking availability…</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {availableRooms.map(room => {
                    const rate = Number(room.nonAcRate) + (isAc ? Number(room.acSurcharge) : 0);
                    const fits = totalGuests <= room.capacity;
                    const selectable = room.isAvailable && fits;
                    return (
                      <label key={room.id} className={cn(
                        "flex items-center gap-3 p-3 border rounded-lg transition-colors",
                        selectable ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                        selectedRoomId === room.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300",
                      )}>
                        <input type="radio" name="room" value={room.id} checked={selectedRoomId === room.id}
                          onChange={() => selectable && setSelectedRoomId(room.id)} disabled={!selectable} className="shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">Room {room.number}</span>
                            <span className="text-xs text-slate-500 flex items-center gap-1"><Users className="w-3 h-3" /> Max {room.capacity}</span>
                            {!fits && <span className="text-xs text-rose-600">Exceeds capacity</span>}
                          </div>
                          {!room.isAvailable && <span className="text-xs text-rose-600">{room.conflictReason}</span>}
                        </div>
                        <span className="text-sm font-bold text-slate-900 shrink-0">{formatCurrency(rate)}/night</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {selectedRoom && (
                <div className="border-t border-slate-100 pt-4 mt-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Room Charge per Night (LKR) {isAc && <span className="text-slate-400 font-normal">— excl. A/C surcharge</span>}
                  </label>
                  <div className="flex items-center gap-3">
                    <Input type="number" min={0} className="w-44"
                      value={customRate !== null ? customRate : standardRate}
                      onChange={e => setCustomRate(Number(e.target.value))} />
                    {customRate !== null && customRate !== standardRate ? (
                      <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => setCustomRate(null)}>
                        Reset to standard ({formatCurrency(standardRate)})
                      </button>
                    ) : <span className="text-xs text-slate-500">Standard rate</span>}
                  </div>
                </div>
              )}
            </>
          )}

          {/* STEP: GUEST */}
          {step === 'guest' && (
            <>
              <h3 className="text-lg font-semibold text-slate-900">Guest Details</h3>

              {isWalkIn && (
                <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm px-4 py-3 rounded-lg">
                  <p className="font-medium flex items-center gap-2 mb-1"><UserCheck className="w-4 h-4" /> Walk-In Requirements</p>
                  <ul className="list-disc list-inside text-xs space-y-0.5 text-indigo-700">
                    <li>Full name, mobile number</li>
                    <li>Document type and number</li>
                    <li>Front identity document photo <strong>(required)</strong></li>
                  </ul>
                </div>
              )}

              {/* Existing guest search */}
              {!selectedGuestId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Search Existing Guest</label>
                  <Input placeholder="Search by name or mobile…" value={guestSearch} onChange={e => setGuestSearch(e.target.value)} />
                  {guestSuggestions.length > 0 && guestSearch.length >= 2 && (
                    <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                      {guestSuggestions.map(g => (
                        <button key={g.id} type="button"
                          className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex justify-between items-center"
                          onClick={() => selectExistingGuest(g)}>
                          <div>
                            <span className="font-medium">{g.fullName}</span>
                            <span className="text-slate-400 text-xs ml-2">{g.documentType} {g.documentNumberMasked}</span>
                          </div>
                          <span className="text-slate-500 text-xs">{g.mobile}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Selected existing guest banner */}
              {selectedGuestId && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Using existing guest record</p>
                    {existingGuestDetail && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {existingGuestDetail.documentType} {existingGuestDetail.documentNumberMasked}
                        {existingGuestDetail.hasFrontDoc && <span className="ml-2 text-emerald-600">· Identity document on file</span>}
                      </p>
                    )}
                  </div>
                  <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={clearExistingGuest}>
                    Use different guest
                  </button>
                </div>
              )}

              <div className="border-t border-slate-100 pt-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                  <Input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Full name as per identity document" />
                  {errors.guestName && <p className="text-xs text-rose-600 mt-1">{errors.guestName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mobile Number *</label>
                  <Input value={guestMobile} onChange={e => setGuestMobile(e.target.value)} placeholder="07X XXXXXXX" />
                  {errors.guestMobile && <p className="text-xs text-rose-600 mt-1">{errors.guestMobile}</p>}
                </div>

                {/* Document type + number — mandatory for BOTH modes */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Document Type *</label>
                    <Select value={guestDocType} onChange={e => setGuestDocType(e.target.value as DocType)}>
                      <option value="NIC">NIC</option>
                      <option value="Passport">Passport</option>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      {guestDocType === 'Passport' ? 'Passport Number' : 'NIC Number'} *
                    </label>
                    {selectedGuestId && existingGuestDetail?.hasValidDocNumber && !guestDocNumber.trim() ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
                          {existingGuestDetail.documentNumberMasked} <span className="text-emerald-600 text-xs">on file</span>
                        </div>
                        <button type="button" className="text-xs text-indigo-600 hover:underline whitespace-nowrap"
                          onClick={() => setGuestDocNumber('')}>Update</button>
                      </div>
                    ) : (
                      <Input
                        value={guestDocNumber}
                        onChange={e => setGuestDocNumber(e.target.value)}
                        placeholder={guestDocType === 'Passport' ? 'N12345678' : '199X12345678'}
                      />
                    )}
                    {errors.guestDocNumber && <p className="text-xs text-rose-600 mt-1">{errors.guestDocNumber}</p>}
                  </div>
                </div>

                {/* Front identity document */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Front Identity Document
                    {isWalkIn && <span className="text-rose-500"> *</span>}
                    {!isWalkIn && <span className="text-slate-400 font-normal"> (optional — required before check-in)</span>}
                  </label>

                  {/* Existing guest already has a front doc */}
                  {selectedGuestId && existingGuestDetail?.hasFrontDoc && !primaryIdFile && (
                    <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="text-sm text-emerald-700 flex-1">Identity document already on file</span>
                      <label className="cursor-pointer text-xs text-indigo-600 hover:underline">
                        Replace
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                          onChange={e => handlePrimaryIdChange(e.target.files?.[0] || null)} />
                      </label>
                    </div>
                  )}

                  {/* Preview of newly selected file */}
                  {primaryIdFile && primaryIdPreview && (
                    <div className="space-y-2">
                      <img src={primaryIdPreview} alt="ID preview" className="h-36 w-auto max-w-full object-contain rounded-lg border border-slate-200 bg-slate-50" />
                      <div className="flex gap-2 items-center">
                        <label className="cursor-pointer">
                          <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700">Replace</span>
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                            onChange={e => handlePrimaryIdChange(e.target.files?.[0] || null)} />
                        </label>
                        <button type="button" onClick={() => handlePrimaryIdChange(null)}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50">
                          Remove
                        </button>
                        <span className="text-xs text-emerald-600 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />{primaryIdFile.name}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Upload area — only when no existing doc and no preview */}
                  {!(selectedGuestId && existingGuestDetail?.hasFrontDoc) && !primaryIdFile && (
                    <label className={cn(
                      "flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors",
                      errors.nicDoc ? "border-rose-300 bg-rose-50" : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"
                    )}>
                      <div className="text-center">
                        <div className="text-2xl mb-1">📷</div>
                        <p className="text-xs text-slate-500">Click to upload JPEG, PNG or WebP</p>
                        {isWalkIn && <p className="text-xs text-rose-500 mt-1">Required for walk-in</p>}
                      </div>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                        onChange={e => handlePrimaryIdChange(e.target.files?.[0] || null)} />
                    </label>
                  )}
                  {errors.nicDoc && <p className="text-xs text-rose-600 mt-1">{errors.nicDoc}</p>}
                </div>
              </div>

              {/* Deposit / Discount / Notes */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Deposit (LKR)</label>
                  <Input type="number" min={0} value={depositAmount} onChange={e => setDepositAmount(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Discount (LKR)</label>
                  <Input type="number" min={0} max={roomCharge} value={discountAmount} onChange={e => setDiscountAmount(Number(e.target.value))} />
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

              {isWalkIn ? (
                <div className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
                  <UserCheck className="w-4 h-4 shrink-0" />
                  Walk-In — guest will be checked in immediately on confirmation.
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 text-slate-600 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 shrink-0" />
                  Reservation — identity document must be uploaded before check-in.
                </div>
              )}

              {/* Walk-in failure state */}
              {walkInFailed && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm px-4 py-3 rounded-lg space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">
                        {walkInFailed === 'upload' ? 'ID Document Upload Failed' : 'Check-In Failed'}
                      </p>
                      <p className="mt-1">{walkInFailedMsg}</p>
                      {walkInBookingRef && (
                        <p className="text-xs text-rose-600 mt-1">Booking {walkInBookingRef} was created and is in Confirmed status.</p>
                      )}
                    </div>
                  </div>
                  {walkInFailed === 'checkin' && (
                    <Button variant="outline" size="sm" onClick={retryCheckIn} className="border-rose-300 text-rose-700 hover:bg-rose-100">
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry Check-In
                    </Button>
                  )}
                  {walkInFailed === 'upload' && (
                    <p className="text-xs text-rose-600">Please upload the ID document from the Check-In Queue and retry.</p>
                  )}
                </div>
              )}

              <div className="bg-slate-50 rounded-xl p-5 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-600">Room</span><span className="font-semibold">Room {selectedRoom.number}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Guest</span><span className="font-semibold">{guestName}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Mobile</span><span>{guestMobile}</span></div>
                <div className="flex justify-between">
                  <span className="text-slate-600">{guestDocType}</span>
                  <span>{guestDocNumber || existingGuestDetail?.documentNumberMasked || '—'}</span>
                </div>
                {(primaryIdFile || existingGuestDetail?.hasFrontDoc) && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Identity Document</span>
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <CheckCircle className="w-3.5 h-3.5" /> {primaryIdFile ? 'Attached' : 'On file'}
                    </span>
                  </div>
                )}
                <div className="flex justify-between"><span className="text-slate-600">Check-In</span><span>{checkIn} {checkInTime}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Check-Out</span><span>{checkOut} {checkOutTime}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Nights</span><span>{nights}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Guests</span><span>{adults} adult{adults > 1 ? 's' : ''}{children > 0 ? `, ${children} child(ren)` : ''}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">A/C</span><span>{isAc ? 'Yes (+LKR 2,500/night)' : 'No'}</span></div>
                <div className="border-t border-slate-200 pt-3 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Room Charge ({formatCurrency(nonAcRate)}/night{customRate !== null && customRate !== standardRate ? ' — custom' : ''})</span>
                    <span>{formatCurrency(nonAcRate * nights)}</span>
                  </div>
                  {isAc && <div className="flex justify-between"><span className="text-slate-600">A/C Surcharge</span><span>{formatCurrency(acSurcharge * nights)}</span></div>}
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

              {errors.submit && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errors.submit}</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={step === 'dates' ? () => navigate(-1) : back}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          {step === 'dates' ? 'Change Type' : 'Back'}
        </Button>
        {step !== 'summary' ? (
          <Button onClick={next}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
        ) : (
          <Button onClick={handleConfirm} disabled={createMutation.isPending || !!walkInFailed}>
            {createMutation.isPending
              ? (isWalkIn ? 'Checking In…' : 'Saving…')
              : (isWalkIn ? 'Confirm & Check In' : 'Confirm Reservation')}
          </Button>
        )}
      </div>
    </div>
  );
}

function cn(...args: any[]) { return args.filter(Boolean).join(' '); }
