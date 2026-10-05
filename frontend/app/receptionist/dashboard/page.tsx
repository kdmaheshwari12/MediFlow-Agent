'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { RoleGuard } from '@/components/auth/role-guard';
import { useAppointments, useQueueStats, useUpdateAppointmentStatus } from '@/features/appointments/hooks';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Calendar,
  Users,
  Clock,
  PlusCircle,
  CheckCircle2,
  Activity,
  LogOut,
  Building2,
  Search,
  Filter,
  RefreshCw,
  IdCard,
} from 'lucide-react';
import { toast } from 'sonner';

function ReceptionistDashboardContent() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const todayStr = new Date().toISOString().split('T')[0];

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');

  const { data: appointments, isLoading, isError, refetch } = useAppointments({
    clinicId: user?.clinicId,
    date: todayStr,
  });

  const { data: queueStats } = useQueueStats(user?.clinicId);
  const statusMutation = useUpdateAppointmentStatus();

  const [rescheduleAptId, setRescheduleAptId] = useState<string | null>(null);
  const [newTimeSlot, setNewTimeSlot] = useState('11:00 AM');

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully.');
    window.location.href = '/login';
  };

  const handleRescheduleSubmit = () => {
    if (!rescheduleAptId) return;
    statusMutation.mutate({ id: rescheduleAptId, status: 'SCHEDULED' });
    setRescheduleAptId(null);
  };

  if (!user) return null;

  // Filter appointments
  const filteredAppointments = (appointments || []).filter((apt) => {
    const matchesSearch =
      !searchQuery ||
      apt.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      apt.mrn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      apt.patientPhone?.includes(searchQuery);

    const matchesDoctor = selectedDoctorFilter === 'ALL' || apt.doctorId === selectedDoctorFilter;
    const matchesStatus = selectedStatusFilter === 'ALL' || apt.status === selectedStatusFilter;

    return matchesSearch && matchesDoctor && matchesStatus;
  });

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Navigation & Profile Quick View */}
        <Card className="p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center font-bold shadow-md shrink-0">
              <Users className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-slate-900 dark:text-white">
                  Reception Desk Workspace
                </h1>
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold uppercase text-xs">
                  Receptionist
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 flex items-center gap-3 flex-wrap">
                <span>Welcome, <strong>{user.fullName}</strong></span>
                <span>•</span>
                <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5 text-teal-600" /> {user.clinicName || 'City Central Hospital'}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><IdCard className="h-3.5 w-3.5 text-teal-600" /> {user.employeeId || 'EMP-1002'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <Link href="/appointments/new" className="flex-1 md:flex-initial">
              <Button variant="gradient" className="w-full gap-2 font-bold h-11 px-5 shadow-md rounded-xl cursor-pointer">
                <PlusCircle className="h-4 w-4" />
                <span>New Appointment</span>
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

        {/* Live Queue Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Today's Total Scheduled"
            value={queueStats?.totalToday || appointments?.length || 0}
            sublabel="Full clinic receptionist list"
            icon={Calendar}
            loading={isLoading}
          />
          <StatCard
            title="Waiting in Lobby"
            value={queueStats?.waitingCount || appointments?.filter(a => a.status === 'WAITING').length || 0}
            sublabel="Ready for physician consultation"
            icon={Clock}
            iconBgColor="bg-amber-50 dark:bg-amber-950/60"
            iconTextColor="text-amber-600 dark:text-amber-400"
            loading={isLoading}
          />
          <StatCard
            title="Completed Consultations"
            value={queueStats?.completedCount || appointments?.filter(a => a.status === 'COMPLETED').length || 0}
            sublabel="Checked out by doctors"
            icon={CheckCircle2}
            iconBgColor="bg-emerald-50 dark:bg-emerald-950/60"
            iconTextColor="text-emerald-600 dark:text-emerald-400"
            loading={isLoading}
          />
          <StatCard
            title="Upcoming / Scheduled"
            value={queueStats?.upcomingCount || appointments?.filter(a => a.status === 'SCHEDULED').length || 0}
            sublabel="Pending arrival or computed waiting"
            icon={Activity}
            iconBgColor="bg-blue-50 dark:bg-blue-950/60"
            iconTextColor="text-blue-600 dark:text-blue-400"
            loading={isLoading}
          />
        </div>

        {/* Live Doctor Queue & Patient Limit Counters */}
        <Card className="p-5 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Users className="h-4 w-4 text-teal-600" />
              <span>Today&apos;s Active Doctors & Daily Limits</span>
            </h3>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-7 text-xs text-slate-400 hover:text-slate-700 gap-1">
              <RefreshCw className="h-3 w-3" />
              <span>Sync Queue</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {queueStats?.doctorStats?.map((ds) => (
              <div key={ds.doctorId} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">{ds.doctorName}</span>
                  <span className="text-[10px] text-slate-400">Assigned / Limit Count</span>
                </div>
                <Badge variant="outline" className="font-mono text-xs font-bold bg-white dark:bg-slate-900 border-teal-500 text-teal-700 dark:text-teal-300">
                  {ds.examined} / {ds.total}
                </Badge>
              </div>
            ))}
            {(!queueStats?.doctorStats || queueStats.doctorStats.length === 0) && (
              <div className="col-span-3 text-center py-2 text-xs text-slate-400">
                Active doctor queue counters will display here when appointments are created.
              </div>
            )}
          </div>
        </Card>

        {/* Reception Queue Controls: Search & Filter */}
        <Card className="p-4 rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search patient name, MRN, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 rounded-xl text-xs"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold shrink-0">
                <Filter className="h-3.5 w-3.5 text-teal-600" />
                <span>Status:</span>
              </div>
              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-2 focus:ring-teal-500 outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="WAITING">Waiting</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Appointment Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-white flex items-center gap-2">
              <span>Patient Queue List</span>
              <Badge variant="secondary" className="font-mono text-xs">{filteredAppointments.length}</Badge>
            </h2>
          </div>

          {isLoading ? (
            <Card className="p-12 text-center text-xs text-slate-400">Loading live patient queue...</Card>
          ) : isError ? (
            <ErrorState userMessage="Failed to load reception queue." onRetry={refetch} />
          ) : filteredAppointments.length === 0 ? (
            <EmptyState
              title="No Matching Appointments Found"
              description="No patient records match the selected search filters."
              icon={Calendar}
              action={
                <Link href="/appointments/new">
                  <Button variant="gradient" size="sm" className="rounded-xl font-bold">Create New Appointment</Button>
                </Link>
              }
            />
          ) : (
            <Card className="rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-4">Time Slot</th>
                      <th className="p-4">Patient Name & MRN</th>
                      <th className="p-4">Attending Doctor</th>
                      <th className="p-4">Reason for Visit</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredAppointments.map((apt) => (
                      <tr key={apt.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="p-4 font-mono font-bold text-teal-700 dark:text-teal-400">{apt.timeSlot}</td>
                        <td className="p-4">
                          <span className="font-bold text-slate-900 dark:text-white block">{apt.patientName}</span>
                          <span className="font-mono text-[11px] text-slate-400">{apt.mrn}</span>
                        </td>
                        <td className="p-4 text-slate-700 dark:text-slate-300 font-semibold">{apt.doctorName}</td>
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
                                className="h-8 text-xs font-bold text-amber-700 border-amber-300 hover:bg-amber-50 rounded-xl cursor-pointer"
                              >
                                Mark Waiting
                              </Button>
                            )}
                            {apt.status !== 'COMPLETED' && apt.status !== 'CANCELLED' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => statusMutation.mutate({ id: apt.id, status: 'CANCELLED' })}
                                className="h-8 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
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
              <Input value={newTimeSlot} onChange={(e) => setNewTimeSlot(e.target.value)} placeholder="11:30 AM" className="rounded-xl" />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setRescheduleAptId(null)} className="rounded-xl">Cancel</Button>
              <Button variant="gradient" onClick={handleRescheduleSubmit} className="rounded-xl font-bold">Confirm Reschedule</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default function ReceptionistDashboardPage() {
  return (
    <RoleGuard allowedRoles={['receptionist']}>
      <ReceptionistDashboardContent />
    </RoleGuard>
  );
}
