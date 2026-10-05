'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  userMessage: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Unable to Load Data',
  userMessage,
  onRetry,
}: ErrorStateProps) {
  return (
    <Card className="p-8 text-center rounded-3xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 space-y-4">
      <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400 mx-auto">
        <AlertCircle className="h-6 w-6" />
      </div>
      <div className="space-y-1 max-w-sm mx-auto">
        <h3 className="text-base font-bold text-red-900 dark:text-red-200 font-heading">{title}</h3>
        <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
          {userMessage}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2 border-red-300 text-red-800 hover:bg-red-100 dark:border-red-800 dark:text-red-200">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Try Again</span>
        </Button>
      )}
    </Card>
  );
}
