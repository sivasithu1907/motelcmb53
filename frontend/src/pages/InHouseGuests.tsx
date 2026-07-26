import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BedDouble, Wind, Users, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { formatCurrency, formatDate } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { api } from '../api/client';
import { differenceInDays, parseISO } from 'date-fns';

interface InHouseBooking {
  id: string;
  reference: string;
  guestName: string;
  guestMobile: string;
  checkInDate: string;
  checkOutDate: string;
  actualCheckIn: string;
  nights: number;
  adults: number;
  children: number;
  totalGuests: number;
  isAc: boolean;
  baseNightlyRate: string;
  acSurchargePerNight: string;
  invoiceTotal: string;
  paidAmount: string;
  outstandingBalance: string;
  room: { number: string; capacity: number };
  building: { name: string };
  guest?: { fullName: string; documentNumberMasked: string; mobile: string };
}

export default function InHouseGuests() {
  const { currentBuildingId, can } = useAuth();
  const navigate = useNavigate();

  const { data: bookings = [], isLoading } = useQuery<InHouseBooking[]>({
    queryKey: ['in-house', currentBuildingId],
    queryFn: () => api.get('/reports/in-house', { params: { buildingId: currentBuildingId } }).then(r => r.data),
    refetchInterval: 30000,
  });

  const today = new Date();
  const totalGuests = bookings.reduce((s, b) => s + b.totalGuests, 0);
  const totalOutstanding = bookings.reduce((s, b) => s + Number(b.outstandingBalance), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">In-House Guests</h2>
        <p className="text-sm text-slate-500 mt-1">
          {bookings.length} active rooms · {totalGuests} guests
          {totalOutstanding > 0 && ` · ${formatCurrency(totalOutstanding)} outstanding`}
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400">Loading…</div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <BedDouble className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No guests currently checked in</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {bookings.map(b => {
            const daysLeft = differenceInDays(parseISO(b.checkOutDate), today);
            const checkoutToday = daysLeft === 0;
            const overdue = daysLeft < 0;

            return (
              <Card key={b.id} className={`border-2 ${overdue ? 'border-rose-300' : checkoutToday ? 'border-amber-300' : 'border-blue-200'}`}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Room</span>
                      <h3 className="text-3xl font-black text-slate-900">{b.room.number}</h3>
                    </div>
                    <div className="text-right">
                      {overdue && <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-100 px-2 py-1 rounded-full"><AlertTriangle className="w-3 h-3" />Overdue</span>}
                      {checkoutToday && !overdue && <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">Checkout Today</span>}
                      {!checkoutToday && !overdue && <span className="text-xs text-slate-500">{daysLeft} day{daysLeft !== 1 ? 's' : ''} left</span>}
                    </div>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900">{b.guestName}</p>
                    <p className="text-xs text-slate-500">{b.reference} · {b.guestMobile}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div className="flex items-center gap-1"><Users className="w-3 h-3" />{b.totalGuests} guests</div>
                    <div className="flex items-center gap-1">
                      {b.isAc ? <><Wind className="w-3 h-3 text-blue-500" />A/C</> : 'Non-A/C'}
                    </div>
                    <div>In: {formatDate(b.checkInDate)}</div>
                    <div>Out: {formatDate(b.checkOutDate)}</div>
                  </div>

                  <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
                    <div>
                      <p className="text-xs text-slate-500">Outstanding</p>
                      <p className={`text-sm font-bold ${Number(b.outstandingBalance) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {Number(b.outstandingBalance) > 0 ? formatCurrency(Number(b.outstandingBalance)) : 'Settled'}
                      </p>
                    </div>
                    {can('checkout') && (checkoutToday || overdue) && (
                      <Button size="sm" variant="danger" onClick={() => navigate(`/checkout?booking=${b.id}`)}>
                        Checkout
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
