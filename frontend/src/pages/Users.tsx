import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, UserCog, Pencil, Trash2, X } from 'lucide-react';
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
  buildingAccess: Array<{ building: { id?: string; name: string; code: string } }>;
}

interface Building { id: string; name: string; code: string; isActive: boolean; }

const ROLES = ['OwnerAdmin', 'BuildingManager', 'Operator', 'Cashier', 'ReadOnly'];

const emptyForm = {
  name: '', email: '', password: '', role: 'Operator',
  buildingIds: [] as string[], isActive: true,
};

export default function Users() {
  const { can, user: currentUser } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  });

  const { data: buildings = [] } = useQuery<Building[]>({
    queryKey: ['buildings'],
    queryFn: () => api.get('/buildings').then(r => r.data),
  });

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowForm(false);
    setFormError('');
  };

  const createMutation = useMutation({
    mutationFn: () => api.post('/users', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      resetForm();
    },
    onError: (err) => setFormError(apiError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const payload: any = {
        name: form.name,
        role: form.role,
        isActive: form.isActive,
        buildingIds: form.buildingIds,
      };
      if (form.password) payload.password = form.password; // only if resetting
      return api.patch(`/users/${editingId}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      resetForm();
    },
    onError: (err) => setFormError(apiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      if (res.data.deactivated) {
        setNotice(res.data.message);
        setTimeout(() => setNotice(''), 8000);
      }
    },
    onError: (err) => {
      setNotice('Error: ' + apiError(err));
      setTimeout(() => setNotice(''), 8000);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/users/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const startEdit = (u: User) => {
    setEditingId(u.id);
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      buildingIds: u.buildingAccess
        .map(a => buildings.find(b => b.code === a.building.code)?.id || '')
        .filter(Boolean),
      isActive: u.isActive,
    });
    setShowForm(true);
    setFormError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (u: User) => {
    if (u.id === currentUser?.id) {
      alert('You cannot delete your own account.');
      return;
    }
    if (confirm(`Delete user "${u.name}" (${u.email})?\n\nIf this user has booking or payment history, the account will be deactivated instead of deleted.`)) {
      deleteMutation.mutate(u.id);
    }
  };

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
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Add User
        </Button>
      </div>

      {notice && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
          {notice}
        </div>
      )}

      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{editingId ? 'Edit User' : 'New User Account'}</CardTitle>
            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Full name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <Input type="email" value={form.email} disabled={!!editingId}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@motelcmb53.lk" />
                {editingId && <p className="text-xs text-slate-400 mt-1">Email cannot be changed</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {editingId ? 'New Password (leave blank to keep current)' : 'Password (min 8 chars)'}
                </label>
                <Input type="password" value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder={editingId ? 'Unchanged' : '••••••••'} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <Select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
                </Select>
              </div>
              {editingId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <Select value={form.isActive ? 'active' : 'inactive'}
                    onChange={e => setForm(p => ({ ...p, isActive: e.target.value === 'active' }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </div>
              )}
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
              <Button
                onClick={() => editingId ? updateMutation.mutate() : createMutation.mutate()}
                disabled={createMutation.isPending || updateMutation.isPending}>
                {editingId
                  ? (updateMutation.isPending ? 'Saving…' : 'Save Changes')
                  : (createMutation.isPending ? 'Creating…' : 'Create User')}
              </Button>
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
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
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Email</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Role</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Buildings</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Last Login</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {u.name}
                        {u.id === currentUser?.id && <span className="ml-2 text-xs text-indigo-500">(you)</span>}
                      </td>
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
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(u)} title="Edit user">
                            <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                          </Button>
                          <Button variant="ghost" size="sm"
                            onClick={() => toggleActiveMutation.mutate({ id: u.id, isActive: !u.isActive })}>
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                          {u.id !== currentUser?.id && (
                            <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              onClick={() => handleDelete(u)} title="Delete user"
                              disabled={deleteMutation.isPending}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
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
