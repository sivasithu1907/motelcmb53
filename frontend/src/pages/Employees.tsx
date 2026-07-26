import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Briefcase } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { formatDate } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { api, apiError } from '../api/client';

interface Employee {
  id: string;
  fullName: string;
  mobile: string;
  nic: string;
  jobTitle: string;
  joiningDate: string;
  status: string;
  emergencyContact?: string;
  building: { name: string; code: string };
  user?: { email: string; role: string };
}

export default function Employees() {
  const { currentBuildingId, can } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    fullName: '', mobile: '', nic: '', jobTitle: '',
    joiningDate: '', status: 'Active', emergencyContact: '',
  });
  const [formError, setFormError] = useState('');

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ['employees', currentBuildingId],
    queryFn: () => api.get('/employees', { params: { buildingId: currentBuildingId } }).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/employees', { ...form, buildingId: currentBuildingId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      setShowForm(false);
      setForm({ fullName: '', mobile: '', nic: '', jobTitle: '', joiningDate: '', status: 'Active', emergencyContact: '' });
    },
    onError: (err) => setFormError(apiError(err)),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Employees</h2>
          <p className="text-sm text-slate-500 mt-1">{employees.length} staff members</p>
        </div>
        {can('manage_employees') && (
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4 mr-2" /> Add Employee
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>New Employee</CardTitle></CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { key: 'fullName', label: 'Full Name', placeholder: 'Full legal name' },
                { key: 'mobile', label: 'Mobile', placeholder: '07X XXXXXXX' },
                { key: 'nic', label: 'NIC Number', placeholder: 'NIC number' },
                { key: 'jobTitle', label: 'Job Title', placeholder: 'e.g. Receptionist' },
                { key: 'joiningDate', label: 'Joining Date', type: 'date' },
                { key: 'emergencyContact', label: 'Emergency Contact', placeholder: 'Name & phone' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{f.label}</label>
                  <Input
                    type={f.type || 'text'}
                    placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <Select value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </Select>
              </div>
            </div>
            {formError && <p className="text-sm text-rose-600">{formError}</p>}
            <div className="flex gap-3">
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Saving…' : 'Save Employee'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-16 text-slate-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {employees.length === 0 && (
            <div className="col-span-3 text-center py-16 text-slate-400">
              <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No employees on record</p>
            </div>
          )}
          {employees.map(emp => (
            <Card key={emp.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                    {emp.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <Badge variant={emp.status === 'Active' ? 'success' : 'default'}>{emp.status}</Badge>
                </div>
                <h3 className="font-semibold text-slate-900">{emp.fullName}</h3>
                <p className="text-sm text-slate-500">{emp.jobTitle}</p>
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  <p>📱 {emp.mobile}</p>
                  <p>🪪 {emp.nic}</p>
                  <p>📅 Since {formatDate(emp.joiningDate)}</p>
                  <p>🏢 {emp.building.name}</p>
                  {emp.user && <p>💼 {emp.user.role}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
