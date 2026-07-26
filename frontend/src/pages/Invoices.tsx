import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Search, Printer, X, Download } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/Badge';
import { Input, Select } from '../components/ui/Input';
import { formatCurrency, formatDate, formatDateTime } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { api } from '../api/client';

interface Invoice {
  id: string;
  number: string;
  status: string;
  total: string;
  paidAmount: string;
  outstandingBalance: string;
  issueDate: string;
  booking: {
    reference: string;
    guestName: string;
    checkInDate: string;
    checkOutDate: string;
    room: { number: string };
    building: { name: string };
  };
}

interface InvoiceDetail {
  id: string;
  number: string;
  status: string;
  subtotal: string;
  serviceCharge: string;
  discount: string;
  total: string;
  paidAmount: string;
  outstandingBalance: string;
  issueDate: string;
  items: Array<{ id: string; description: string; quantity: number; unitPrice: string; amount: string }>;
  payments: Array<{ id: string; paymentReference: string; amount: string; purpose: string; method: string; paymentDate: string }>;
  booking: {
    reference: string;
    guestName: string;
    guestMobile: string;
    checkInDate: string;
    checkOutDate: string;
    nights: number;
    isAc: boolean;
    room: { number: string };
    building: { name: string; address?: string; contactNumbers?: string[] };
    guest?: { fullName: string; documentNumberMasked: string; mobile: string };
  };
}

export default function Invoices() {
  const { currentBuildingId } = useAuth();
  const navigate = useNavigate();
  const { id: routeInvoiceId } = useParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Auto-open modal when navigated to /invoices/:id (e.g. right after checkout)
  useEffect(() => {
    if (routeInvoiceId) setDetailId(routeInvoiceId);
  }, [routeInvoiceId]);

  const closeDetail = () => {
    setDetailId(null);
    if (routeInvoiceId) navigate('/invoices', { replace: true });
  };

  const { data, isLoading } = useQuery<{ data: Invoice[]; total: number }>({
    queryKey: ['invoices', currentBuildingId, statusFilter, page],
    queryFn: () => api.get('/invoices', {
      params: { buildingId: currentBuildingId, status: statusFilter || undefined, page, limit: 30 }
    }).then(r => r.data),
  });

  const invoices = data?.data || [];
  const total = data?.total || 0;

  const filtered = search
    ? invoices.filter(i =>
        i.number.toLowerCase().includes(search.toLowerCase()) ||
        i.booking.guestName.toLowerCase().includes(search.toLowerCase()) ||
        i.booking.reference.toLowerCase().includes(search.toLowerCase())
      )
    : invoices;

  const statuses = ['', 'Draft', 'Unpaid', 'PartiallyPaid', 'Paid', 'Cancelled', 'Refunded'];
  const statusLabels: Record<string, string> = { '': 'All Statuses', PartiallyPaid: 'Partially Paid' };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Invoices</h2>
          <p className="text-sm text-slate-500 mt-1">{total} total invoices</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-9" placeholder="Search invoice number, guest, booking…" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="sm:w-48">
          {statuses.map(s => (
            <option key={s} value={s}>{statusLabels[s] || s || 'All Statuses'}</option>
          ))}
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Invoice #</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Booking Ref</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Guest</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Room</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Total</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Balance</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoading && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">No invoices found</td></tr>
                )}
                {filtered.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setDetailId(inv.id)}>
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono font-semibold text-indigo-600">{inv.number}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{inv.booking.reference}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{inv.booking.guestName}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-900">Room {inv.booking.room.number}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{formatDate(inv.issueDate)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900 text-right">{formatCurrency(Number(inv.total))}</td>
                    <td className="px-4 py-3 text-right">
                      {Number(inv.outstandingBalance) > 0
                        ? <span className="text-sm font-semibold text-rose-600">{formatCurrency(Number(inv.outstandingBalance))}</span>
                        : <span className="text-sm text-emerald-600">—</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDetailId(inv.id); }}>
                        <FileText className="w-3.5 h-3.5 mr-1" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {detailId && <InvoiceModal invoiceId={detailId} onClose={closeDetail} />}
    </div>
  );
}

function InvoiceModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const { data: inv, isLoading } = useQuery<InvoiceDetail>({
    queryKey: ['invoice', invoiceId],
    queryFn: () => api.get(`/invoices/${invoiceId}`).then(r => r.data),
  });

  const handlePrint = () => {
    document.body.classList.add('printing-invoice');
    const cleanup = () => {
      document.body.classList.remove('printing-invoice');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    // Fallback cleanup for browsers that don't fire afterprint reliably
    setTimeout(cleanup, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm no-print" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        {isLoading || !inv ? (
          <div className="p-16 text-center text-slate-400">Loading…</div>
        ) : (
          <>
            {/* Toolbar (hidden when printing) */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-4 border-b border-slate-100 shrink-0 no-print">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-slate-900">Invoice {inv.number}</h3>
                <StatusBadge status={inv.status} />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-1.5" /> Print
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint} title="In the print dialog, choose 'Save as PDF'">
                  <Download className="w-4 h-4 mr-1.5" /> Save PDF
                </Button>
                <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable invoice */}
            <div className="flex-1 overflow-y-auto">
              <div id="invoice-print" className="p-5 sm:p-8">
                {/* Letterhead */}
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-5 mb-6">
                  <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">MOTEL CMB 53</h1>
                    <p className="text-sm text-slate-600 mt-1">{inv.booking.building.name}</p>
                    {inv.booking.building.address && (
                      <p className="text-xs text-slate-500">{inv.booking.building.address}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Invoice</p>
                    <p className="text-xl font-bold font-mono text-slate-900">{inv.number}</p>
                    <p className="text-xs text-slate-500 mt-1">{formatDate(inv.issueDate)}</p>
                  </div>
                </div>

                {/* Bill to + stay */}
                <div className="grid grid-cols-2 gap-8 mb-6 text-sm">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1.5">Billed To</p>
                    <p className="font-semibold text-slate-900">{inv.booking.guest?.fullName || inv.booking.guestName}</p>
                    <p className="text-slate-600">{inv.booking.guestMobile}</p>
                    {inv.booking.guest?.documentNumberMasked && (
                      <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {inv.booking.guest.documentNumberMasked}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1.5">Stay Details</p>
                    <p className="text-slate-900 font-semibold">Room {inv.booking.room.number} · {inv.booking.isAc ? 'A/C' : 'Non-A/C'}</p>
                    <p className="text-slate-600">{formatDate(inv.booking.checkInDate)} → {formatDate(inv.booking.checkOutDate)}</p>
                    <p className="text-xs text-slate-500">{inv.booking.nights} night{inv.booking.nights !== 1 ? 's' : ''} · Booking {inv.booking.reference}</p>
                  </div>
                </div>

                {/* Line items */}
                <table className="w-full text-sm mb-6">
                  <thead>
                    <tr className="border-b-2 border-slate-200 text-left">
                      <th className="py-2 text-xs uppercase tracking-wide text-slate-500 font-semibold">Description</th>
                      <th className="py-2 text-xs uppercase tracking-wide text-slate-500 font-semibold text-center w-16">Qty</th>
                      <th className="py-2 text-xs uppercase tracking-wide text-slate-500 font-semibold text-right w-28">Unit</th>
                      <th className="py-2 text-xs uppercase tracking-wide text-slate-500 font-semibold text-right w-32">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {inv.items.map(item => (
                      <tr key={item.id}>
                        <td className="py-2.5 text-slate-900">{item.description}</td>
                        <td className="py-2.5 text-center text-slate-600">{item.quantity}</td>
                        <td className="py-2.5 text-right text-slate-600">{formatCurrency(Number(item.unitPrice))}</td>
                        <td className="py-2.5 text-right font-medium text-slate-900">{formatCurrency(Number(item.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals */}
                <div className="flex justify-end mb-6">
                  <div className="w-64 space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span>{formatCurrency(Number(inv.subtotal))}</span></div>
                    {Number(inv.serviceCharge) > 0 && (
                      <div className="flex justify-between"><span className="text-slate-600">Service Charge</span><span>{formatCurrency(Number(inv.serviceCharge))}</span></div>
                    )}
                    {Number(inv.discount) > 0 && (
                      <div className="flex justify-between text-emerald-700"><span>Discount</span><span>−{formatCurrency(Number(inv.discount))}</span></div>
                    )}
                    <div className="flex justify-between font-bold text-base border-t-2 border-slate-900 pt-2">
                      <span>Total</span><span>{formatCurrency(Number(inv.total))}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700"><span>Paid</span><span>{formatCurrency(Number(inv.paidAmount))}</span></div>
                    <div className={`flex justify-between font-bold ${Number(inv.outstandingBalance) > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      <span>Balance Due</span><span>{formatCurrency(Number(inv.outstandingBalance))}</span>
                    </div>
                  </div>
                </div>

                {/* Payments */}
                {inv.payments.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Payments Received</p>
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-slate-100">
                        {inv.payments.map(p => (
                          <tr key={p.id}>
                            <td className="py-1.5 font-mono text-slate-500">{p.paymentReference}</td>
                            <td className="py-1.5 text-slate-600">{p.purpose} · {p.method}</td>
                            <td className="py-1.5 text-slate-500">{formatDateTime(p.paymentDate)}</td>
                            <td className="py-1.5 text-right font-medium">{formatCurrency(Number(p.amount))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <p className="text-center text-xs text-slate-400 border-t border-slate-100 pt-4">
                  Thank you for staying with Motel CMB 53 · This is a computer-generated invoice
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
