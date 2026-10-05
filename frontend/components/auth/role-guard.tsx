'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { UserRole } from '@/types/mediflow';
import { Skeleton } from '@/components/ui/skeleton';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requireAuth?: boolean;
}

export function RoleGuard({ children, allowedRoles, requireAuth = true }: RoleGuardProps) {
  const { user, loading, refreshSession } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handlePageShow = async (event: PageTransitionEvent) => {
      if (event.persisted) {
        await refreshSession();
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [refreshSession]);

  useEffect(() => {
    if (loading) return;

    if (requireAuth) {
      if (!user) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        router.replace('/unauthorized');
        return;
      }
    }
  }, [user, loading, requireAuth, allowedRoles, pathname, router]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 p-8 flex flex-col items-center justify-center space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-teal-600/20 border border-teal-500/40 flex items-center justify-center animate-pulse">
          <div className="h-6 w-6 rounded-full bg-teal-600 animate-ping" />
        </div>
        <Skeleton className="h-4 w-48 rounded-lg" />
        <p className="text-xs font-semibold text-slate-400">Verifying session...</p>
      </div>
    );
  }

  if (requireAuth) {
    if (!user) return null;
    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      return null;
    }
  }

  return <>{children}</>;
}
