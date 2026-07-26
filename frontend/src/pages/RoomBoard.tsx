import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Wind, Filter, Settings2, LogOut, LogIn, PaintBucket, Wrench, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/Badge';
import { formatCurrency, cn } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { api, apiError } from '../api/client';

type RoomStatus = 'Vacant' | 'Reserved' | 'Occupied' | 'Cleaning' | 'Maintenance' | 'Blocked';

interface Room {
  id: string;
  number: string;
  capacity: number;
  nonAcRate: string;
  acSurcharge: string;
  status: RoomStatus;
  maintenanceNote?: string;
  bookings: Array<{
    id: string;
    reference: string;
    guestName: string;
    checkOutDate: string;
    isAc: boolean;
    baseNightlyRate: string;
    acSurchargePerNight: string;
    status: string;
    guest?: { fullName: string };
  }>;
}

const STATUS_CARD_COLORS: Record<RoomStatus, string> = {
  Vacant: 'border-emerald-200 bg-emerald-50/30',
  Occupied: 'border-blue-200 bg-blue-50/30',
  Cleaning: 'border-amber-200 bg-amber-50/30',
  Maintenance: 'border-rose-200 bg-rose-50/30',
  Reserved: 'border-purple-200 bg-purple-50/30',
  Blocked: 'border-slate-200 bg-slate-50/30',
};

