import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Filter, X, Users, Wind, Phone, Calendar, CreditCard, FileText, LogIn, LogOut as LogOutIcon } from 'lucide-react';
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

interface BookingDetail extends Booking {
  guestMobile: string;
  adults: number;
  children: number;
  totalGuests: number;
  baseNightlyRate: string;
  acSurchargePerNight: string;
  roomCharge: string;
  additionalCharges: string;
  serviceCharge: string;
  discount: string;
  paidAmount: string;
  actualCheckIn?: string;
  actualCheckOut?: string;
  notes?: string;
  guest?: { fullName: string; documentNumberMasked: string; mobile: string };
  payments: Array<{ id: string; paymentReference: string; amount: string; purpose: string; method: string; paymentDate: string }>;
  invoice?: { id: string; number: string } | null;
  invoices?: Array<{ id: string; number: string }>;
}

export default function Bookings() {
  const { currentBuildingId, can } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

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
                    onClick={() => setDetailId(b.id)}>
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

      {detailId && (
        <BookingDetailModal
          bookingId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

function BookingDetailModal({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { can } = useAuth();

  const { data: b, isLoading } = useQuery<BookingDetail>({
    queryKey: ['booking', bookingId],
    queryFn: () => api.get(`/bookings/${bookingId}`).then(r => r.data),
  });

  const outstanding = b ? Number(b.outstandingBalance) : 0;
  const invoiceId = b?.invoice?.id || b?.invoices?.[0]?.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in">
        {isLoading || !b ? (
          <div className="p-16 text-center text-slate-400">Loading…</div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-900 px-6 py-5 text-white shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-indigo-300 font-semibold">Booking</p>
                  <h3 className="text-2xl font-bold font-mono mt-0.5">{b.reference}</h3>
                  <p className="text-sm text-slate-300 mt-1">{b.guestName} · Room {b.room.number}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={b.status} />
                  <button onClick={onClose} className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              {/* Stay details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { icon: Calendar, label: 'Check-In', value: formatDate(b.checkInDate) },
                  { icon: Calendar, label: 'Check-Out', value: formatDate(b.checkOutDate) },
                  { icon: Users, label: 'Guests', value: `${b.adults} adult${b.adults > 1 ? 's' : ''}${b.children > 0 ? `, ${b.children} child` : ''}` },
                  { icon: Wind, label: 'Room Type', value: b.isAc ? 'A/C' : 'Non-A/C' },
                ].map((item, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                      <item.icon className="w-3.5 h-3.5" /> {item.label}
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Guest contact */}
              <div className="flex items-center gap-6 text-sm text-slate-600 px-1">
                <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{b.guestMobile}</span>
                {b.guest?.documentNumberMasked && (
                  <span className="font-mono text-xs text-slate-500">ID: {b.guest.documentNumberMasked}</span>
                )}
                {b.actualCheckIn && <span className="text-xs">Checked in {formatDateTime(b.actualCheckIn)}</span>}
              </div>

              {/* Billing breakdown */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Billing</p>
                <div className="flex justify-between"><span className="text-slate-600">Room ({b.nights} night{b.nights !== 1 ? 's' : ''})</span><span>{formatCurrency(Number(b.baseNightlyRate) * b.nights)}</span></div>
                {b.isAc && <div className="flex justify-between"><span className="text-slate-600">A/C Surcharge</span><span>{formatCurrency(Number(b.acSurchargePerNight) * b.nights)}</span></div>}
                {Number(b.additionalCharges) > 0 && <div className="flex justify-between"><span className="text-slate-600">Additional</span><span>{formatCurrency(Number(b.additionalCharges))}</span></div>}
                {Number(b.serviceCharge) > 0 && <div className="flex justify-between"><span className="text-slate-600">Service Charge</span><span>{formatCurrency(Number(b.serviceCharge))}</span></div>}
                {Number(b.discount) > 0 && <div className="flex justify-between text-emerald-700"><span>Discount</span><span>−{formatCurrency(Number(b.discount))}</span></div>}
                <div className="flex justify-between font-bold border-t border-slate-200 pt-2"><span>Total</span><span>{formatCurrency(Number(b.invoiceTotal))}</span></div>
                <div className="flex justify-between text-emerald-700"><span>Paid</span><span>{formatCurrency(Number(b.paidAmount))}</span></div>
                <div className={`flex justify-between font-bold ${outstanding > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  <span>Balance</span><span>{formatCurrency(outstanding)}</span>
                </div>
              </div>

              {/* Payments */}
              {b.payments?.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                    Payment History
                  </p>
                  <div className="divide-y divide-slate-100">
                    {b.payments.map(p => (
                      <div key={p.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                        <div>
                          <span className="font-mono text-xs text-indigo-600">{p.paymentReference}</span>
                          <span className="text-slate-500 text-xs ml-2">{p.purpose} · {p.method}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold">{formatCurrency(Number(p.amount))}</span>
                          <span className="block text-xs text-slate-400">{formatDateTime(p.paymentDate)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {b.notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-800">
                  <span className="font-medium">Notes: </span>{b.notes}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="border-t border-slate-100 px-6 py-4 flex flex-wrap items-center justify-end gap-2 shrink-0 bg-slate-50/50">
              {invoiceId && (
                <Button variant="outline" size="sm" onClick={() => { onClose(); navigate(`/invoices/${invoiceId}`); }}>
                  <FileText className="w-4 h-4 mr-1.5" /> View Invoice
                </Button>
              )}
              {b.status === 'Reserved' && can('checkin') && (
                <Button size="sm" className="bg-purple-600 hover:bg-purple-700"
                  onClick={() => { onClose(); navigate(`/check-in?booking=${b.id}`); }}>
                  <LogIn className="w-4 h-4 mr-1.5" /> Check In
                </Button>
              )}
              {b.status === 'CheckedIn' && can('record_payment') && outstanding > 0 && (
                <Button variant="outline" size="sm"
                  onClick={() => { onClose(); navigate(`/checkout?booking=${b.id}`); }}>
                  <CreditCard className="w-4 h-4 mr-1.5" /> Collect Payment
                </Button>
              )}
              {b.status === 'CheckedIn' && can('checkout') && (
                <Button variant="danger" size="sm"
                  onClick={() => { onClose(); navigate(`/checkout?booking=${b.id}`); }}>
                  <LogOutIcon className="w-4 h-4 mr-1.5" /> Checkout
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
