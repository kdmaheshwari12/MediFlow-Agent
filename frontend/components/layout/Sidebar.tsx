'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { useUIStore } from '@/stores/ui.store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  LayoutDashboard,
  Calendar,
  Clock,
  PlusCircle,
  Users,
  Pill,
  Sparkles,
  User,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  if (!user) return null;

  const isDoctor = user.role === 'doctor';
  const dashboardHref = isDoctor ? '/doctor/dashboard' : '/receptionist/dashboard';

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully.');
    router.replace('/login');
  };

  interface NavItem {
    name: string;
    href: string;
    icon: React.ElementType;
    isCta?: boolean;
  }

  const doctorNav: NavItem[] = [
    { name: 'Dashboard', href: '/doctor/dashboard', icon: LayoutDashboard },
    { name: 'Appointments', href: '/appointments', icon: Calendar },
    { name: 'Availability', href: '/availability', icon: Clock },
    { name: 'Patients', href: '/patients', icon: Users },
    { name: 'Prescriptions', href: '/prescriptions', icon: Pill },
    { name: 'Messages', href: '/messages', icon: MessageSquare },
    { name: 'Follow-ups', href: '/follow-ups', icon: Sparkles },
    { name: 'Profile', href: '/profile', icon: User },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const receptionistNav: NavItem[] = [
    { name: 'Dashboard', href: '/receptionist/dashboard', icon: LayoutDashboard },
    { name: 'Appointments', href: '/appointments', icon: Calendar },
    { name: 'New Appointment', href: '/appointments/new', icon: PlusCircle, isCta: true },
    { name: 'Patients', href: '/patients', icon: Users },
    { name: 'Doctors', href: '/doctors', icon: Stethoscope },
    { name: 'Profile', href: '/profile', icon: User },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const navItems = isDoctor ? doctorNav : receptionistNav;

  return (
    <aside
      className={`hidden lg:flex flex-col fixed top-0 left-0 bottom-0 z-30 bg-slate-900 text-slate-100 transition-all duration-300 border-r border-slate-800 ${
        sidebarCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
        <Link href={dashboardHref} className="flex items-center gap-3 group overflow-hidden">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-teal-500 via-emerald-500 to-teal-400 flex items-center justify-center text-white font-bold shrink-0 shadow-md">
            <Activity className="h-5 w-5" />
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col truncate">
              <span className="font-heading font-extrabold text-lg tracking-tight text-white">
                MediFlow
              </span>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={toggleSidebar}
          className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Role Badge */}
      {!sidebarCollapsed && (
        <div className="p-4 border-b border-slate-800/60 bg-slate-950/40">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Logged in as</span>
            <Badge
              variant={isDoctor ? 'default' : 'secondary'}
              className={`text-[10px] font-bold uppercase tracking-wider ${
                isDoctor ? 'bg-teal-600 text-white' : 'bg-slate-700 text-slate-200'
              }`}
            >
              {isDoctor ? 'Doctor' : 'Receptionist'}
            </Badge>
          </div>
          <p className="text-sm font-bold text-white truncate mt-1">{user.fullName}</p>
        </div>
      )}

      {/* Navigation Items */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          if (item.isCta && !sidebarCollapsed) {
            return (
              <div key={item.name} className="pt-2 pb-2">
                <Link href={item.href}>
                  <Button variant="gradient" className="w-full justify-start gap-2.5 h-11 text-xs font-bold shadow-md">
                    <PlusCircle className="h-4 w-4" />
                    <span>Create Appointment</span>
                  </Button>
                </Link>
              </div>
            );
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
              title={sidebarCollapsed ? item.name : undefined}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              {!sidebarCollapsed && <span className="truncate">{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Logout Footer */}
      <div className="p-3 border-t border-slate-800 shrink-0">
        <button
          type="button"
          onClick={handleSignOut}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors cursor-pointer ${
            sidebarCollapsed ? 'justify-center px-0' : ''
          }`}
          title={sidebarCollapsed ? 'Sign Out' : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