export default function RoomBoard() {
  const { currentBuildingId, can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<RoomStatus | 'All'>('All');

  const { data: rooms = [], isLoading } = useQuery<Room[]>({
    queryKey: ['rooms', currentBuildingId],
    queryFn: () => api.get('/rooms', { params: { buildingId: currentBuildingId } }).then(r => r.data),
    refetchInterval: 30000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ roomId, status, reason }: { roomId: string; status: string; reason?: string }) =>
      api.patch(`/rooms/${roomId}/status`, { status, reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
    onError: (err) => alert('Error: ' + apiError(err)),
  });

  const filtered = filter === 'All' ? rooms : rooms.filter(r => r.status === filter);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Live Room Board</h2>
          <p className="text-sm text-slate-500 mt-1">Real-time status and quick actions</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1">
            <Filter className="w-4 h-4 text-slate-400 ml-2 mr-1" />
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as any)}
              className="bg-transparent border-none text-sm focus:ring-0 text-slate-700 py-1.5 pl-2 pr-8"
            >
              <option value="All">All Statuses</option>
              <option value="Vacant">Vacant</option>
              <option value="Occupied">Occupied</option>
              <option value="Reserved">Reserved</option>
              <option value="Cleaning">Cleaning</option>
              <option value="Maintenance">Maintenance</option>
            </select>
          </div>
          {can('create_booking') && (
            <Button onClick={() => navigate('/book')}>New Booking</Button>
          )}
        </div>
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {(['Vacant','Occupied','Reserved','Cleaning','Maintenance','Blocked'] as RoomStatus[]).map(s => (
          <span key={s} className={cn("px-2.5 py-1 rounded-full font-medium", STATUS_CARD_COLORS[s], "border")}>
            {s}: {rooms.filter(r => r.status === s).length}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
        {filtered.map(room => {
          const activeBooking = room.bookings?.[0];
          const nonAcRate = Number(room.nonAcRate);
          const acRate = nonAcRate + Number(room.acSurcharge);

          return (
            <Card key={room.id} className={cn("border-2 transition-all duration-200 hover:shadow-md", STATUS_CARD_COLORS[room.status])}>
              <CardContent className="p-5 flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-baseline space-x-2">
                      <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Room</span>
                      <h3 className="text-3xl font-black text-slate-900">{room.number}</h3>
                    </div>
                    <div className="flex items-center mt-1 text-sm text-slate-600">
                      <Users className="w-4 h-4 mr-1" /> {room.capacity} Max
                    </div>
                  </div>
                  <StatusBadge status={room.status} />
                </div>

                {activeBooking ? (
                  <div className="bg-white rounded-lg p-3 border border-slate-100 shadow-sm flex-1 mb-4">
                    <p className="font-semibold text-slate-900 truncate">
                      {activeBooking.guest?.fullName || activeBooking.guestName}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Out: {new Date(activeBooking.checkOutDate).toLocaleDateString('en-LK')} {new Date(activeBooking.checkOutDate).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      {activeBooking.isAc
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700"><Wind className="w-3 h-3 mr-1" />A/C</span>
                        : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">Non-A/C</span>
                      }
                      {/* Corrected: uses baseNightlyRate + acSurchargePerNight, never doubled */}
                      <span className="text-xs font-semibold text-slate-700">
                        {formatCurrency(Number(activeBooking.baseNightlyRate) + (activeBooking.isAc ? Number(activeBooking.acSurchargePerNight) : 0))}/night
                      </span>
                    </div>
                    {activeBooking.reference && (
                      <p className="text-xs text-slate-400 mt-1">{activeBooking.reference}</p>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 mb-4 flex flex-col justify-center">
                    <div className="flex items-center justify-between py-1 border-b border-slate-100/50">
                      <span className="text-xs text-slate-500">Non-A/C</span>
                      <span className="text-sm font-semibold text-slate-700">{formatCurrency(nonAcRate)}</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-xs text-slate-500 flex items-center"><Wind className="w-3 h-3 mr-1" />A/C</span>
                      <span className="text-sm font-semibold text-slate-700">{formatCurrency(acRate)}</span>
                    </div>
                    {room.maintenanceNote && (
                      <p className="text-xs text-rose-600 mt-2 truncate">{room.maintenanceNote}</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 mt-auto pt-4 border-t border-slate-200/50">
                  {room.status === 'Vacant' && can('create_booking') && (
                    <>
                      <Button variant="primary" size="sm" onClick={() => navigate(`/book?room=${room.id}`)} className="w-full">
                        <LogIn className="w-4 h-4 mr-1" /> Book
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        const reason = prompt('Maintenance reason:');
                        if (reason) statusMutation.mutate({ roomId: room.id, status: 'Maintenance', reason });
                      }} className="w-full">
                        <Wrench className="w-4 h-4 mr-1" /> Maint.
                      </Button>
                    </>
                  )}

                  {room.status === 'Occupied' && (
                    <>
                      <Button variant="outline" size="sm" className="w-full"
                        onClick={() => activeBooking && navigate(`/bookings?ref=${activeBooking.reference}`)}>
                        View
                      </Button>
                      {can('checkout') && (
                        <Button variant="danger" size="sm" className="w-full"
                          onClick={() => activeBooking && navigate(`/checkout?booking=${activeBooking.id}`)}>
                          <LogOut className="w-4 h-4 mr-1" /> C/Out
                        </Button>
                      )}
                    </>
                  )}

                  {room.status === 'Cleaning' && can('manage_rooms') && (
                    <Button variant="primary" size="sm" className="w-full col-span-2 bg-amber-600 hover:bg-amber-700"
                      onClick={() => {
                        if (confirm('Mark room as Vacant (cleaning complete)?')) {
                          statusMutation.mutate({ roomId: room.id, status: 'Vacant', reason: 'Cleaning complete' });
                        }
                      }}>
                      <PaintBucket className="w-4 h-4 mr-1" /> Mark Cleaned
                    </Button>
                  )}

                  {room.status === 'Maintenance' && can('manage_rooms') && (
                    <Button variant="primary" size="sm" className="w-full col-span-2 bg-slate-700 hover:bg-slate-800"
                      onClick={() => {
                        if (confirm('Mark maintenance as complete and set room to Vacant?')) {
                          statusMutation.mutate({ roomId: room.id, status: 'Vacant', reason: 'Maintenance complete' });
                        }
                      }}>
                      <Wrench className="w-4 h-4 mr-1" /> Finish Maint.
                    </Button>
                  )}

                  {room.status === 'Reserved' && (
                    <>
                      <Button variant="outline" size="sm" className="w-full"
                        onClick={() => activeBooking && navigate(`/check-in?booking=${activeBooking.id}`)}>
                        Details
                      </Button>
                      {can('checkin') && (
                        <Button variant="primary" size="sm" className="w-full bg-purple-600 hover:bg-purple-700"
                          onClick={() => activeBooking && navigate(`/check-in?booking=${activeBooking.id}`)}>
                          <LogIn className="w-4 h-4 mr-1" /> Check In
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <BedDouble className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No rooms match the current filter</p>
        </div>
      )}
    </div>
  );
}

function BedDouble(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10M21 7v10M3 12h18M5 7h14a2 2 0 012 2v2H3V9a2 2 0 012-2z" />
    </svg>
  );
}
