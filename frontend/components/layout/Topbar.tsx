'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { useUIStore } from '@/stores/ui.store';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sun,
  Moon,
  Menu,
  User as UserIcon,
  LogOut,
  ShieldCheck,
  Activity,
  LayoutDashboard,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';

export function Topbar() {
  const { user, signOut } = useAuth();
  const { setMobileDrawerOpen } = useUIStore();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const handleSignOut = async () => {
    setUserDropdownOpen(false);
    await signOut();
    toast.success('Signed out successfully.');
    router.replace('/login');
  };

  const userDashboard = user
    ? user.role === 'doctor'
      ? '/doctor/dashboard'
      : '/receptionist/dashboard'
    : '/login';

  return (
    <header className="h-16 border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-20 px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Left Topbar Brand & Drawer Trigger */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className="lg:hidden h-10 w-10 rounded-xl flex items-center justify-center border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 cursor-pointer"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link href="/" className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold shadow-xs">
            <Activity className="h-5 w-5" />
          </div>
          <span className="font-heading font-extrabold text-base tracking-tight text-slate-900 dark:text-white hidden sm:inline-block">
            MediFlow
          </span>
        </Link>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        {/* Theme Toggle */}
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle dark mode"
          className="h-9 w-9 rounded-xl flex items-center justify-center border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-teal-600" />}
        </button>

        {/* Signed Out State: Login and Sign Up buttons */}
        {!user ? (
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="h-9 text-xs font-bold gap-1.5 rounded-xl">
                <LogIn className="h-3.5 w-3.5" />
                <span>Login</span>
              </Button>
            </Link>
            <Link href="/signup">
              <Button variant="gradient" size="sm" className="h-9 text-xs font-bold gap-1.5 rounded-xl shadow-xs">
                <UserPlus className="h-3.5 w-3.5" />
                <span>Sign Up</span>
              </Button>
            </Link>
          </div>
        ) : (
          /* Signed In State: Name dropdown with Dashboard and Sign Out */
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2.5 p-1 sm:pr-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <div className="h-8 w-8 rounded-lg bg-teal-600 text-white font-bold flex items-center justify-center text-xs">
                {user.fullName.charAt(0)}
              </div>
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[120px]">
                  {user.fullName}
                </span>
                <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold uppercase">
                  {user.role}
                </span>
              </div>
            </button>

            {userDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserDropdownOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900 z-50 animate-in fade-in-50 duration-150">
                  <div className="p-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{user.fullName}</p>
                    <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                    <div className="mt-1.5">
                      <Badge
                        variant={user.role === 'doctor' ? 'default' : 'secondary'}
                        className="text-[10px] uppercase font-bold"
                      >
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        {user.role === 'doctor' ? 'Doctor' : 'Receptionist'}
                      </Badge>
                    </div>
                  </div>

                  <Link
                    href={userDashboard}
                    onClick={() => setUserDropdownOpen(false)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    <LayoutDashboard className="h-4 w-4 text-teal-600" />
                    <span>Dashboard</span>
                  </Link>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer mt-1"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
