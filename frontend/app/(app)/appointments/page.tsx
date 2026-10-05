'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAppointments, useUpdateAppointmentStatus, useDoctors } from '@/features/appointments/hooks';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calendar as CalendarIcon,
  PlusCircle,
  Search,
  List,
  Grid,
  Stethoscope,
  ArrowRight,
  Clock,
  UserCheck,
} from 'lucide-react';
import { AppointmentStatus } from '@/constants/status';

export default function AppointmentsListPage() {
  const { user } = useAuthStore();
  const router = useRouter();

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('ALL');

  const { data: doctors } = useDoctors(user?.clinicId, '');

  const { data: appointments, isLoading } = useAppointments({
    doctorId: user?.role === 'doctor' ? user.id : (selectedDoctorId !== 'ALL' ? selectedDoctorId : undefined),
    clinicId: user?.clinicId,
    search: searchQuery,
    status: selectedStatus !== 'ALL' ? (selectedStatus as AppointmentStatus) : undefined,
  });

  const isStaff = user?.role === 'staff' || user?.role === 'receptionist';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointments Schedule"
        subtitle={isStaff ? 'Clinic-wide appointments calendar and reception management' : 'My consultation schedule and patient appointments'}
        actions={
          isStaff && (
            <Link href="/appointments/new">
              <Button variant="gradient" className="gap-2 text-xs font-bold shadow-xs">
                <PlusCircle className="h-4 w-4" />
                <span>Create Appointment</span>
              </Button>
            </Link>
          )
        }
      />

      {/* Filter & View Mode Bar */}
      <Card className="p-4 rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col xl:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by patient, MRN, or doctor..."
            className="pl-10 h-10 text-xs sm:text-sm rounded-xl"
          />
        </div>

        <div className="flex items-center gap-3 w-full xl:w-auto overflow-x-auto pb-1 xl:pb-0">
          {isStaff && (
            <Select value={selectedDoctorId} onChange={(e) => setSelectedDoctorId(e.target.value)} className="min-w-[140px] text-xs h-10">
              <option value="ALL">All Doctors</option>
              {doctors?.map((d: any) => (
                <option key={d.id} value={d.id}>Dr. {d.name}</option>
              ))}
            </Select>
          )}

          <Select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className="min-w-[130px] text-xs h-10">
            <option value="ALL">All Status</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="WAITING">Waiting</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>

          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
            <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <TabsTrigger value="list" className="text-xs font-bold gap-1 rounded-lg">
                <List className="h-3.5 w-3.5" />
                <span>List View</span>
              </TabsTrigger>
              <TabsTrigger value="calendar" className="text-xs font-bold gap-1 rounded-lg">
                <Grid className="h-3.5 w-3.5" />
                <span>Calendar</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Card>

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {isLoading ? (
            <Card className="p-8 text-center text-xs text-slate-400">Loading appointments...</Card>
          ) : appointments?.length === 0 ? (
            <EmptyState
              title="No Appointments Found"
              description="No appointment records match your criteria."
              icon={CalendarIcon}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {appointments?.map((apt) => (
                <Card
                  key={apt.id}
                  className="p-5 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs space-y-4 hover:border-teal-500/40 transition-all"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Time Slot</span>
                      <span className="font-mono text-sm font-bold text-teal-700 dark:text-teal-400">{apt.timeSlot} ({apt.date})</span>
                    </div>
                    <StatusBadge status={apt.status} />
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white text-sm block">{apt.patientName}</span>
                      <span className="font-mono text-slate-400">{apt.mrn}</span>
                    </div>

                    <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                      <UserCheck className="h-3.5 w-3.5 text-teal-600" />
                      <span>{apt.doctorName}</span>
                    </div>

                    <p className="text-slate-500 line-clamp-2 italic bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                      &quot;{apt.reason}&quot;
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                    {user?.role === 'doctor' && apt.status !== 'COMPLETED' && (
                      <Button
                        size="sm"
                        variant="gradient"
                        onClick={() => {
                          const { isAppointmentTimeReached } = require('@/lib/utils');
                          const { toast } = require('sonner');
                          if (!isAppointmentTimeReached(apt)) {
                            toast.error('You cannot start checkup before the scheduled appointment time.');
                            return;
                          }
                          router.push(`/checkup/${apt.id}`);
                        }}
                        className="text-xs font-bold gap-1"
                      >
                        <Stethoscope className="h-3.5 w-3.5" />
                        <span>Start Checkup</span>
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Calendar View Placeholder Grid */}
      {viewMode === 'calendar' && (
        <Card className="p-8 text-center rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4">
          <CalendarIcon className="h-12 w-12 text-teal-600 mx-auto" />
          <h3 className="text-lg font-bold font-heading">Interactive Calendar View</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Viewing {appointments?.length || 0} appointments scheduled across the active calendar month.
          </p>
        </Card>
      )}
    </div>
  );
}
