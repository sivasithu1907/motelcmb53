import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './lib/auth';

import DashboardLayout from './components/layout/DashboardLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import RoomBoard from './pages/RoomBoard';
import NewBooking from './pages/NewBooking';
import BookingCalendar from './pages/BookingCalendar';
import Bookings from './pages/Bookings';
import InHouseGuests from './pages/InHouseGuests';
import Guests from './pages/Guests';
import CheckIn from './pages/CheckIn';
import CheckInPayment from './pages/CheckInPayment';
import CheckOut from './pages/CheckOut';
import Invoices from './pages/Invoices';
import Payments from './pages/Payments';
import Employees from './pages/Employees';
import Reports from './pages/Reports';
import Users from './pages/Users';
import AuditLog from './pages/AuditLog';
import SystemSettings from './pages/SystemSettings';
import Buildings from './pages/Buildings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-400 text-sm">Loading…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      <Route path="/" element={
        <RequireAuth>
          <DashboardLayout />
        </RequireAuth>
      }>
        <Route index element={<Dashboard />} />
        <Route path="rooms" element={<RoomBoard />} />
        <Route path="book" element={<NewBooking />} />
        <Route path="calendar" element={<BookingCalendar />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="bookings/:id" element={<Bookings />} />
        <Route path="in-house" element={<InHouseGuests />} />
        <Route path="guests" element={<Guests />} />
        <Route path="check-in" element={<CheckIn />} />
        <Route path="check-in-payment" element={<CheckInPayment />} />
        <Route path="check-in-payment/:invoiceId" element={<CheckInPayment />} />
        <Route path="checkout" element={<CheckOut />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/:id" element={<Invoices />} />
        <Route path="payments" element={<Payments />} />
        <Route path="employees" element={<Employees />} />
        <Route path="reports" element={<Reports />} />
        <Route path="users" element={<Users />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="settings" element={<SystemSettings />} />
        <Route path="buildings" element={<Buildings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
