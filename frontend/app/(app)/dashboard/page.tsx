'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAppointments, useQueueStats, useUpdateAppointmentStatus, useDoctorAvailabilityDates, useAvailableSlots } from '@/features/appointments/hooks';
import { useFollowUps } from '@/features/followups/hooks';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Calendar,
  Users,
  Clock,
  Sparkles,
  PlusCircle,
  Stethoscope,
  CheckCircle2,
  XCircle,
  ArrowRight,
  UserCheck,
  Activity,
  FileText,
  AlertTriangle,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';

export default function DashboardPage() {
  const { user } = useAuthStore();

  if (!user) return null;

  return user.role === 'doctor' ? <DoctorDashboard /> : <StaffDashboard />;
}

// ----------------------------------------------------------------------
// DOCTOR DASHBOARD
// ----------------------------------------------------------------------
function DoctorDashboard() {
  const { user } = useAuthStore();
  const router = useRouter();
  const todayStr = new Date().toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState(todayStr);

  const { data: appointments, isLoading, isError, refetch } = useAppointments({
    doctorId: user?.id,
    date: selectedDate,
  });

  const { data: daySlots } = useAvailableSlots(user?.id || '', selectedDate);
  const { data: followUps } = useFollowUps({ doctorId: user?.id });

  // Check schedule configured for next 60 days
  const nextMonth = new Date();
  nextMonth.setDate(nextMonth.getDate() + 60);
  const nextMonthStr = nextMonth.toISOString().split('T')[0];
  const { data: availability } = useDoctorAvailabilityDates(user?.id, todayStr, nextMonthStr);

  const totalAppts = appointments?.length || 0;
  const completedAppts = appointments?.filter((a) => a.status === 'COMPLETED').length || 0;
  const pendingFollowUpsCount = followUps?.filter((f) => f.status === 'PENDING' || f.status === 'GENERATING').length || 0;
  const progressPercent = totalAppts > 0 ? Math.round((completedAppts / totalAppts) * 100) : 0;

  const doctorLastName = user?.fullName.split(' ').slice(-1)[0] || 'Doctor';
  const isSelectedToday = selectedDate === todayStr;

  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const isDoctorScheduledToday = daySlots?.scheduleConfigured || (daySlots?.slots && daySlots.slots.length > 0);

  return (
    <div className="space-y-6">
      {!isDoctorScheduledToday && isSelectedToday && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 shrink-0">
              <CalendarPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-amber-900 text-sm">Action Required: No Availability Added For Today</h3>
              <p className="text-xs text-amber-700">Add availability for today so receptionists can book appointments for you.</p>
            </div>
          </div>
          <Link href={`/doctors/${user?.id}/schedule`}>
            <Button variant="gradient" className="text-xs font-bold gap-1.5 h-9 shrink-0">
              <PlusCircle className="h-4 w-4" />
              <span>Add Availability</span>
            </Button>
          </Link>
        </div>
      )}

      <PageHeader
        title={`Hello, Dr. ${doctorLastName}`}
        subtitle={`${format(new Date(selectedDate + 'T00:00:00'), 'EEEE, MMMM d, yyyy')} — Doctor Workspace & Schedule`}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/doctors/${user?.id}/schedule`}>
              <Button variant="outline" size="sm" className="text-xs font-bold gap-1.5 border-teal-500 text-teal-700">
                <Clock className="h-4 w-4 text-teal-600" />
                <span>Manage Availability</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* Date Selector Card */}
      <Card className="p-4 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-teal-600" />
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Inspecting Date</span>
            <span className="font-bold text-slate-900 dark:text-white font-heading text-sm">
              {format(new Date(selectedDate + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrevDay} className="h-9 px-3 text-xs font-bold">
            <ChevronLeft className="h-4 w-4" />
            <span>Prev</span>
          </Button>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-9 text-xs font-bold rounded-xl w-36"
          />
          <Button variant="outline" size="sm" onClick={handleNextDay} className="h-9 px-3 text-xs font-bold">
            <span>Next</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant={isSelectedToday ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedDate(todayStr)}
            className="h-9 px-3 text-xs font-bold"
          >
            Today
          </Button>
        </div>
      </Card>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Date Appointments"
          value={totalAppts}
          sublabel={`${completedAppts} Examined`}
          icon={Calendar}
          loading={isLoading}
        />
        <StatCard
          title="Patients Examined"
          value={`${completedAppts} / ${totalAppts}`}
          sublabel={`${totalAppts - completedAppts} remaining`}
          icon={CheckCircle2}
          iconBgColor="bg-emerald-50 dark:bg-emerald-950/60"
          iconTextColor="text-emerald-600 dark:text-emerald-400"
          loading={isLoading}
        />
        <StatCard
          title="Pending Follow-ups"
          value={pendingFollowUpsCount}
          sublabel="Auto-generating AI pipeline"
          icon={Sparkles}
          iconBgColor="bg-violet-50 dark:bg-violet-950/60"
          iconTextColor="text-violet-600 dark:text-violet-400"
          loading={isLoading}
        />
        <StatCard
          title="Working Hours"
          value={daySlots?.workingHours || 'Not Configured'}
          sublabel={daySlots?.sessionState ? daySlots.sessionState.replace('_', ' ') : 'Off'}
          icon={FileText}
          iconBgColor="bg-blue-50 dark:bg-blue-950/60"
          iconTextColor="text-blue-600 dark:text-blue-400"
          loading={isLoading}
        />
      </div>

      {/* Examination Progress Bar */}
      <Card className="p-5 rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="text-slate-700 dark:text-slate-300">
            Examination Progress: <strong>{completedAppts} of {totalAppts} Patients Examined</strong>
          </span>
          <span className="text-teal-600 dark:text-teal-400 font-bold font-mono">{progressPercent}% Completed</span>
        </div>
        <Progress value={progressPercent} className="h-2.5 bg-slate-100 dark:bg-slate-800" />
      </Card>

      {/* Main Grid: Appointments Queue & Activity Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Appointments Queue */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-white flex items-center gap-2">
              <span>Patient Appointments ({selectedDate})</span>
              <Badge variant="secondary" className="text-xs font-mono">{totalAppts}</Badge>
            </h2>
          </div>

          {isLoading ? (
            <Card className="p-8 text-center text-xs text-slate-400">Loading schedule...</Card>
          ) : isError ? (
            <ErrorState userMessage="Failed to load schedule." onRetry={refetch} />
          ) : appointments?.length === 0 ? (
            <EmptyState
              title="No Appointments Scheduled"
              description={`No patient consultations scheduled for ${selectedDate}.`}
              icon={Calendar}
              action={
                <Link href={`/doctors/${user?.id}/schedule`}>
                  <Button variant="gradient" size="sm" className="gap-2 text-xs font-bold">
                    <CalendarPlus className="h-4 w-4" />
                    <span>Add Availability for {selectedDate}</span>
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {appointments?.map((apt) => {
                const isCurrent = apt.status === 'IN_PROGRESS' || apt.status === 'WAITING';

                return (
                  <Card
                    key={apt.id}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                      isCurrent
                        ? 'border-teal-500/60 bg-gradient-to-r from-teal-50/40 via-white to-white dark:from-teal-950/20 dark:via-slate-900 dark:to-slate-900 shadow-md ring-2 ring-teal-500/10'
                        : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-400">
                            {apt.timeSlot}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="font-mono text-xs font-bold text-slate-500">
                            {apt.mrn}
                          </span>
                          <StatusBadge status={apt.status} />
                        </div>

                        <h3 className="text-base font-bold text-slate-900 dark:text-white font-heading">
                          {apt.patientName}
                        </h3>

                        <p className="text-xs text-slate-500 line-clamp-1">
                          Reason: &quot;{apt.reason}&quot;
                        </p>
                      </div>

                      <div className="shrink-0">
                        {apt.status === 'COMPLETED' ? (
                          <Link href={`/patients/${apt.mrn}`}>
                            <Button variant="outline" size="sm" className="text-xs font-semibold gap-1">
                              <span>View Record</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        ) : isSelectedToday ? (
                          <Button
                            variant="gradient"
                            size="sm"
                            onClick={() => {
                              const { isAppointmentTimeReached } = require('@/lib/utils');
                              const { toast } = require('sonner');
                              if (!isAppointmentTimeReached(apt)) {
                                toast.error('You cannot start checkup before the scheduled appointment time.');
                                return;
                              }
                              router.push(`/checkup/${apt.id}`);
                            }}
                            className="text-xs font-bold gap-1.5 shadow-sm"
                          >
                            <Stethoscope className="h-4 w-4" />
                            <span>{apt.status === 'IN_PROGRESS' ? 'Resume Checkup' : 'Start Checkup'}</span>
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled className="text-xs font-semibold">
                            <span>Checkup Available On {selectedDate}</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activity Log */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-white">
            Recent Activity Log
          </h2>

          <Card className="p-8 text-center border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 rounded-2xl">
            <Activity className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No Recent Activity</p>
            <p className="text-xs text-slate-500 mt-1">Checkups, follow-ups, and prescriptions will appear here.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// STAFF DASHBOARD
// ----------------------------------------------------------------------
function StaffDashboard() {
  const { user } = useAuthStore();
  const todayStr = new Date().toISOString().split('T')[0];

  const { data: appointments, isLoading, isError, refetch } = useAppointments({
    clinicId: user?.clinicId,
    date: todayStr,
  });

  const { data: queueStats } = useQueueStats(user?.clinicId);
  const statusMutation = useUpdateAppointmentStatus();

  const [rescheduleAptId, setRescheduleAptId] = useState<string | null>(null);
  const [newTimeSlot, setNewTimeSlot] = useState('11:00 AM');

  const handleRescheduleSubmit = () => {
    if (!rescheduleAptId) return;
    statusMutation.mutate({ id: rescheduleAptId, status: 'SCHEDULED' });
    setRescheduleAptId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reception Queue Dashboard"
        subtitle={`${user?.clinicName} — Real-time Appointment Triage & Live Queue Counter`}
        actions={
          <Link href="/appointments/new">
            <Button variant="gradient" className="gap-2 font-bold h-11 px-5 shadow-md">
              <PlusCircle className="h-4 w-4" />
              <span>Create New Appointment</span>
            </Button>
          </Link>
        }
      />

      {/* Queue Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Appointments"
          value={queueStats?.totalToday || 0}
          sublabel="Total scheduled reception list"
          icon={Calendar}
          loading={isLoading}
        />
        <StatCard
          title="Waiting in Lobby"
          value={queueStats?.waitingCount || 0}
          sublabel="Ready for doctor checkup"
          icon={Clock}
          iconBgColor="bg-amber-50 dark:bg-amber-950/60"
          iconTextColor="text-amber-600 dark:text-amber-400"
          loading={isLoading}
        />
        <StatCard
          title="Completed Today"
          value={queueStats?.completedCount || 0}
          sublabel="Automatically updated live"
          icon={CheckCircle2}
          iconBgColor="bg-emerald-50 dark:bg-emerald-950/60"
          iconTextColor="text-emerald-600 dark:text-emerald-400"
          loading={isLoading}
        />
        <StatCard
          title="Upcoming / In Progress"
          value={queueStats?.upcomingCount || 0}
          sublabel="Active queue balance"
          icon={Activity}
          iconBgColor="bg-blue-50 dark:bg-blue-950/60"
          iconTextColor="text-blue-600 dark:text-blue-400"
          loading={isLoading}
        />
      </div>

      {/* Live Counter Per Doctor */}
      <Card className="p-5 rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Live Doctor Queue Counters (Non-refresh Automatic Sync)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {queueStats?.doctorStats.map((ds) => (
            <div key={ds.doctorId} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">{ds.doctorName}</span>
                <span className="text-[10px] text-slate-400">Examined Progress</span>
              </div>
              <Badge variant="outline" className="font-mono text-xs font-bold bg-white dark:bg-slate-900 border-teal-500 text-teal-700 dark:text-teal-300">
                {ds.examined} / {ds.total}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Appointment Table */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-white">
          Reception Patient Queue ({appointments?.length || 0})
        </h2>

        {isLoading ? (
          <Card className="p-8 text-center text-xs text-slate-400">Loading queue...</Card>
        ) : isError ? (
          <ErrorState userMessage="Failed to load reception queue." onRetry={refetch} />
        ) : appointments?.length === 0 ? (
          <EmptyState
            title="Queue is Empty"
            description="No appointment requests scheduled for today."
            icon={Calendar}
            action={
              <Link href="/appointments/new">
                <Button variant="gradient" size="sm">Create First Appointment</Button>
              </Link>
            }
          />
        ) : (
          <Card className="rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-4">Time</th>
                    <th className="p-4">Patient Name & MRN</th>
                    <th className="p-4">Attending Doctor</th>
                    <th className="p-4">Reason for Visit</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Reception Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {appointments?.map((apt) => (
                    <tr key={apt.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-4 font-mono font-bold text-teal-700 dark:text-teal-400">{apt.timeSlot}</td>
                      <td className="p-4">
                        <span className="font-bold text-slate-900 dark:text-white block">{apt.patientName}</span>
                        <span className="font-mono text-[11px] text-slate-400">{apt.mrn}</span>
                      </td>
                      <td className="p-4 text-slate-700 dark:text-slate-300 font-medium">{apt.doctorName}</td>
                      <td className="p-4 text-slate-600 dark:text-slate-400 max-w-xs truncate">&quot;{apt.reason}&quot;</td>
                      <td className="p-4">
                        <StatusBadge status={apt.status} />
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {apt.status === 'SCHEDULED' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => statusMutation.mutate({ id: apt.id, status: 'WAITING' })}
                              className="h-8 text-xs font-bold text-amber-700 border-amber-300 hover:bg-amber-50"
                            >
                              Mark Waiting
                            </Button>
                          )}
                          {apt.status !== 'COMPLETED' && apt.status !== 'CANCELLED' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => statusMutation.mutate({ id: apt.id, status: 'CANCELLED' })}
                              className="h-8 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Reschedule Modal */}
      <Dialog open={!!rescheduleAptId} onOpenChange={() => setRescheduleAptId(null)}>
        <DialogContent className="rounded-3xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Reschedule Appointment</DialogTitle>
            <DialogDescription>Select a new time slot for this patient.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="text-xs font-semibold block">New Time Slot</label>
            <Input value={newTimeSlot} onChange={(e) => setNewTimeSlot(e.target.value)} placeholder="11:30 AM" />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleAptId(null)}>Cancel</Button>
            <Button variant="gradient" onClick={handleRescheduleSubmit}>Confirm Reschedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
