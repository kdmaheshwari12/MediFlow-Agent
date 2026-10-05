'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useFollowUps, useRetryFollowUp } from '@/features/followups/hooks';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Sparkles, Search, MessageSquare, RefreshCw, Send, Lock, AlertTriangle } from 'lucide-react';
import { FollowUpRecord } from '@/types/mediflow';

export default function FollowUpsPage() {
  const { user } = useAuthStore();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUpRecord | null>(null);

  const { data: followUps, isLoading } = useFollowUps({
    doctorId: user?.role === 'doctor' ? user.id : undefined,
    search: searchQuery,
  });

  const retryMutation = useRetryFollowUp();

  React.useEffect(() => {
    if (!user || user.role !== 'doctor') {
      router.replace('/unauthorized');
    }
  }, [user, router]);

  if (!user || user.role !== 'doctor') {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Follow-up Messaging Log"
        subtitle="Doctor-only audit log of automatically generated and delivered patient SMS care follow-ups"
      />

      {/* Filter Bar */}
      <Card className="p-4 rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs">
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by patient name, MRN, or SMS message text..."
            className="pl-10 h-10 text-xs sm:text-sm rounded-xl"
          />
        </div>
      </Card>

      {/* Follow-ups Table */}
      {isLoading ? (
        <Card className="p-8 text-center text-xs text-slate-400">Loading AI follow-up logs...</Card>
      ) : followUps?.length === 0 ? (
        <EmptyState
          title="No Follow-up Logs Found"
          description="Automatically generated AI follow-up SMS logs will appear here after patient checkups."
          icon={Sparkles}
        />
      ) : (
        <Card className="rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase text-[10px] font-bold">
                <tr>
                  <th className="p-4">Patient Name & MRN</th>
                  <th className="p-4">Generated SMS Message</th>
                  <th className="p-4">Follow-up Date</th>
                  <th className="p-4">Channel</th>
                  <th className="p-4">Delivery Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {followUps?.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => setSelectedFollowUp(f)}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <td className="p-4">
                      <span className="font-bold text-slate-900 dark:text-white block">{f.patientName}</span>
                      <span className="font-mono text-[11px] text-slate-400">{f.mrn}</span>
                    </td>
                    <td className="p-4 max-w-sm truncate text-slate-700 dark:text-slate-300 italic">&quot;{f.generatedMessage}&quot;</td>
                    <td className="p-4 font-mono font-semibold text-slate-700 dark:text-slate-300">{f.followUpDate}</td>
                    <td className="p-4">
                      <Badge variant="outline" className="text-[10px] font-bold">{f.channel}</Badge>
                    </td>
                    <td className="p-4">
                      <StatusBadge status={f.status} type="followup" />
                    </td>
                    <td className="p-4 text-right">
                      {f.status === 'FAILED' ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            retryMutation.mutate(f.id);
                          }}
                          className="h-7 text-[11px] font-bold gap-1"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>Retry Send</span>
                        </Button>
                      ) : (
                        <span className="text-teal-600 font-semibold hover:underline">View Log</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedFollowUp} onOpenChange={() => setSelectedFollowUp(null)}>
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            <SheetTitle>AI Follow-up Delivery Audit</SheetTitle>
          </div>
          <SheetDescription>MRN: {selectedFollowUp?.mrn}</SheetDescription>
        </SheetHeader>

        {selectedFollowUp && (
          <div className="space-y-6 mt-6 text-xs">
            <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Patient Info</span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{selectedFollowUp.patientName}</h3>
              <p className="text-slate-500 font-mono">Recipient Phone: {selectedFollowUp.patientPhone}</p>
            </div>

            <div className="p-4 rounded-2xl bg-violet-50/60 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-900 space-y-2">
              <span className="text-[10px] uppercase font-bold text-violet-700 dark:text-violet-300 block">Generated SMS Message</span>
              <p className="text-slate-800 dark:text-slate-200 italic font-sans leading-relaxed">&quot;{selectedFollowUp.generatedMessage}&quot;</p>
            </div>

            <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-950">
              <span>Delivery Status:</span>
              <StatusBadge status={selectedFollowUp.status} type="followup" />
            </div>

            {selectedFollowUp.status === 'FAILED' && (
              <Button
                variant="destructive"
                disabled={retryMutation.isPending}
                onClick={() => retryMutation.mutate(selectedFollowUp.id)}
                className="w-full h-11 text-xs font-bold gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Retry Technical Resend</span>
              </Button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
