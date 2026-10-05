'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface MrnBadgeProps {
  mrn: string | undefined;
  className?: string;
}

export function MrnBadge({ mrn, className = '' }: MrnBadgeProps) {
  const [copied, setCopied] = useState(false);

  if (!mrn) {
    return (
      <Badge variant="outline" className={`bg-slate-50 text-slate-400 border-slate-200 ${className}`}>
        Not assigned
      </Badge>
    );
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(mrn);
      setCopied(true);
      toast.success('MRN copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <Badge variant="outline" className="font-mono text-sm font-bold bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border-teal-300 dark:border-teal-700 whitespace-nowrap overflow-hidden text-ellipsis max-w-full block">
        {mrn}
      </Badge>
      <button
        onClick={handleCopy}
        className="p-1.5 rounded-md text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500"
        title="Copy MRN"
        aria-label="Copy Medical Record Number"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
