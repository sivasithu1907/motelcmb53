import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Search, Plus } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { formatDate } from '../lib/utils';
import { api } from '../api/client';

interface Guest {
  id: string;
  fullName: string;
  documentType: string;
  documentNumberMasked: string;
  mobile: string;
  nationality: string;
  status: string;
  createdAt: string;
  _count: { bookings: number };
}

export default function Guests() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ data: Guest[]; total: number }>({
    queryKey: ['guests', search, page],
    queryFn: () => api.get('/guests', { params: { search: search || undefined, page, limit: 30 } }).then(r => r.data),
  });

  const guests = data?.data || [];
  const total = data?.total || 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Guests</h2>
          <p className="text-sm text-slate-500 mt-1">{total} registered guests</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input className="pl-9" placeholder="Search by name, mobile…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Guest</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Document</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Mobile</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Nationality</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-center">Stays</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Registered</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
                {!isLoading && guests.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No guests found</td></tr>}
                {guests.map(g => (
                  <tr key={g.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-900">{g.fullName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-500">{g.documentType}</p>
                      <p className="text-sm font-mono text-slate-700">{g.documentNumberMasked}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{g.mobile}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{g.nationality}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-semibold text-slate-900">{g._count.bookings}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatDate(g.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={g.status === 'Active' ? 'success' : 'danger'}>{g.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 30 && (
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-sm text-slate-500">Showing {Math.min(page * 30, total)} of {total}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page * 30 >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
