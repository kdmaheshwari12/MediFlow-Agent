'use client';

import React, { useState } from 'react';
import { useDoctorMessages, useVisitDetails, useRetrySms } from '@/features/messages/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  MessageSquare,
  Search,
  Calendar,
  Filter,
  Eye,
  EyeOff,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  X,
  User,
  Phone,
  FileText,
  Send,
  Loader2,
} from 'lucide-react';

function maskPhone(phone: string): string {
  if (!phone) return 'N/A';
  const clean = phone.trim();
  if (clean.length <= 6) return '******';
  const start = clean.slice(0, 5);
  const end = clean.slice(-2);
  return `${start}*****${end}`;
}

export default function DoctorMessagesPage() {
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [revealedPhones, setRevealedPhones] = useState<Record<string, boolean>>({});

  const { data, isLoading, isError, refetch } = useDoctorMessages({
    date: dateFilter || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    q: searchQuery || undefined,
  });

  const { data: visitDetail, isLoading: isLoadingVisit } = useVisitDetails(selectedVisitId);
  const retryMutation = useRetrySms();

  const togglePhoneReveal = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRevealedPhones((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
      case 'delivered':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            <span className="capitalize">{status}</span>
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-semibold flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            <span>Failed</span>
          </Badge>
        );
      case 'queued':
      default:
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-semibold flex items-center gap-1">
            <Clock className="h-3 w-3 animate-pulse" />
            <span>Queued</span>
          </Badge>
        );
    }
  };

  const messagesList = data?.messages || (data as any)?.data || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-900 dark:text-white flex items-center gap-2.5">
            <MessageSquare className="h-6 w-6 text-teal-600 dark:text-teal-400" />
            <span>Messages History</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Track AI prescription drafts and patient SMS dispatch logs in real time.
          </p>
        </div>
        <Button
          onClick={() => refetch()}
          variant="outline"
          size="sm"
          className="gap-2 cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Filters Bar */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search patient name, MRN, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            {/* Date Filter */}
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="all">All Statuses</option>
                <option value="sent">Sent / Delivered</option>
                <option value="queued">Queued</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Messages List / Table */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-sm font-bold flex items-center justify-between">
            <span>Sent & Drafted Messages ({data?.pagination.total || 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center space-y-3">
              <Loader2 className="h-6 w-6 animate-spin text-teal-600 mx-auto" />
              <p className="text-xs text-slate-500">Loading message log records...</p>
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-rose-500 text-xs font-medium">
              Failed to load messages history. Please try again.
            </div>
          ) : messagesList.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                <MessageSquare className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No messages sent yet</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Completed consultation SMS alerts and AI prescription dispatches will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {messagesList.map((msg: any) => {
                const visitId = msg.visit_id || msg.visitId;
                const isPhoneRevealed = !!revealedPhones[visitId];
                const rawPhone = msg.patient_phone || msg.patientPhone || msg.toPhone || '';
                const displayPhone = isPhoneRevealed ? rawPhone : maskPhone(rawPhone);

                const vId = msg.visit_id || msg.visitId || msg.id;
                const pName = msg.patient_name || msg.patientName || 'Patient';
                const pMrn = msg.patient_mrn || msg.patientMrn || '';
                const preview = msg.preview || msg.previewText || msg.messageBody || '';

                return (
                  <div
                    key={vId}
                    onClick={() => setSelectedVisitId(vId)}
                    className="p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    {/* Left: Patient info & preview */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {pName}
                        </span>
                        <Badge variant="outline" className="text-[10px] font-mono bg-slate-50 dark:bg-slate-950">
                          {pMrn}
                        </Badge>
                        <button
                          type="button"
                          onClick={(e) => togglePhoneReveal(vId, e)}
                          className="text-[11px] text-teal-600 dark:text-teal-400 font-mono hover:underline flex items-center gap-1 cursor-pointer"
                          title="Tap to toggle phone reveal"
                        >
                          <Phone className="h-3 w-3" />
                          <span>{displayPhone}</span>
                          {isPhoneRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 italic bg-slate-50 dark:bg-slate-950 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                        "{preview}"
                      </p>
                    </div>

                    {/* Right: Status badge & timestamp */}
                    <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                      <div className="text-right">
                        <div>{getStatusBadge(msg.status)}</div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {new Date(msg.sent_at || msg.sentAt || msg.created_at || msg.createdAt || Date.now()).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400 hidden md:block" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message Detail Drawer */}
      {selectedVisitId && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={() => setSelectedVisitId(null)}
          />
          <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 h-full shadow-2xl overflow-y-auto border-l border-slate-200 dark:border-slate-800 z-10 flex flex-col">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md z-20">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-teal-600" />
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white font-heading">
                  Visit & Message Log Detail
                </h3>
              </div>
              <button
                onClick={() => setSelectedVisitId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="p-6 flex-1 space-y-6">
              {isLoadingVisit || !visitDetail ? (
                <div className="p-8 text-center space-y-3">
                  <Loader2 className="h-6 w-6 animate-spin text-teal-600 mx-auto" />
                  <p className="text-xs text-slate-500">Fetching visit details & timeline...</p>
                </div>
              ) : (
                <>
                  {/* Patient Header Card */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white space-y-2 shadow-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-teal-400" />
                        <span className="font-bold text-base">{visitDetail.patient_name || 'Patient'}</span>
                      </div>
                      <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30 text-xs">
                        {visitDetail.patient_mrn}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-300 flex items-center gap-4 flex-wrap pt-1">
                      {visitDetail.patient_age && <span>Age: {visitDetail.patient_age} yrs</span>}
                      {visitDetail.patient_gender && <span className="capitalize">Gender: {visitDetail.patient_gender}</span>}
                      <span className="font-mono text-teal-300">
                        Phone: {visitDetail.patient_phone || 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Prescription Section */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-teal-600" />
                      <span>Full Doctor Prescription</span>
                    </h4>
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {visitDetail.prescription || 'No prescription recorded.'}
                    </div>
                  </div>

                  {/* Follow-Up (if any) */}
                  {visitDetail.followup_text && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-amber-500" />
                        <span>Follow-Up Advice ({visitDetail.followup_period || 'N/A'})</span>
                      </h4>
                      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200">
                        {visitDetail.followup_text}
                      </div>
                    </div>
                  )}

                  {/* Exact Message Sent */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Send className="h-4 w-4 text-teal-600" />
                      <span>Exact SMS Sent to Patient</span>
                    </h4>
                    <div className="p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {visitDetail.draft_message || 'No draft message stored.'}
                    </div>
                  </div>

                  {/* SMS Delivery Attempts Timeline */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-slate-400" />
                        <span>SMS Send Attempts Timeline</span>
                      </h4>
                      {visitDetail.latest_sms_status === 'failed' && (
                        <Button
                          size="sm"
                          onClick={() => retryMutation.mutate(visitDetail.id)}
                          disabled={retryMutation.isPending}
                          className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs gap-1.5 cursor-pointer"
                        >
                          {retryMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          <span>Retry Send</span>
                        </Button>
                      )}
                    </div>

                    {visitDetail.sms_attempts.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No send attempts logged yet.</p>
                    ) : (
                      <div className="space-y-3 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                        {visitDetail.sms_attempts.map((attempt) => (
                          <div key={attempt.id} className="relative pl-7 text-xs space-y-1">
                            <div className="absolute left-1.5 top-1 h-3.5 w-3.5 rounded-full bg-slate-900 border-2 border-teal-500" />
                            <div className="flex items-center justify-between font-semibold">
                              <span className="text-slate-900 dark:text-white">
                                Attempt #{attempt.attempt_number} ({attempt.provider})
                              </span>
                              {getStatusBadge(attempt.status)}
                            </div>
                            <p className="text-[10px] text-slate-400">
                              {new Date(attempt.sent_at || attempt.created_at).toLocaleString()}
                            </p>
                            {attempt.error_message && (
                              <p className="text-[11px] text-rose-500 font-mono bg-rose-50 dark:bg-rose-950/40 p-1.5 rounded border border-rose-200 dark:border-rose-900">
                                {attempt.error_message}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
