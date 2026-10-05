'use client';

import React, { useEffect, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { redirectForSession } from '@/services/auth.service';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileDrawer } from './MobileDrawer';
import { Skeleton } from '@/components/ui/skeleton';

import { useSupabaseRealtime } from '@/hooks/use-realtime';

function AppShellContent({ children }: { children: React.ReactNode }) {
  useSupabaseRealtime();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get('next');

  const { user, loading, initialized, initSession } = useAuthStore();
  const { sidebarCollapsed } = useUIStore();

  useEffect(() => {
    initSession();
  }, [initSession]);

  // Back button cache revalidation & session loss listener
  useEffect(() => {
    const handlePageShow = async (event: PageTransitionEvent) => {
      if (event.persisted) {
        const session = await initSession();
        const target = redirectForSession(session, pathname, nextParam);
        if (target !== pathname) {
          router.replace(target);
        }
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [initSession, pathname, nextParam, router]);

  // Route redirection guard
  useEffect(() => {
    if (!loading && initialized) {
      const target = redirectForSession(user, pathname, nextParam);
      if (target !== pathname) {
        router.replace(target);
      }
    }
  }, [user, loading, initialized, pathname, nextParam, router]);

  // Show loading skeleton while session is rehydrating
  if (loading || !initialized) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8 flex flex-col items-center justify-center space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-teal-600/20 border border-teal-500/40 flex items-center justify-center animate-pulse">
          <div className="h-6 w-6 rounded-full bg-teal-600 animate-ping" />
        </div>
        <Skeleton className="h-4 w-48 rounded-lg" />
        <p className="text-sm font-medium text-slate-400">Verifying secure clinical session...</p>
      </div>
    );
  }

  if (!user || user.onboardingStatus !== 'complete') {
    return <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">{children}</main>;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Role-Aware Sidebar */}
      <Sidebar />

      {/* Mobile Menu Drawer */}
      <MobileDrawer />

      {/* Main Workspace Layout */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
          sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
        }`}
      >
        <Topbar />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-8 flex flex-col items-center justify-center space-y-4">
        <Skeleton className="h-4 w-48 rounded-lg" />
      </div>
    }>
      <AppShellContent>{children}</AppShellContent>
    </Suspense>
  );
}
