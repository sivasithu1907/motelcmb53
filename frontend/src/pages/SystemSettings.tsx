import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Settings as SettingsIcon, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { useAuth } from '../lib/auth';
import { api, apiError } from '../api/client';
import { setCurrentCurrency } from '../lib/utils';

export default function SystemSettings() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const { data: settings = {} } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then(r => r.data),
  });

  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (Object.keys(settings).length > 0) {
      setForm(settings);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => api.put('/settings', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['settings-currency'] });
      if (form.currency) setCurrentCurrency(form.currency);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => setError(apiError(err)),
  });

  const set = (key: string, value: string) => setForm(p => ({ ...p, [key]: value }));

  if (!can('manage_settings')) {
    return (
      <div className="text-center py-16 text-slate-400">
        <SettingsIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>You do not have permission to manage settings</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">System Settings</h2>
          <p className="text-sm text-slate-500 mt-1">Business configuration and defaults</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle className="w-4 h-4" /> Saved
            </span>
          )}
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {/* Business */}
      <Card>
        <CardHeader><CardTitle>Business Information</CardTitle></CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Business Name</label>
              <Input value={form.businessName || ''} onChange={e => set('businessName', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
              <Input value={form.address || ''} onChange={e => set('address', e.target.value)} />
            </div>
            {['phone1', 'phone2', 'phone3'].map((k, i) => (
              <div key={k}>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone {i + 1}</label>
                <Input value={form[k] || ''} onChange={e => set(k, e.target.value)} placeholder="0XX XXX XXXX" />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
              <Select value={form.currency || 'LKR'} onChange={e => set('currency', e.target.value)}>
                <option value="LKR">LKR — Sri Lankan Rupee</option>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="INR">INR — Indian Rupee</option>
                <option value="AUD">AUD — Australian Dollar</option>
                <option value="CAD">CAD — Canadian Dollar</option>
                <option value="SGD">SGD — Singapore Dollar</option>
                <option value="AED">AED — UAE Dirham</option>
                <option value="JPY">JPY — Japanese Yen</option>
                <option value="CNY">CNY — Chinese Yuan</option>
                <option value="MVR">MVR — Maldivian Rufiyaa</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
              <Input value={form.timezone || 'Asia/Colombo'} onChange={e => set('timezone', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Booking defaults */}
      <Card>
        <CardHeader><CardTitle>Booking Defaults</CardTitle></CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Default Check-In Time</label>
              <Input type="time" value={form.defaultCheckIn || '14:00'} onChange={e => set('defaultCheckIn', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Default Check-Out Time</label>
              <Input type="time" value={form.defaultCheckOut || '12:00'} onChange={e => set('defaultCheckOut', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">A/C Surcharge (LKR/night)</label>
              <Input type="number" min={0} value={form.acSurcharge || '2500'} onChange={e => set('acSurcharge', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deposits */}
      <Card>
        <CardHeader><CardTitle>Deposit Settings</CardTitle></CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Deposits Enabled</label>
              <Select value={form.depositEnabled || 'true'} onChange={e => set('depositEnabled', e.target.value)}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Default Deposit (LKR)</label>
              <Input type="number" min={0} value={form.defaultDeposit || '2500'} onChange={e => set('defaultDeposit', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Service Charge */}
      <Card>
        <CardHeader><CardTitle>Service Charge</CardTitle></CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Service Charge Enabled</label>
              <Select value={form.serviceChargeEnabled || 'false'} onChange={e => set('serviceChargeEnabled', e.target.value)}>
                <option value="false">Disabled</option>
                <option value="true">Enabled</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <Select value={form.serviceChargeType || 'percentage'} onChange={e => set('serviceChargeType', e.target.value)}>
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed Amount</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Value</label>
              <Input type="number" min={0} value={form.serviceChargeValue || '10'} onChange={e => set('serviceChargeValue', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Discounts */}
      <Card>
        <CardHeader><CardTitle>Discount Settings</CardTitle></CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Discounts Enabled</label>
              <Select value={form.discountEnabled || 'true'} onChange={e => set('discountEnabled', e.target.value)}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Approval Required</label>
              <Select value={form.discountApprovalRequired || 'false'} onChange={e => set('discountApprovalRequired', e.target.value)}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Max Operator Discount (LKR)</label>
              <Input type="number" min={0} value={form.maxOperatorDiscount || '1000'} onChange={e => set('maxOperatorDiscount', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Future integrations */}
      <Card>
        <CardHeader><CardTitle>Future Integrations</CardTitle></CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {['WhatsApp Notifications', 'SMS Gateway', 'Email Delivery', 'Online Payment', 'Smart Lock', 'Online Booking'].map(name => (
              <div key={name} className="border border-slate-200 rounded-lg p-3 text-center">
                <p className="text-sm font-medium text-slate-700">{name}</p>
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full mt-1 inline-block">Coming Soon</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
