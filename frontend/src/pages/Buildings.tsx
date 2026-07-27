import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Pencil, X, MapPin, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../lib/auth';
import { api, apiError } from '../api/client';

interface BuildingRow {
  id: string;
  name: string;
  code: string;
  address: string;
  contactNumbers: string[];
  isActive: boolean;
  bookingPrefix?: string;
  invoicePrefix?: string;
  _count?: { rooms: number };
}

const emptyForm = {
  name: '', code: '', address: '', contactNumbers: '', isActive: true,
  bookingPrefix: '', invoicePrefix: '',
};

export default function Buildings() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');

  const { data: buildings = [], isLoading } = useQuery<BuildingRow[]>({
    queryKey: ['buildings'],
    queryFn: () => api.get('/buildings').then(r => r.data),
  });

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowForm(false);
    setFormError('');
  };

  const startEdit = (b: BuildingRow) => {
    setEditingId(b.id);
    setForm({
      name: b.name,
      code: b.code,
      address: b.address,
      contactNumbers: (b.contactNumbers || []).join(', '),
      isActive: b.isActive,
      bookingPrefix: b.bookingPrefix || '',
      invoicePrefix: b.invoicePrefix || '',
    });
    setShowForm(true);
    setFormError('');
  };

  const buildPayload = () => ({
    name: form.name,
    code: form.code,
    address: form.address,
    contactNumbers: form.contactNumbers.split(',').map(s => s.trim()).filter(Boolean),
    isActive: form.isActive,
    bookingPrefix: form.bookingPrefix || undefined,
    invoicePrefix: form.invoicePrefix || undefined,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/buildings', buildPayload()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['buildings'] }); resetForm(); },
    onError: (err) => setFormError(apiError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.patch(`/buildings/${editingId}`, buildPayload()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['buildings'] }); resetForm(); },
    onError: (err) => setFormError(apiError(err)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/buildings/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  });

  if (!can('manage_settings')) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>You do not have permission to manage locations</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Locations / Buildings</h2>
          <p className="text-sm text-slate-500 mt-1">
            {buildings.filter(b => b.isActive).length} active of {buildings.length} total
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Add Location
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{editingId ? 'Edit Location' : 'New Location'}</CardTitle>
            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Location Name</label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Motel CMB 53 - Colombo" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Code</label>
                <Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="e.g. CMB01" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Full address" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Numbers (comma-separated)</label>
                <Input value={form.contactNumbers} onChange={e => setForm(p => ({ ...p, contactNumbers: e.target.value }))} placeholder="011 234 5678, 077 123 4567" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Booking Prefix</label>
                <Input value={form.bookingPrefix} onChange={e => setForm(p => ({ ...p, bookingPrefix: e.target.value.toUpperCase() }))} placeholder="e.g. BKG" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Prefix</label>
                <Input value={form.invoicePrefix} onChange={e => setForm(p => ({ ...p, invoicePrefix: e.target.value.toUpperCase() }))} placeholder="e.g. INV" />
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isActive}
                    onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                    className="rounded text-indigo-600" />
                  <span className="text-sm font-medium text-slate-700">Active — visible in the building switcher and bookable</span>
                </label>
              </div>
            </div>
            {formError && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 px-4 py-3 rounded-lg">{formError}</p>}
            <div className="flex gap-3">
              <Button
                onClick={() => editingId ? updateMutation.mutate() : createMutation.mutate()}
                disabled={createMutation.isPending || updateMutation.isPending || !form.name || !form.code || !form.address}>
                {editingId
                  ? (updateMutation.isPending ? 'Saving…' : 'Save Changes')
                  : (createMutation.isPending ? 'Creating…' : 'Create Location')}
              </Button>
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-16 text-slate-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {buildings.map(b => (
            <Card key={b.id} className={!b.isActive ? 'opacity-60' : ''}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900">{b.name}</h3>
                      <Badge variant="default">{b.code}</Badge>
                    </div>
                    <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3.5 h-3.5 shrink-0" /> {b.address}
                    </p>
                    {b.contactNumbers?.length > 0 && (
                      <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3.5 h-3.5 shrink-0" /> {b.contactNumbers.join(', ')}
                      </p>
                    )}
                  </div>
                  <Badge variant={b.isActive ? 'success' : 'default'}>{b.isActive ? 'Active' : 'Inactive'}</Badge>
                </div>
                <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                  <Button variant="outline" size="sm" onClick={() => startEdit(b)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm"
                    onClick={() => toggleActiveMutation.mutate({ id: b.id, isActive: !b.isActive })}>
                    {b.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
