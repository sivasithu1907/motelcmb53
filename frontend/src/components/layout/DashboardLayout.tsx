import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BedDouble, CalendarDays, Users, LogOut, Settings,
  FileText, CreditCard, Building2, UserCog, Menu, X, Briefcase,
  UserCheck, Clock, ClipboardList, List, ChevronsLeft, ChevronsRight, MapPin,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { cn, ROLE_LABELS, setCurrentCurrency } from '../../lib/utils';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

interface Building { id: string; code: string; name: string; isActive: boolean; }

const SIDEBAR_COLLAPSE_KEY = 'motelcmb53:sidebarCollapsed';

export default function DashboardLayout() {
  const { user, currentBuildingId, setBuilding, logout, can } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  const { data: buildings = [] } = useQuery<Building[]>({
    queryKey: ['buildings'],
    queryFn: () => api.get('/buildings').then(r => r.data),
  });

  // Apply the org's configured currency to every formatCurrency() call in the app
  useQuery({
    queryKey: ['settings-currency'],
    queryFn: async () => {
      const res = await api.get('/settings');
      setCurrentCurrency(res.data?.currency || 'LKR');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  type NavItem = { name: string; path: string; icon: React.ComponentType<any>; always?: boolean; perm?: string };
  const navGroups: Array<{ title: string; items: NavItem[] }> = [
    {
      title: 'Overview',
      items: [
        { name: 'Dashboard', path: '/', icon: LayoutDashboard, always: true },
        { name: 'Room Board', path: '/rooms', icon: BedDouble, always: true },
        { name: 'Booking Calendar', path: '/calendar', icon: CalendarDays, always: true },
      ],
    },
    {
      title: 'Operations',
      items: [
        { name: 'Bookings', path: '/bookings', icon: List, always: true },
        { name: 'In-House Guests', path: '/in-house', icon: BedDouble, always: true },
        { name: 'Guests', path: '/guests', icon: Users, always: true },
        { name: 'Check-In', path: '/check-in', icon: UserCheck, perm: 'checkin' },
        { name: 'Checkout', path: '/checkout', icon: LogOut, perm: 'checkout' },
      ],
    },
    {
      title: 'Billing',
      items: [
        { name: 'Invoices', path: '/invoices', icon: FileText, always: true },
        { name: 'Payments', path: '/payments', icon: CreditCard, perm: 'record_payment' },
      ],
    },
    {
      title: 'Management',
      items: [
        { name: 'Employees', path: '/employees', icon: Briefcase, perm: 'manage_employees' },
        { name: 'Reports', path: '/reports', icon: ClipboardList, perm: 'view_reports' },
        { name: 'Locations', path: '/buildings', icon: MapPin, perm: 'manage_settings' },
        { name: 'Users & Roles', path: '/users', icon: UserCog, perm: 'manage_users' },
        { name: 'Audit Log', path: '/audit', icon: Clock, perm: 'view_audit' },
        { name: 'Settings', path: '/settings', icon: Settings, perm: 'manage_settings' },
      ],
    },
  ];

  const renderSidebar = (isMobile: boolean) => {
    const showLabels = isMobile || !collapsed;
    return (
      <>
        <div className={cn("h-16 flex items-center bg-slate-950 border-b border-slate-800 shrink-0", showLabels ? "justify-between px-6" : "justify-center px-2")}>
          <div className="flex items-center min-w-0">
            <Building2 className="w-6 h-6 text-indigo-400 shrink-0" />
            {showLabels && <span className="text-lg font-bold text-white tracking-tight truncate ml-3">Motel CMB 53</span>}
          </div>
          {isMobile && (
            <button className="text-slate-400 hover:text-white shrink-0" onClick={() => setMobileMenuOpen(false)}>
              <X className="w-6 h-6" />
            </button>
          )}
        </div>

        {buildings.length > 0 && showLabels && (
          <div className="p-4 border-b border-slate-800 shrink-0">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Location</label>
            <select
              value={currentBuildingId}
              onChange={(e) => setBuilding(e.target.value)}
              className="w-full bg-slate-800 border-none text-sm rounded-lg focus:ring-2 focus:ring-indigo-500 text-slate-200 py-2 px-3"
            >
              {buildings.map(b => (
                <option key={b.id} value={b.id} disabled={!b.isActive}>
                  {b.name}{!b.isActive ? ' (Inactive)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        {buildings.length > 0 && !showLabels && (
          <div className="py-3 border-b border-slate-800 shrink-0 flex justify-center" title="Location switcher (expand sidebar to change)">
            <MapPin className="w-4 h-4 text-slate-500" />
          </div>
        )}

        <nav className="flex-1 px-2 py-4 space-y-6 overflow-y-auto sidebar-scroll">
          {navGroups.map(group => {
            const visibleItems = group.items.filter(item =>
              item.always || !item.perm || can(item.perm as any)
            );
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.title}>
                {showLabels && (
                  <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{group.title}</h3>
                )}
                <div className="space-y-1">
                  {visibleItems.map(item => (
                    <NavLink
                      key={item.name}
                      to={item.path}
                      end={item.path === '/'}
                      onClick={() => setMobileMenuOpen(false)}
                      title={!showLabels ? item.name : undefined}
                      className={({ isActive }) =>
                        cn("flex items-center rounded-lg text-sm font-medium transition-colors",
                          showLabels ? "px-3 py-2" : "px-0 py-2 justify-center",
                          isActive
                            ? "bg-indigo-600 text-white"
                            : "text-slate-400 hover:bg-slate-800 hover:text-white")
                      }
                    >
                      <item.icon className={cn("w-4 h-4 shrink-0", showLabels && "mr-3")} />
                      {showLabels && item.name}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Collapse toggle (desktop only) */}
        {!isMobile && (
          <button
            onClick={() => setCollapsed(c => !c)}
            className="hidden md:flex items-center justify-center py-2.5 border-t border-slate-800 text-slate-500 hover:text-white hover:bg-slate-800 shrink-0"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight className="w-4 h-4" /> : <><ChevronsLeft className="w-4 h-4 mr-2" /><span className="text-xs">Collapse</span></>}
          </button>
        )}

        <div className={cn("p-4 border-t border-slate-800 shrink-0", !showLabels && "px-2")}>
          <div className={cn("flex items-center", showLabels ? "justify-between" : "flex-col gap-2")}>
            {showLabels && (
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{ROLE_LABELS[user?.role || ''] || user?.role}</p>
              </div>
            )}
            <button onClick={logout} className={cn("text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 shrink-0", showLabels ? "ml-2 p-2" : "p-2")} title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden md:flex flex-col bg-slate-900 shrink-0 h-full transition-[width] duration-200",
        collapsed ? "w-[68px]" : "w-64"
      )}>
        {renderSidebar(false)}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 flex flex-col bg-slate-900 shadow-xl z-10">
            {renderSidebar(true)}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <div className="md:hidden h-14 flex items-center px-4 bg-white border-b border-slate-200 shrink-0">
          <button onClick={() => setMobileMenuOpen(true)} className="p-2 text-slate-600 hover:text-slate-900">
            <Menu className="w-5 h-5" />
          </button>
          <span className="ml-3 font-semibold text-slate-900">Motel CMB 53</span>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
