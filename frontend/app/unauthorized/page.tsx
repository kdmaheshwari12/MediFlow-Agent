'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ShieldAlert, ArrowLeft, LayoutDashboard } from 'lucide-react';

export default function UnauthorizedPage() {
  const { user } = useAuth();

  const userDashboard = user
    ? user.role === 'doctor'
      ? '/doctor/dashboard'
      : '/receptionist/dashboard'
    : '/login';

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 p-6 flex items-center justify-center text-slate-900 dark:text-slate-100">
      <Card className="max-w-md w-full p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-6 shadow-xl">
        <div className="h-16 w-16 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
          <ShieldAlert className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-heading font-extrabold text-slate-900 dark:text-white">
            Access Restricted
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            You do not have permission to access this page. This area is reserved for a different clinic role.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href={userDashboard} className="w-full sm:w-auto">
            <Button variant="gradient" className="w-full gap-2 h-11 px-6 font-bold rounded-xl cursor-pointer">
              <LayoutDashboard className="h-4 w-4" />
              <span>Go to My Dashboard</span>
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
