import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BedDouble, Users, CreditCard, Key, CheckCircle2, Clock, TrendingUp, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import { formatCurrency, formatDate, formatDateTime } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { api } from '../api/client';
import { format } from 'date-fns';

interface DashboardData {
  rooms: { total: number; occupied: number; vacant: number; cleaning: number; maintenance: number; occupancyRate: number };
  inHouse: { bookings: number; guests: number };
  today: { checkIns: number; checkOuts: number; revenue: number };
  outstanding: number;
}

interface InHouseBooking {
  id: string;
  reference: string;
  guestName: string;
  totalGuests: number;
  checkOutDate: string;
  isAc: boolean;
  outstandingBalance: string;
  room: { number: string };
}

export default function Dashboard() {
  const { currentBuildingId } = useAuth();

  const { data: dashboard } = useQuery<DashboardData>({
    queryKey: ['dashboard', currentBuildingId],
    queryFn: () => api.get('/reports/dashboard', { params: { buildingId: currentBuildingId } }).then(r => r.data),
    refetchInterval: 60000,
  });

  const { data: inHouseRes } = useQuery<InHouseBooking[]>({
    queryKey: ['in-house', currentBuildingId],
    queryFn: () => api.get('/reports/in-house', { params: { buildingId: currentBuildingId } }).then(r => r.data),
  });

  const inHouse = inHouseRes || [];

  const kpis = [
    {
      label: 'Occupancy',
      value: `${dashboard?.rooms.occupancyRate ?? 0}%`,
      sub: `${dashboard?.rooms.occupied ?? 0} / ${dashboard?.rooms.total ?? 0} rooms`,
      icon: BedDouble, color: 'text-indigo-600', bg: 'bg-indigo-50',
    },
    {
      label: 'In-House Guests',
      value: dashboard?.inHouse.guests ?? 0,
      sub: `${dashboard?.inHouse.bookings ?? 0} active bookings`,
      icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50',
    },
    {
      label: "Today's Revenue",
      value: formatCurrency(dashboard?.today.revenue ?? 0),
      sub: 'Payments collected today',
      icon: CreditCard, color: 'text-violet-600', bg: 'bg-violet-50',
    },
    {
      label: 'Outstanding',
      value: formatCurrency(dashboard?.outstanding ?? 0),
      sub: 'Total unpaid balance',
      icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50',
    },
  ];

  const roomStats = [
    { label: 'Vacant', value: dashboard?.rooms.vacant ?? 0, color: 'text-emerald-600' },
    { label: 'Occupied', value: dashboard?.rooms.occupied ?? 0, color: 'text-blue-600' },
    { label: 'Cleaning', value: dashboard?.rooms.cleaning ?? 0, color: 'text-amber-600' },
    { label: 'Maintenance', value: dashboard?.rooms.maintenance ?? 0, color: 'text-rose-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Master Dashboard</h2>
        <p className="text-sm text-slate-500 mt-1">
          Operational overview · {format(new Date(), 'EEEE, MMMM do, yyyy')}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">{k.label}</p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">{k.value}</h3>
                </div>
                <div className={`p-3 rounded-xl ${k.bg}`}>
                  <k.icon className={`w-6 h-6 ${k.color}`} />
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-500">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Room Status */}
        <Card>
          <CardHeader>
            <CardTitle>Room Status</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-4">
              {roomStats.map(s => (
                <div key={s.label} className="text-center">
                  <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-slate-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Today's Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Today's Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-50 rounded-lg"><Key className="w-4 h-4 text-blue-600" /></div>
                <span className="text-sm text-slate-600">Check-Ins</span>
              </div>
              <span className="text-lg font-bold text-slate-900">{dashboard?.today.checkIns ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-rose-50 rounded-lg"><Clock className="w-4 h-4 text-rose-600" /></div>
                <span className="text-sm text-slate-600">Check-Outs</span>
              </div>
              <span className="text-lg font-bold text-slate-900">{dashboard?.today.checkOuts ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-50 rounded-lg"><TrendingUp className="w-4 h-4 text-emerald-600" /></div>
                <span className="text-sm text-slate-600">Revenue</span>
              </div>
              <span className="text-lg font-bold text-emerald-700">{formatCurrency(dashboard?.today.revenue ?? 0)}</span>
            </div>
          </CardContent>
        </Card>

        {/* In-House Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>In-House</CardTitle>
            <span className="text-sm text-slate-500">{inHouse.length} rooms</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
              {inHouse.length === 0 && (
                <div className="px-6 py-8 text-center text-sm text-slate-400">No guests currently checked in</div>
              )}
              {inHouse.map(b => (
                <div key={b.id} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900 truncate max-w-[140px]">{b.guestName}</p>
                    <p className="text-xs text-slate-500">Room {b.room.number} · Out {formatDate(b.checkOutDate)}</p>
                  </div>
                  {Number(b.outstandingBalance) > 0 && (
                    <span className="text-xs font-semibold text-rose-600">{formatCurrency(Number(b.outstandingBalance))}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
