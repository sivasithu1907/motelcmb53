/**
 * CheckInPayment — Post-check-in Invoice & Payment screen.
 *
 * Reached via:
 *   /check-in-payment/:invoiceId          (from check-in redirect)
 *   /check-in-payment?bookingId=X         (from In-House Guests / direct link)
 *
 * Shows the invoice created at check-in, allows full/partial payment collection
 * or deferring payment, and provides invoice printing.
 */

import React, { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle, CreditCard, Printer, Users, BedDouble,
  ArrowRight, SkipForward, AlertCircle, ChevronLeft,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { formatCurrency } from '../lib/utils';
import { api, apiError } from '../api/client';
import { format, parseISO } from 'date-fns';

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Payment {
  id: string;
  paymentReference: string;
  amount: number;
  purpose: string;
  method: string;
  paymentDate: string;
  notes?: string;
}

interface Invoice {
  id: string;
  number: string;
  status: string;
  subtotal: number;
  serviceCharge: number;
  discount: number;
  total: number;
  paidAmount: number;
  outstandingBalance: number;
  issueDate: string;
  items: InvoiceItem[];
  payments: Payment[];
  booking: {
    id: string;
    reference: string;
    guestName: string;
    guestMobile: string;
    checkInDate: string;
    checkOutDate: string;
    actualCheckIn?: string;
    nights: number;
    isAc: boolean;
    status: string;
    room: { number: string; capacity: number };
    building: { name: string; code: string };
    guest?: { fullName: string; documentNumberMasked: string; mobile: string } | null;
  };
}

type PayMode = 'full' | 'partial' | null;

const PURPOSE_LABELS: Record<string, string> = {
  Deposit: 'Deposit',
  PartialPayment: 'Partial Payment',
  FinalPayment: 'Full Payment',
  Refund: 'Refund',
};

const METHOD_LABELS: Record<string, string> = {
  Cash: 'Cash',
  Card: 'Card / POS',
  BankTransfer: 'Bank Transfer',
  Other: 'Other',
};

const STATUS_COLORS: Record<string, string> = {
  Unpaid: 'bg-rose-100 text-rose-700',
  PartiallyPaid: 'bg-amber-100 text-amber-700',
  Paid: 'bg-emerald-100 text-emerald-700',
};

export default function CheckInPayment() {
  const { invoiceId } = useParams<{ invoiceId?: string }>();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('bookingId');
  const fromCheckin = searchParams.get('from') === 'checkin' || !!invoiceId;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [payMode, setPayMode] = useState<PayMode>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<'Cash' | 'Card' | 'BankTransfer' | 'Other'>('Cash');
  const [payPurpose, setPayPurpose] = useState<'Deposit' | 'PartialPayment' | 'FinalPayment'>('FinalPayment');
  const [payNotes, setPayNotes] = useState('');
  const [paySuccess, setPaySuccess] = useState(false);
  const [error, setError] = useState('');
  const [skipConfirmed, setSkipConfirmed] = useState(false);

  const queryKey = invoiceId ? ['invoice', invoiceId] : ['invoice-by-booking', bookingId];

  const { data: invoice, refetch, isLoading } = useQuery({
    queryKey,
    queryFn: (): Promise<Invoice> => invoiceId
      ? api.get(`/invoices/${invoiceId}`).then(r => r.data)
      : api.get(`/invoices/by-booking/${bookingId}`).then(r => r.data),
    enabled: !!(invoiceId || bookingId),
  });

  const outstanding = Number(invoice?.outstandingBalance ?? 0);
  const paid = Number(invoice?.paidAmount ?? 0);
  const total = Number(invoice?.total ?? 0);

  const openFullPayment = () => {
    setPayAmount(outstanding);
    setPayPurpose('FinalPayment');
    setPayMode('full');
    setPaySuccess(false);
    setError('');
  };

  const openPartialPayment = () => {
    setPayAmount(0);
    setPayPurpose('PartialPayment');
    setPayMode('partial');
    setPaySuccess(false);
    setError('');
  };

  const cancelPayment = () => {
    setPayMode(null);
    setError('');
  };

  const recordPaymentMutation = useMutation({
    mutationFn: () => api.post('/payments', {
      bookingId: invoice!.booking.id,
      amount: payAmount,
      purpose: payPurpose,
      method: payMethod,
      notes: payNotes || undefined,
    }),
    onSuccess: async () => {
      await refetch();
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['in-house'] });
      setPayMode(null);
      setPaySuccess(true);
      setPayNotes('');
      setError('');
    },
    onError: (err) => setError(apiError(err)),
  });

  const printInvoice = () => {
    if (!invoice) return;
    const b = invoice.booking;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Invoice ${invoice.number}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 24px; color: #111; }
  h1 { font-size: 20px; margin-bottom: 0; }
  .sub { font-size: 11px; color: #555; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #333; font-size: 11px; text-transform: uppercase; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .total-row td { border-top: 2px solid #333; font-weight: bold; font-size: 13px; }
  .section { margin-top: 16px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1>Motel CMB – 53</h1>
<div class="sub">
  No. 53, Panchikawatta Road, Maradana, Colombo 10, Sri Lanka<br/>
  Tel: 0112 323 728 | 077 771 5178 | 075 771 5178
</div>

<table>
<tr><td class="bold">Invoice No.</td><td>${invoice.number}</td><td class="bold">Booking Ref.</td><td>${b.reference}</td></tr>
<tr><td class="bold">Guest</td><td>${b.guestName}</td><td class="bold">Room</td><td>${b.room.number}</td></tr>
<tr><td class="bold">Check-In</td><td>${b.actualCheckIn ? format(parseISO(b.actualCheckIn), 'dd MMM yyyy HH:mm') : format(parseISO(b.checkInDate), 'dd MMM yyyy')}</td>
    <td class="bold">Check-Out</td><td>${format(parseISO(b.checkOutDate), 'dd MMM yyyy HH:mm')}</td></tr>
<tr><td class="bold">Nights</td><td>${b.nights}</td><td class="bold">Type</td><td>${b.isAc ? 'A/C' : 'Non-A/C'}</td></tr>
</table>

<table>
<thead><tr><th>Description</th><th>Qty</th><th class="right">Unit Price</th><th class="right">Amount</th></tr></thead>
<tbody>
${invoice.items.map(item => `<tr>
<td>${item.description}</td>
<td>${item.quantity}</td>
<td class="right">LKR ${Number(item.unitPrice).toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td>
<td class="right">LKR ${Number(item.total).toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td>
</tr>`).join('')}
</tbody>
<tfoot>
<tr class="total-row"><td colspan="3">Total</td><td class="right">LKR ${total.toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td></tr>
</tfoot>
</table>

${invoice.payments.length > 0 ? `
<div class="section">
<table>
<thead><tr><th>Payments Received</th><th>Method</th><th>Purpose</th><th class="right">Amount</th></tr></thead>
<tbody>
${invoice.payments.map(p => `<tr>
<td>${format(parseISO(p.paymentDate), 'dd MMM yyyy HH:mm')}</td>
<td>${p.method}</td>
<td>${p.purpose}</td>
<td class="right">LKR ${Number(p.amount).toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td>
</tr>`).join('')}
</tbody>
<tfoot>
<tr><td colspan="3" class="bold">Outstanding Balance</td>
<td class="right bold">LKR ${outstanding.toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td></tr>
</tfoot>
</table>
</div>` : ''}

<div style="margin-top:40px; display:flex; justify-content:space-between;">
<div><div style="border-top:1px solid #333;width:180px;padding-top:4px;">Cashier Signature</div></div>
<div><div style="border-top:1px solid #333;width:180px;padding-top:4px;">Guest Signature</div></div>
</div>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) { alert('Allow pop-ups to print the invoice'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center text-slate-400">
        Loading invoice…
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center space-y-4">
        <AlertCircle className="w-10 h-10 mx-auto text-rose-400" />
        <p className="text-slate-600">Invoice not found.</p>
        <Button variant="outline" onClick={() => navigate('/in-house')}>Go to In-House Guests</Button>
      </div>
    );
  }

  const b = invoice.booking;
  const isFullyPaid = outstanding <= 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Success banner */}
      {fromCheckin && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-6 py-5 flex items-start gap-4">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-emerald-800">Guest Checked In Successfully</h2>
            <p className="text-sm text-emerald-700 mt-0.5">
              {b.guestName} · Room {b.room.number} · {b.reference}
            </p>
          </div>
        </div>
      )}

      {/* Skip payment confirmation */}
      {skipConfirmed && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-slate-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-700">Payment deferred</p>
            <p className="text-xs text-slate-500">Guest checked in. Payment of {formatCurrency(outstanding)} is outstanding and can be collected during the stay or at checkout.</p>
          </div>
        </div>
      )}

      {/* Payment success */}
      {paySuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium text-emerald-800">Payment recorded successfully.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Left column — Invoice details */}
        <div className="md:col-span-2 space-y-4">

          {/* Booking summary */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Invoice {invoice.number}</CardTitle>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[invoice.status] || 'bg-slate-100 text-slate-600'}`}>
                  {invoice.status === 'PartiallyPaid' ? 'Partially Paid' : invoice.status}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div><span className="text-slate-500">Booking</span><p className="font-medium">{b.reference}</p></div>
                <div><span className="text-slate-500">Room</span><p className="font-bold text-lg">Room {b.room.number}</p></div>
                <div><span className="text-slate-500">Guest</span><p className="font-medium">{b.guestName}</p></div>
                <div><span className="text-slate-500">Mobile</span><p className="font-medium">{b.guestMobile}</p></div>
                <div>
                  <span className="text-slate-500">Check-In</span>
                  <p className="font-medium">
                    {b.actualCheckIn
                      ? format(parseISO(b.actualCheckIn), 'dd MMM yyyy HH:mm')
                      : format(parseISO(b.checkInDate), 'dd MMM yyyy HH:mm')}
                  </p>
                </div>
                <div><span className="text-slate-500">Check-Out</span><p className="font-medium">{format(parseISO(b.checkOutDate), 'dd MMM yyyy HH:mm')}</p></div>
                <div><span className="text-slate-500">Nights</span><p className="font-medium">{b.nights}</p></div>
                <div><span className="text-slate-500">Type</span><p className="font-medium">{b.isAc ? 'A/C' : 'Non-A/C'}</p></div>
              </div>

              {/* Invoice line items */}
              <div className="border-t border-slate-100 pt-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 uppercase">
                      <th className="text-left font-medium pb-2">Description</th>
                      <th className="text-right font-medium pb-2 w-12">Qty</th>
                      <th className="text-right font-medium pb-2 w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {invoice.items.map(item => (
                      <tr key={item.id}>
                        <td className="py-2 pr-3 text-slate-700">{item.description}</td>
                        <td className="py-2 text-right text-slate-500">{item.quantity}</td>
                        <td className={`py-2 text-right font-medium ${Number(item.total) < 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                          {Number(item.total) < 0 ? `−${formatCurrency(Math.abs(Number(item.total)))}` : formatCurrency(Number(item.total))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200">
                      <td colSpan={2} className="pt-3 font-bold text-slate-900">Invoice Total</td>
                      <td className="pt-3 text-right font-bold text-slate-900 text-base">{formatCurrency(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Payment history */}
              {invoice.payments.length > 0 && (
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payments Received</p>
                  {invoice.payments.map(p => (
                    <div key={p.id} className="flex justify-between items-center text-sm">
                      <div>
                        <span className="font-medium text-slate-700">{PURPOSE_LABELS[p.purpose] || p.purpose}</span>
                        <span className="text-slate-400 text-xs ml-2">{METHOD_LABELS[p.method] || p.method} · {format(parseISO(p.paymentDate), 'dd MMM yyyy HH:mm')}</span>
                      </div>
                      <span className="font-semibold text-emerald-700">{formatCurrency(Number(p.amount))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center text-sm pt-1 border-t border-slate-100">
                    <span className="text-slate-600">Total Received</span>
                    <span className="font-semibold text-emerald-700">{formatCurrency(paid)}</span>
                  </div>
                </div>
              )}

              {/* Balance summary */}
              <div className={`rounded-xl p-4 flex justify-between items-center ${isFullyPaid ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'}`}>
                <span className={`text-sm font-semibold ${isFullyPaid ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {isFullyPaid ? 'Fully Settled' : 'Outstanding Balance'}
                </span>
                <span className={`text-xl font-black ${isFullyPaid ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {isFullyPaid ? formatCurrency(0) : formatCurrency(outstanding)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Payment form */}
          {payMode && (
            <Card>
              <CardHeader>
                <CardTitle>{payMode === 'full' ? 'Collect Full Payment' : 'Record Partial Payment'}</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Amount (LKR)</label>
                    <Input
                      type="number"
                      min={1}
                      max={outstanding}
                      value={payAmount || ''}
                      onChange={e => setPayAmount(Number(e.target.value))}
                      readOnly={payMode === 'full'}
                      className={payMode === 'full' ? 'bg-slate-50' : ''}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
                    <Select value={payMethod} onChange={e => setPayMethod(e.target.value as any)}>
                      <option value="Cash">Cash</option>
                      <option value="Card">Card / POS</option>
                      <option value="BankTransfer">Bank Transfer</option>
                      <option value="Other">Other</option>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Purpose</label>
                    <Select value={payPurpose} onChange={e => setPayPurpose(e.target.value as any)}>
                      {paid > 0 && <option value="PartialPayment">Partial Payment</option>}
                      <option value="FinalPayment">Full / Final Payment</option>
                      {paid === 0 && <option value="Deposit">Deposit</option>}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                    <Input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="e.g. ref number" />
                  </div>
                </div>

                {error && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    className="flex-1"
                    onClick={() => recordPaymentMutation.mutate()}
                    disabled={recordPaymentMutation.isPending || payAmount <= 0 || payAmount > outstanding + 0.01}
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {recordPaymentMutation.isPending ? 'Recording…' : `Record ${formatCurrency(payAmount)}`}
                  </Button>
                  <Button variant="outline" onClick={cancelPayment} disabled={recordPaymentMutation.isPending}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column — Actions */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-5 space-y-3">
              {!isFullyPaid && !payMode && (
                <>
                  <Button className="w-full" onClick={openFullPayment}>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Collect Full Payment
                  </Button>
                  <Button variant="outline" className="w-full" onClick={openPartialPayment}>
                    Record Partial Payment
                  </Button>
                  <div className="border-t border-slate-100 pt-3">
                    <Button
                      variant="ghost"
                      className="w-full text-slate-500 hover:text-slate-700"
                      onClick={() => { setSkipConfirmed(true); }}
                    >
                      <SkipForward className="w-4 h-4 mr-2" />
                      Skip Payment for Now
                    </Button>
                  </div>
                </>
              )}

              {isFullyPaid && !payMode && (
                <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium py-2">
                  <CheckCircle className="w-4 h-4" /> Fully paid — no balance due
                </div>
              )}

              <div className={`space-y-2 ${!isFullyPaid && !payMode ? 'border-t border-slate-100 pt-3' : ''}`}>
                <Button variant="outline" className="w-full" onClick={printInvoice}>
                  <Printer className="w-4 h-4 mr-2" />
                  Print Invoice
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => navigate('/in-house')}>
                  <Users className="w-4 h-4 mr-2" />
                  Go to In-House Guests
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => navigate('/rooms')}>
                  <BedDouble className="w-4 h-4 mr-2" />
                  Room Board
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Booking summary mini */}
          <Card>
            <CardContent className="p-4 space-y-2 text-xs text-slate-500">
              <div className="flex justify-between">
                <span>Booking</span><span className="font-medium text-slate-700">{b.reference}</span>
              </div>
              <div className="flex justify-between">
                <span>Status</span>
                <span className={`font-semibold ${b.status === 'CheckedIn' ? 'text-indigo-700' : 'text-slate-700'}`}>
                  {b.status === 'CheckedIn' ? 'Checked In' : b.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Invoice Total</span><span className="font-medium text-slate-700">{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between">
                <span>Paid</span><span className="font-medium text-emerald-600">{formatCurrency(paid)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <span>Outstanding</span>
                <span className={`font-bold ${isFullyPaid ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatCurrency(outstanding)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Back link */}
      <button
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        onClick={() => navigate(-1)}
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
    </div>
  );
}
