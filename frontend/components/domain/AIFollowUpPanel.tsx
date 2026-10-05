'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useFollowUpStatus, useRetryFollowUp } from '@/features/followups/hooks';
import { Sparkles, Send, CheckCircle2, MessageSquare, AlertTriangle, RefreshCw, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface AIFollowUpPanelProps {
  followUpId: string;
}

export function AIFollowUpPanel({ followUpId }: AIFollowUpPanelProps) {
  const { data: followUp, isLoading } = useFollowUpStatus(followUpId);
  const retryMutation = useRetryFollowUp();

  const [stepIndex, setStepIndex] = useState(0);

  // Simulate pipeline step animation (Record Saved -> AI Analyzing -> Generating -> Sending -> Delivered)
  useEffect(() => {
    const timer1 = setTimeout(() => setStepIndex(1), 1000);
    const timer2 = setTimeout(() => setStepIndex(2), 2200);
    const timer3 = setTimeout(() => setStepIndex(3), 3400);
    const timer4 = setTimeout(() => setStepIndex(4), 4500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [followUpId]);

  if (isLoading || !followUp) {
    return (
      <Card className="p-6 rounded-3xl border border-violet-200 dark:border-violet-900/60 bg-gradient-to-br from-violet-50/50 via-white to-violet-50/20 dark:from-violet-950/20 dark:via-slate-900 dark:to-slate-900 space-y-4">
        <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300 font-bold text-sm">
          <Sparkles className="h-4 w-4 animate-spin text-violet-600" />
          <span>Initializing AI Follow-up Pipeline...</span>
        </div>
      </Card>
    );
  }

  const maskPhone = (phone: string) => {
    return phone.replace(/(\+\d{2}\s\d{1})\d{2}\s\d{3}(\d{4})/, '$1** *** $2');
  };

  const steps = [
    { label: 'Record Saved', done: stepIndex >= 1 },
    { label: 'AI Analyzing Visit Notes', done: stepIndex >= 2 },
    { label: 'Message Generated', done: stepIndex >= 3 },
    { label: 'Automatically Sent via SMS', done: stepIndex >= 4 },
  ];

  return (
    <Card className="p-6 rounded-3xl border border-violet-200 dark:border-violet-900/60 bg-gradient-to-br from-violet-50/60 via-white to-violet-50/30 dark:from-violet-950/30 dark:via-slate-900 dark:to-slate-900 shadow-md space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-violet-100 dark:border-violet-900/40">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-violet-600 text-white flex items-center justify-center font-bold shadow-xs">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-heading flex items-center gap-2">
              <span>Automatic AI Follow-up Pipeline</span>
              <Badge variant="outline" className="text-[10px] bg-violet-100 dark:bg-violet-950 text-violet-800 dark:text-violet-200 border-violet-300">
                Fully Automated
              </Badge>
            </h3>
            <p className="text-[11px] text-slate-500">Sent to patient without requiring doctor approval</p>
          </div>
        </div>

        <StatusBadge status={followUp.status} type="followup" />
      </div>

      {/* Step-by-Step Progress Pipeline */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {steps.map((s, idx) => (
          <div
            key={idx}
            className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all ${
              s.done
                ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-semibold'
                : 'bg-slate-100/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-400'
            }`}
          >
            {s.done ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            ) : (
              <div className="h-3.5 w-3.5 rounded-full border border-slate-300 dark:border-slate-700 shrink-0" />
            )}
            <span className="text-[11px] leading-tight">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Message Output Card */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-950 border border-violet-200/80 dark:border-violet-900/60 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-2">
          <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
            <MessageSquare className="h-3.5 w-3.5 text-violet-600" />
            <span>Generated Patient SMS</span>
          </span>
          <span className="text-[11px] font-mono">Recipient: {maskPhone(followUp.patientPhone)}</span>
        </div>

        <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-sans italic bg-violet-50/30 dark:bg-violet-950/10 p-3 rounded-xl border border-violet-100 dark:border-violet-900/40">
          &quot;{followUp.generatedMessage}&quot;
        </p>

        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
          <span className="flex items-center gap-1">
            <Lock className="h-3 w-3 text-slate-400" />
            <span>Channel: {followUp.channel}</span>
          </span>
          <span>Scheduled Follow-up Date: <strong>{followUp.followUpDate}</strong></span>
        </div>
      </div>

      {/* Failure Retry Action */}
      {followUp.status === 'FAILED' && (
        <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-center justify-between text-xs text-red-800 dark:text-red-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span>The message could not be delivered.</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={retryMutation.isPending}
            onClick={() => retryMutation.mutate(followUp.id)}
            className="h-8 text-xs gap-1.5 border-red-300 text-red-800 hover:bg-red-100"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${retryMutation.isPending ? 'animate-spin' : ''}`} />
            <span>Retry Sending</span>
          </Button>
        </div>
      )}
    </Card>
  );
}
