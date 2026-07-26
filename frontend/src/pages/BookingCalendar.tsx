import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, startOfWeek, eachDayOfInterval } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/Badge';
import { useAuth } from '../lib/auth';
import { api } from '../api/client';

interface Booking {
  id: string;
  reference: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  isAc: boolean;
  room: { number: string };
}

export default function BookingCalendar() {
  const { currentBuildingId } = useAuth();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const days = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });

  const { data: bookings = [] } = useQuery<Booking[]>({
    queryKey: ['bookings-calendar', currentBuildingId, format(weekStart, 'yyyy-MM-dd')],
    queryFn: () => api.get('/bookings', {
      params: {
        buildingId: currentBuildingId,
        limit: 100,
        page: 1,
      }
    }).then(r => r.data.data),
  });

  const getBookingsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return bookings.filter(b => {
      const checkIn = b.checkInDate.split('T')[0];
      const checkOut = b.checkOutDate.split('T')[0];
      return dateStr >= checkIn && dateStr < checkOut;
    });
  };

  const STATUS_DOT: Record<string, string> = {
    CheckedIn: 'bg-blue-500',
    Reserved: 'bg-purple-500',
    Confirmed: 'bg-emerald-500',
    CheckedOut: 'bg-slate-400',
    Cancelled: 'bg-rose-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Booking Calendar</h2>
          <p className="text-sm text-slate-500 mt-1">Weekly overview of all bookings</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(d => addDays(d, -7))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-slate-700 min-w-[200px] text-center">
            {format(weekStart, 'MMM dd')} – {format(addDays(weekStart, 6), 'MMM dd, yyyy')}
          </span>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(d => addDays(d, 7))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Today
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map(day => {
          const dayBookings = getBookingsForDay(day);
          const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
          return (
            <div key={day.toISOString()}
              className={`min-h-[140px] rounded-xl border p-2 ${isToday ? 'border-indigo-400 bg-indigo-50/30' : 'border-slate-200 bg-white'}`}>
              <div className={`text-center mb-2 ${isToday ? 'text-indigo-700' : 'text-slate-600'}`}>
                <div className="text-xs font-medium uppercase">{format(day, 'EEE')}</div>
                <div className={`text-lg font-bold ${isToday ? 'bg-indigo-600 text-white w-7 h-7 rounded-full flex items-center justify-center mx-auto' : ''}`}>
                  {format(day, 'd')}
                </div>
              </div>
              <div className="space-y-1">
                {dayBookings.slice(0, 4).map(b => (
                  <div key={b.id}
                    className="text-xs rounded px-1.5 py-1 bg-white border border-slate-100 shadow-sm truncate">
                    <div className="flex items-center gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[b.status] || 'bg-slate-400'}`} />
                      <span className="font-medium text-slate-800 truncate">{b.guestName}</span>
                    </div>
                    <div className="text-slate-500 pl-2.5">Rm {b.room.number}{b.isAc ? ' ❄' : ''}</div>
                  </div>
                ))}
                {dayBookings.length > 4 && (
                  <div className="text-xs text-slate-400 text-center">+{dayBookings.length - 4} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        {Object.entries(STATUS_DOT).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full ${color}`} />
            <span>{status === 'CheckedIn' ? 'Checked In' : status === 'CheckedOut' ? 'Checked Out' : status}</span>
          </div>
        ))}
      </div>

      {/* Today's summary */}
      <Card>
        <CardHeader><CardTitle>Today's Bookings</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {getBookingsForDay(new Date()).length === 0 && (
              <p className="px-6 py-8 text-center text-sm text-slate-400">No bookings for today</p>
            )}
            {getBookingsForDay(new Date()).map(b => (
              <div key={b.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{b.guestName}</p>
                  <p className="text-xs text-slate-500">{b.reference} · Room {b.room.number}{b.isAc ? ' · A/C' : ''}</p>
                </div>
                <StatusBadge status={b.status} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
