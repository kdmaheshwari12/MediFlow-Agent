'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { useUIStore } from '@/stores/ui.store';
import { Sheet, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  LayoutDashboard,
  LogOut,
  LogIn,
  UserPlus,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

export function MobileDrawer() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { mobileDrawerOpen, setMobileDrawerOpen } = useUIStore();

  const handleSignOut = async () => {
    setMobileDrawerOpen(false);
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
    <Sheet open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen} side="left">
      <SheetHeader>
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-teal-600 flex items-center justify-center text-white font-bold">
            <Activity className="h-5 w-5" />
          </div>
          <SheetTitle className="font-heading font-extrabold text-lg">MediFlow SaaS</SheetTitle>
        </div>
        <SheetDescription>Clinic Workspace Navigation</SheetDescription>
      </SheetHeader>

      <div className="flex flex-col h-[calc(100vh-120px)] justify-between mt-6">
        {!user ? (
          <div className="space-y-4 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Account Access</p>
            <div className="space-y-2">
              <Link
                href="/login"
                onClick={() => setMobileDrawerOpen(false)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-sm"
              >
                <div className="flex items-center gap-2">
                  <LogIn className="h-4 w-4 text-teal-600" />
                  <span>Login</span>
                </div>
                <ChevronRight className="h-4 w-4 opacity-50" />
              </Link>

              <Link
                href="/signup"
                onClick={() => setMobileDrawerOpen(false)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-teal-600 text-white font-bold text-sm shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  <span>Create Account</span>
                </div>
                <ChevronRight className="h-4 w-4 opacity-70" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 space-y-1">
              <p className="text-xs font-bold text-slate-900 dark:text-white">{user.fullName}</p>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 truncate">{user.email}</span>
                <Badge
                  variant={user.role === 'doctor' ? 'default' : 'secondary'}
                  className="text-[10px] uppercase font-bold"
                >
                  {user.role}
                </Badge>
              </div>
            </div>

            <Link
              href={userDashboard}
              onClick={() => setMobileDrawerOpen(false)}
              className="flex items-center justify-between py-3 px-3 rounded-xl bg-teal-600 text-white text-sm font-semibold"
            >
              <div className="flex items-center gap-3">
                <LayoutDashboard className="h-4 w-4" />
                <span>My Dashboard</span>
              </div>
              <ChevronRight className="h-4 w-4 opacity-70" />
            </Link>
          </div>
        )}

        {user && (
          <Button
            onClick={handleSignOut}
            variant="destructive"
            className="w-full justify-center gap-2 h-12 text-sm font-bold rounded-xl cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </Button>
        )}
      </div>
    </Sheet>
  );
}
