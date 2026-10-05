'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  sublabel?: string;
  icon: LucideIcon;
  iconBgColor?: string;
  iconTextColor?: string;
  loading?: boolean;
}

export function StatCard({
  title,
  value,
  sublabel,
  icon: Icon,
  iconBgColor = 'bg-teal-50 dark:bg-teal-950/60',
  iconTextColor = 'text-teal-600 dark:text-teal-400',
  loading = false,
}: StatCardProps) {
  if (loading) {
    return (
      <Card className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-3 w-36" />
      </Card>
    );
  }

  return (
    <Card className="p-5 rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-slate-300 dark:hover:border-slate-700">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {title}
        </span>
        <div className={`h-10 w-10 rounded-xl ${iconBgColor} ${iconTextColor} flex items-center justify-center shrink-0`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-2 space-y-1">
        <div className="text-2xl sm:text-3xl font-heading font-extrabold text-slate-900 dark:text-white tracking-tight font-mono">
          {value}
        </div>
        {sublabel && (
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {sublabel}
          </p>
        )}
      </div>
    </Card>
  );
}
