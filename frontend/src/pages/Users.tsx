import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, UserCog } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { formatDateTime, ROLE_LABELS } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { api, apiError } from '../api/client';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  buildingAccess: Array<{ building: { name: string; code: string } }>;
}

interface Building { id: string; name: string; code: string; isActive: boolean; }

const ROLES = ['OwnerAdmin', 'BuildingManager', 'Operator', 'Cashier', 'ReadOnly'];

export default function Users() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'Operator',
    buildingIds: [] as string[], isActive: true,
  });
  const [formError, setFormError] = useState('');

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  });

  const { data: buildings = [] } = useQuery<Building[]>({
    queryKey: ['buildings'],
    queryFn: () => api.get('/buildings').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/users', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowForm(false);
      setForm({ name: '', email: '', password: '', role: 'Operator', buildingIds: [], isActive: true });
    },
    onError: (err) => setFormError(apiError(err)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/users/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  if (!can('manage_users')) {
    return (
      <div className="text-center py-16 text-slate-400">
        <UserCog className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>You do not have permission to manage users</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Users &amp; Roles</h2>
          <p className="text-sm text-slate-500 mt-1">{users.length} user accounts</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-2" /> Add User
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>New User Account</CardTitle></CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Full name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@motelcmb53.lk" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password (min 8 chars)</label>
                <Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <Select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Building Access</label>
              <div className="space-y-2">
                {buildings.filter(b => b.isActive).map(b => (
                  <label key={b.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.buildingIds.includes(b.id)}
                      onChange={e => setForm(p => ({
                        ...p,
                        buildingIds: e.target.checked
                          ? [...p.buildingIds, b.id]
                          : p.buildingIds.filter(id => id !== b.id),
                      }))}
                      className="rounded text-indigo-600"
                    />
                    <span className="text-sm text-slate-700">{b.name} ({b.code})</span>
                  </label>
                ))}
              </div>
            </div>
            {formError && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 px-4 py-3 rounded-lg">{formError}</p>}
            <div className="flex gap-3">
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : 'Create User'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-16 text-slate-400">Loading…</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Email</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Role</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Buildings</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Last Login</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{u.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{u.email}</td>
                      <td className="px-4 py-3">
                        <Badge variant={u.role === 'OwnerAdmin' ? 'danger' : u.role === 'BuildingManager' ? 'warning' : 'default'}>
                          {ROLE_LABELS[u.role] || u.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {u.buildingAccess.map(a => a.building.code).join(', ') || 'None'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={u.isActive ? 'success' : 'default'}>{u.isActive ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm"
                          onClick={() => toggleActiveMutation.mutate({ id: u.id, isActive: !u.isActive })}>
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
