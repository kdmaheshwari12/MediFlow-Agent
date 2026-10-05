'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { RoleGuard } from '@/components/auth/role-guard';
import { useAppointments, useDoctorAvailabilityDates } from '@/features/appointments/hooks';
import { useFollowUps } from '@/features/followups/hooks';
import { StatCard } from '@/components/common/StatCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Calendar,
  Clock,
  Sparkles,
  Stethoscope,
  CheckCircle2,
  ArrowRight,
  LogOut,
  Activity,
  FileText,
  Briefcase,
  Award,
  UserCheck,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

function DoctorDashboardContent() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const todayStr = new Date().toISOString().split('T')[0];

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully.');
    window.location.href = '/login';
  };

  const { data: appointments, isLoading, isError, refetch } = useAppointments({
    doctorId: user?.id,
    date: todayStr,
  });

  const { data: followUps } = useFollowUps({ doctorId: user?.id });

  // Availability schedule check
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextMonthStr = nextMonth.toISOString().split('T')[0];
  const { data: availability } = useDoctorAvailabilityDates(user?.id, todayStr, nextMonthStr);

  const totalAppts = appointments?.length || 0;
  
  // Section categorization
  const inProgressAppts = (appointments || []).filter(a => a.status === 'IN_PROGRESS' || a.status === 'in_progress');
  
  const waitingAppts = (appointments || [])
    .filter(a => a.status === 'WAITING' || a.status === 'waiting')
    .sort((a, b) => (a.timeSlot || '').localeCompare(b.timeSlot || ''));

  const upcomingAppts = (appointments || []).filter(a => a.status === 'SCHEDULED' || a.status === 'scheduled');
  
  const completedApptsList = (appointments || []).filter(a => a.status === 'COMPLETED' || a.status === 'completed' || a.status === 'DONE' || a.status === 'done');

  const completedCount = completedApptsList.length;
  const waitingCount = waitingAppts.length;
  const inProgressCount = inProgressAppts.length;
  const remainingCount = totalAppts - completedCount;
  const dailyLimit = user?.onboardingData?.daily_patient_limit || 30;

  const pendingFollowUpsCount = followUps?.filter((f) => f.status === 'PENDING' || f.status === 'GENERATING').length || 0;
  const progressPercent = totalAppts > 0 ? Math.round((completedCount / totalAppts) * 100) : 0;

  if (!user) return null;

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Unconfigured Schedule Alert */}
        {availability && !availability.scheduleConfigured && (
          <div className="bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900/60 p-4 rounded-2xl flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-amber-100 dark:bg-amber-900/60 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-300 shrink-0">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-amber-900 dark:text-amber-200 text-sm">Action Required: Set Shift Hours</h3>
                <p className="text-xs text-amber-700 dark:text-amber-400">Configure your weekly visiting schedule so receptionist staff can book appointments.</p>
              </div>
            </div>
            <Link href="/onboarding/doctor">
              <Button variant="outline" className="bg-white dark:bg-slate-900 border-amber-200 text-amber-800 dark:text-amber-300 hover:bg-amber-50 rounded-xl text-xs h-9 px-4 font-bold cursor-pointer">
                Configure Now
              </Button>
            </Link>
          </div>
        )}

        {/* Top Header Card */}
        <Card className="p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center font-bold shadow-md shrink-0">
              <Stethoscope className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-slate-900 dark:text-white">
                  Dr. {user.fullName}
                </h1>
                <Badge className="bg-teal-600 text-white font-bold uppercase text-xs">
                  Physician
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 flex items-center gap-3 flex-wrap">
                <span>{format(new Date(), 'EEEE, MMMM d, yyyy')}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5 text-teal-600" /> {user.specialization || 'General Physician'}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Award className="h-3.5 w-3.5 text-teal-600" /> {user.licenseNumber || 'DOC-8890'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <Link href="/onboarding/doctor" className="flex-1 md:flex-initial">
              <Button variant="outline" className="w-full gap-2 font-bold h-11 px-4 rounded-xl border-teal-500 text-teal-700 dark:text-teal-300 cursor-pointer">
                <Clock className="h-4 w-4" />
                <span>Edit Availability</span>
              </Button>
            </Link>
            <Button
              onClick={handleSignOut}
              variant="outline"
              className="rounded-xl border-slate-200 dark:border-slate-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 gap-2 h-11 px-4 font-bold cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </Card>

        {/* 6 Category Summary Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="p-4 rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Assigned Today</span>
            <span className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">{totalAppts}</span>
            <span className="text-[10px] text-slate-500 block">Limit: {dailyLimit}</span>
          </Card>

          <Card className="p-4 rounded-2xl border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 space-y-1">
            <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 block">Waiting Now</span>
            <span className="text-2xl font-extrabold font-mono text-amber-700 dark:text-amber-300">{waitingCount}</span>
            <span className="text-[10px] text-amber-600 block">Sorted by slot</span>
          </Card>

          <Card className="p-4 rounded-2xl border border-violet-200 bg-violet-50/50 dark:border-violet-900/40 dark:bg-violet-950/20 space-y-1">
            <span className="text-[10px] uppercase font-bold text-violet-600 dark:text-violet-400 block">In Progress</span>
            <span className="text-2xl font-extrabold font-mono text-violet-700 dark:text-violet-300">{inProgressCount}</span>
            <span className="text-[10px] text-violet-600 block">Active checkup</span>
          </Card>

          <Card className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-1">
            <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Completed</span>
            <span className="text-2xl font-extrabold font-mono text-emerald-700 dark:text-emerald-300">{completedCount}</span>
            <span className="text-[10px] text-emerald-600 block">Rx & SMS done</span>
          </Card>

          <Card className="p-4 rounded-2xl border border-blue-200 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-950/20 space-y-1">
            <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 block">Remaining</span>
            <span className="text-2xl font-extrabold font-mono text-blue-700 dark:text-blue-300">{remainingCount}</span>
            <span className="text-[10px] text-blue-600 block">Left today</span>
          </Card>

          <Card className="p-4 rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Follow-ups</span>
            <span className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">{pendingFollowUpsCount}</span>
            <span className="text-[10px] text-slate-500 block">Pending AI</span>
          </Card>
        </div>

        {/* Daily Progress Meter */}
        <Card className="p-5 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-700 dark:text-slate-300">
              Daily Consultation Progress: <strong>{completedCount} of {totalAppts} Patients Completed</strong>
            </span>
            <span className="text-teal-600 dark:text-teal-400 font-bold font-mono">{progressPercent}% Completed</span>
          </div>
          <Progress value={progressPercent} className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full" />
        </Card>

        {/* Categorized Sections */}
        <div className="space-y-6">
          {/* SECTION 1: IN PROGRESS */}
          {inProgressAppts.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-base font-bold font-heading text-violet-700 dark:text-violet-300 flex items-center gap-2">
                <Activity className="h-5 w-5 animate-spin text-violet-600" />
                <span>Active Consultation (In Progress)</span>
              </h2>

              {inProgressAppts.map((apt) => (
                <Card key={apt.id} className="p-5 rounded-3xl border-2 border-violet-500/60 bg-gradient-to-r from-violet-50/50 via-white to-white dark:from-violet-950/30 dark:via-slate-900 dark:to-slate-900 shadow-md ring-2 ring-violet-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-violet-700 dark:text-violet-300">{apt.timeSlot}</span>
                      <span className="text-slate-300">•</span>
                      <span className="font-mono text-xs font-bold text-slate-500">{apt.mrn}</span>
                      <StatusBadge status="IN_PROGRESS" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white font-heading">{apt.patientName}</h3>
                    <p className="text-xs text-slate-500 line-clamp-1">Chief Complaint: &quot;{apt.reason}&quot;</p>
                  </div>
                  <Button
                    variant="gradient"
                    onClick={() => router.push(`/checkup/${apt.id}`)}
                    className="font-bold gap-2 rounded-xl shadow-md cursor-pointer"
                  >
                    <Stethoscope className="h-4 w-4" />
                    <span>Resume Active Checkup</span>
                  </Button>
                </Card>
              ))}
            </div>
          )}

          {/* SECTION 2: WAITING NOW */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold font-heading text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-600" />
                <span>Waiting Queue (T-30m or Checked In)</span>
                <Badge variant="secondary" className="bg-amber-100 text-amber-800 font-mono text-xs">{waitingCount}</Badge>
              </h2>
            </div>

            {waitingAppts.length === 0 ? (
              <Card className="p-6 text-center text-xs text-slate-400 border border-slate-200/80 dark:border-slate-800 rounded-2xl">
                No patients currently waiting in the lobby.
              </Card>
            ) : (
              <div className="space-y-3">
                {waitingAppts.map((apt) => (
                  <Card key={apt.id} className="p-4 sm:p-5 rounded-2xl border border-amber-200/80 dark:border-amber-900/40 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-300">{apt.timeSlot}</span>
                        <span className="text-slate-300">•</span>
                        <span className="font-mono text-xs font-bold text-slate-500">{apt.mrn}</span>
                        <StatusBadge status="WAITING" />
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white font-heading">{apt.patientName}</h3>
                      <p className="text-xs text-slate-500 line-clamp-1">Reason: &quot;{apt.reason}&quot;</p>
                    </div>

                    <Button
                      variant="gradient"
                      size="sm"
                      onClick={() => router.push(`/checkup/${apt.id}`)}
                      className="font-bold text-xs gap-1.5 rounded-xl cursor-pointer shadow-sm"
                    >
                      <Stethoscope className="h-4 w-4" />
                      <span>Start Checkup</span>
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 3: UPCOMING TODAY */}
          <div className="space-y-3">
            <h2 className="text-base font-bold font-heading text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="h-5 w-5 text-teal-600" />
              <span>Upcoming Today</span>
              <Badge variant="secondary" className="font-mono text-xs">{upcomingAppts.length}</Badge>
            </h2>

            {upcomingAppts.length === 0 ? (
              <Card className="p-6 text-center text-xs text-slate-400 border border-slate-200/80 dark:border-slate-800 rounded-2xl">
                No upcoming scheduled appointments left for today.
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {upcomingAppts.map((apt) => (
                  <Card key={apt.id} className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-400">{apt.timeSlot}</span>
                      <StatusBadge status="SCHEDULED" />
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">{apt.patientName}</h4>
                    <p className="text-xs text-slate-500 line-clamp-1">&quot;{apt.reason}&quot;</p>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 4: COMPLETED TODAY */}
          {completedApptsList.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-base font-bold font-heading text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span>Completed Today ({completedCount})</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {completedApptsList.map((apt) => (
                  <Card key={apt.id} className="p-4 rounded-2xl border border-emerald-200/60 dark:border-emerald-900/40 bg-white dark:bg-slate-900 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">{apt.timeSlot}</span>
                      <StatusBadge status="COMPLETED" />
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">{apt.patientName}</h4>
                    <Link href={`/checkup/${apt.id}`}>
                      <Button variant="ghost" size="sm" className="w-full text-xs font-semibold gap-1 text-teal-600 h-8 mt-1">
                        <span>View Checkup Slip</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DoctorDashboardPage() {
  return (
    <RoleGuard allowedRoles={['doctor']}>
      <DoctorDashboardContent />
    </RoleGuard>
  );
}
