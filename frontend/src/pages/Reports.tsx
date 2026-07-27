import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { api } from '../api/client';
import { Download, Printer } from 'lucide-react';
import { printHtmlDocument, escapeHtml } from '../lib/print';

export default function Reports() {
  const { currentBuildingId } = useAuth();
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [activeTab, setActiveTab] = useState<'revenue' | 'occupancy' | 'bookings' | 'cashier'>('revenue');

  const params = { buildingId: currentBuildingId, from, to };

  const { data: revenue } = useQuery({
    queryKey: ['report-revenue', currentBuildingId, from, to],
    queryFn: () => api.get('/reports/revenue', { params }).then(r => r.data),
  });

  const { data: occupancy } = useQuery({
    queryKey: ['report-occupancy', currentBuildingId, from, to],
    queryFn: () => api.get('/reports/occupancy', { params }).then(r => r.data),
  });

  const { data: bookings } = useQuery({
    queryKey: ['report-bookings', currentBuildingId, from, to],
    queryFn: () => api.get('/reports/bookings', { params }).then(r => r.data),
  });

  const { data: cashier } = useQuery({
    queryKey: ['report-cashier', currentBuildingId, from, to],
    queryFn: () => api.get('/reports/cashier', { params }).then(r => r.data),
  });

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  const methodData = revenue?.byMethod
    ? Object.entries(revenue.byMethod).map(([k, v]) => ({ name: k, value: v as number }))
    : [];

  const tabs = [
    { id: 'revenue', label: 'Revenue' },
    { id: 'occupancy', label: 'Occupancy' },
    { id: 'bookings', label: 'Bookings' },
    { id: 'cashier', label: 'Cashier' },
  ];

  const EXPORT_COLUMNS = [
    { key: 'paymentReference', label: 'Reference' },
    { key: 'bookingRef', label: 'Booking' },
    { key: 'guestName', label: 'Guest' },
    { key: 'amount', label: 'Amount' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'method', label: 'Method' },
    { key: 'paymentDate', label: 'Date' },
    { key: 'collectedBy', label: 'Collected By' },
  ];
  const [showExportPanel, setShowExportPanel] = useState(false);
  const exportPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showExportPanel) return;
    const handleClick = (e: MouseEvent) => {
      if (exportPanelRef.current && !exportPanelRef.current.contains(e.target as Node)) {
        setShowExportPanel(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowExportPanel(false); };
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [showExportPanel]);
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv');
  const [exportCols, setExportCols] = useState<string[]>(EXPORT_COLUMNS.map(c => c.key));

  const toggleExportCol = (key: string) => {
    setExportCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const formatCell = (row: any, key: string) => {
    if (key === 'amount') return formatCurrency(row.amount);
    if (key === 'paymentDate') return format(new Date(row.paymentDate), 'yyyy-MM-dd HH:mm');
    return row[key] ?? '';
  };

  const runExport = () => {
    if (!revenue?.payments?.length) return;
    const cols = EXPORT_COLUMNS.filter(c => exportCols.includes(c.key));

    if (exportFormat === 'csv') {
      const rows = [
        cols.map(c => c.label),
        ...revenue.payments.map((p: any) => cols.map(c => formatCell(p, c.key))),
      ];
      const csv = rows.map(r => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `revenue-report-${from}-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headerHtml = cols.map(c => `<th>${escapeHtml(c.label)}</th>`).join('');
      const rowsHtml = revenue.payments.map((p: any) =>
        `<tr>${cols.map(c => `<td${c.key === 'amount' ? ' class="text-right"' : ''}>${escapeHtml(String(formatCell(p, c.key)))}</td>`).join('')}</tr>`
      ).join('');
      const html = `
        <h1 style="font-size:20px;font-weight:800;margin:0 0 4px;">Revenue Report</h1>
        <p class="muted" style="margin:0 0 20px;">${from} to ${to}</p>
        <table>
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
      printHtmlDocument(`Revenue Report ${from} to ${to}`, html);
    }
    setShowExportPanel(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Reports</h2>
          <p className="text-sm text-slate-500 mt-1">Operational and revenue reports</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36" />
          <span className="text-slate-400">→</span>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36" />
          <div className="relative" ref={exportPanelRef}>
            <Button variant="outline" size="sm" onClick={() => setShowExportPanel(v => !v)}>
              <Download className="w-4 h-4 mr-1" /> Export
            </Button>
            {showExportPanel && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-20 p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Format</p>
                  <div className="flex gap-2">
                    <button
                      className={`flex-1 text-sm py-1.5 rounded-lg border ${exportFormat === 'csv' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600'}`}
                      onClick={() => setExportFormat('csv')}>CSV</button>
                    <button
                      className={`flex-1 text-sm py-1.5 rounded-lg border ${exportFormat === 'pdf' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600'}`}
                      onClick={() => setExportFormat('pdf')}>PDF</button>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Columns to include</p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {EXPORT_COLUMNS.map(c => (
                      <label key={c.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input type="checkbox" checked={exportCols.includes(c.key)}
                          onChange={() => toggleExportCol(c.key)}
                          className="rounded text-indigo-600" />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>
                <Button size="sm" className="w-full" onClick={runExport} disabled={exportCols.length === 0}>
                  {exportFormat === 'csv' ? <Download className="w-3.5 h-3.5 mr-1.5" /> : <Printer className="w-3.5 h-3.5 mr-1.5" />}
                  {exportFormat === 'csv' ? 'Download CSV' : 'Open Print / Save as PDF'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab(t.id as any)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Revenue tab */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Card><CardContent className="p-6">
              <p className="text-sm text-slate-500">Total Collected</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(revenue?.collected || 0)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-6">
              <p className="text-sm text-slate-500">Outstanding</p>
              <p className="text-2xl font-bold text-rose-600 mt-1">{formatCurrency(revenue?.outstanding || 0)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-6">
              <p className="text-sm text-slate-500">Discounts Given</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(revenue?.discounts || 0)}</p>
            </CardContent></Card>
          </div>

          {methodData.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>Collections by Method</CardTitle></CardHeader>
                <CardContent className="p-6">
                  <PieChart width={280} height={200}>
                    <Pie data={methodData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {methodData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v as number)} />
                  </PieChart>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>A/C vs Non-A/C</CardTitle></CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">A/C Bookings</span>
                      <span className="font-semibold">{revenue?.acBookings || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Non-A/C Bookings</span>
                      <span className="font-semibold">{revenue?.nonAcBookings || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Service Charges</span>
                      <span className="font-semibold">{formatCurrency(revenue?.serviceCharges || 0)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Payment list */}
          {revenue?.payments?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Payment Transactions</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="bg-slate-50 border-y border-slate-200">
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Reference</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Booking</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Purpose</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Method</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Amount</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Collected By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {revenue.payments.map((p: any) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm font-mono text-indigo-600">{p.paymentReference}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{p.bookingRef}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{p.purpose}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{p.method}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-right">{formatCurrency(p.amount)}</td>
                          <td className="px-4 py-3 text-sm text-slate-500">{format(new Date(p.paymentDate), 'dd MMM HH:mm')}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{p.collectedBy || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Occupancy tab */}
      {activeTab === 'occupancy' && occupancy && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
            {[
              { label: 'Total Rooms', value: occupancy.totalRooms },
              { label: 'Total Room Nights', value: occupancy.totalRoomNights },
              { label: 'Booked Nights', value: occupancy.bookedNights },
              { label: 'Occupancy Rate', value: `${occupancy.occupancyRate}%` },
            ].map(s => (
              <Card key={s.label}><CardContent className="p-6">
                <p className="text-sm text-slate-500">{s.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{s.value}</p>
              </CardContent></Card>
            ))}
          </div>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-1 h-8 bg-slate-100 rounded-lg overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-lg transition-all"
                    style={{ width: `${occupancy.occupancyRate}%` }}
                  />
                </div>
                <span className="ml-4 text-lg font-bold text-indigo-700">{occupancy.occupancyRate}%</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bookings tab */}
      {activeTab === 'bookings' && bookings && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            {Object.entries(bookings.summary?.byStatus || {}).map(([status, count]) => (
              <Card key={status}><CardContent className="p-6">
                <p className="text-sm text-slate-500">{status}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{count as number}</p>
              </CardContent></Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Booking List</CardTitle>
                <span className="text-sm text-slate-500">{bookings.summary?.total} total</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-y border-slate-200">
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Booking</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Guest</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Room</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Check-In</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bookings.bookings?.map((b: any) => (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-mono text-indigo-600">{b.reference}</td>
                        <td className="px-4 py-3 text-sm text-slate-900">{b.guestName}</td>
                        <td className="px-4 py-3 text-sm font-bold">Room {b.room.number}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">{format(new Date(b.checkInDate), 'dd MMM')}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">{b.status}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-right">{formatCurrency(Number(b.invoiceTotal))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cashier tab */}
      {activeTab === 'cashier' && (
        <Card>
          <CardHeader><CardTitle>Cashier Collections</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Cashier</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-center">Transactions</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Total Collected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!cashier?.length && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No data for selected period</td></tr>}
                {cashier?.map((c: any) => (
                  <tr key={c.userId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{c.userName}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 text-center">{c.transactionCount}</td>
                    <td className="px-4 py-3 text-sm font-bold text-right text-emerald-700">{formatCurrency(c.totalCollected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
