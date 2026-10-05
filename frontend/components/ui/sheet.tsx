'use client';

import * as React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'left' | 'right';
  children: React.ReactNode;
}

export function Sheet({ open, onOpenChange, side = 'right', children }: SheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={() => onOpenChange?.(false)}
      />
      <div
        className={cn(
          'fixed inset-y-0 z-50 w-full max-w-sm bg-white dark:bg-slate-900 p-6 shadow-2xl transition-transform duration-300 border-slate-200 dark:border-slate-800',
          side === 'right' ? 'right-0 border-l animate-in slide-in-from-right' : 'left-0 border-r animate-in slide-in-from-left'
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-1 text-left border-b border-slate-100 dark:border-slate-800 pb-4', className)} {...props} />;
}

export function SheetTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-bold font-heading text-slate-900 dark:text-white', className)} {...props} />;
}

export function SheetDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-slate-500 dark:text-slate-400', className)} {...props} />;
}
