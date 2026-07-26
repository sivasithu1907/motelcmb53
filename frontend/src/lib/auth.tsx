import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../api/client';

export type UserRole = 'SuperAdmin' | 'OwnerAdmin' | 'BuildingManager' | 'Operator' | 'Cashier' | 'ReadOnly';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId: string;
  buildingIds: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  currentBuildingId: string;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setBuilding: (id: string) => void;
  can: (action: PermissionAction) => boolean;
}

export type PermissionAction =
  | 'create_booking'
  | 'edit_booking'
  | 'cancel_booking'
  | 'checkin'
  | 'checkout'
  | 'record_payment'
  | 'apply_discount'
  | 'manage_rooms'
  | 'manage_users'
  | 'manage_employees'
  | 'view_reports'
  | 'view_audit'
  | 'manage_settings'
  | 'override_capacity'
  | 'refund';

const PERMISSIONS: Record<UserRole, PermissionAction[]> = {
  SuperAdmin: [
    'create_booking', 'edit_booking', 'cancel_booking', 'checkin', 'checkout',
    'record_payment', 'apply_discount', 'manage_rooms', 'manage_users',
    'manage_employees', 'view_reports', 'view_audit', 'manage_settings',
    'override_capacity', 'refund',
  ],
  OwnerAdmin: [
    'create_booking', 'edit_booking', 'cancel_booking', 'checkin', 'checkout',
    'record_payment', 'apply_discount', 'manage_rooms', 'manage_users',
    'manage_employees', 'view_reports', 'view_audit', 'manage_settings',
    'override_capacity', 'refund',
  ],
  BuildingManager: [
    'create_booking', 'edit_booking', 'cancel_booking', 'checkin', 'checkout',
    'record_payment', 'apply_discount', 'manage_rooms', 'manage_employees',
    'view_reports', 'view_audit', 'override_capacity', 'refund',
  ],
  Operator: [
    'create_booking', 'edit_booking', 'checkin', 'checkout', 'view_reports',
  ],
  Cashier: [
    'record_payment', 'view_reports', 'refund',
  ],
  ReadOnly: ['view_reports'],
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentBuildingId, setCurrentBuildingId] = useState('');

  useEffect(() => {
    api.get('/auth/me')
      .then((r) => {
        setUser(r.data.user);
        if (r.data.user.buildingIds?.length > 0) {
          setCurrentBuildingId(r.data.user.buildingIds[0]);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api.post('/auth/login', { email, password });
    setUser(r.data.user);
    if (r.data.user.buildingIds?.length > 0) {
      setCurrentBuildingId(r.data.user.buildingIds[0]);
    }
  };

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
    window.location.href = '/login';
  };

  const setBuilding = (id: string) => setCurrentBuildingId(id);

  const can = (action: PermissionAction): boolean => {
    if (!user) return false;
    return PERMISSIONS[user.role]?.includes(action) ?? false;
  };

  return (
    <AuthContext.Provider value={{ user, loading, currentBuildingId, login, logout, setBuilding, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
