'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import {
  useDoctors,
  useAvailableSlots,
  useDoctorAvailabilityDates,
  useCreateAppointment,
  useRescheduleAppointment,
  useCancelAppointment,
  useDoctorAvailabilities,
  useAddDoctorAvailability,
  useDeleteDoctorAvailability,
} from '@/features/appointments/hooks';
import { usePatientLookup } from '@/features/patients/hooks';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogContent } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import {
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  CalendarCheck,
  Search,
  Stethoscope,
  Trash2,
  CalendarPlus,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { SlotAvailability } from '@/types/mediflow';

function DoctorScheduleContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const doctorId = params.id as string;
  const initialDate = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(initialDate);

  const { user, initialized, loading } = useAuthStore();
  const todayStr = new Date().toISOString().split('T')[0];

  // Auth Guard: Doctor, Receptionist, or Staff can access
  useEffect(() => {
    if (initialized && !loading) {
      if (!user) {
        router.replace('/login');
      }
    }
  }, [user, initialized, loading, router]);

  if (!initialized || loading) {
    return <Card className="p-8 text-center text-xs text-slate-400">Loading schedule...</Card>;
  }

  if (!user) return null;

  const isDoctor = user.role === 'doctor';
  const isReceptionistOrStaff = user.role === 'staff' || user.role === 'receptionist';

  // Fetch Doctor Data
  const { data: doctors } = useDoctors(user?.clinicId || '', '', selectedDate);
  const doctor = doctors?.find((d: any) => d.id === doctorId);

  // Fetch Day Schedule & Time Slots
  const { data: daySchedule, isLoading: slotsLoading } = useAvailableSlots(doctorId, selectedDate);

  // Compute 14-day date range for upcoming overview
  const overviewFrom = selectedDate;
  const overviewToDateObj = new Date(selectedDate);
  overviewToDateObj.setDate(overviewToDateObj.getDate() + 13);
  const overviewTo = overviewToDateObj.toISOString().split('T')[0];

  const { data: availabilityOverview } = useDoctorAvailabilityDates(doctorId, overviewFrom, overviewTo);

  // Fetch Doctor's configured date availabilities
  const { data: doctorAvailabilities } = useDoctorAvailabilities(doctorId);

  // Modals
  const [bookingSlot, setBookingSlot] = useState<SlotAvailability | null>(null);
  const [reschedulingAppt, setReschedulingAppt] = useState<{ id: string; patientName: string; currentSlot: string } | null>(null);
  const [cancellingAppt, setCancellingAppt] = useState<{ id: string; patientName: string } | null>(null);
  const [isAddAvailabilityOpen, setIsAddAvailabilityOpen] = useState(false);
  const [conflictModalData, setConflictModalData] = useState<{ message: string; affectedAppointments: any[] } | null>(null);

  // Add Availability Form
  const [availForm, setAvailForm] = useState({
    date: todayStr,
    startTime: '09:00',
    endTime: '17:00',
    slotMinutes: 15,
    repeatWeekly: false,
    repeatUntil: '',
  });

  // Booking Form State
  const [searchMrnPhone, setSearchMrnPhone] = useState('');
  const [lookupQuery, setLookupQuery] = useState<{ mrn?: string; phone?: string } | null>(null);
  const { data: foundPatient, isLoading: patientSearching } = usePatientLookup(lookupQuery);

  const [bookingData, setBookingData] = useState({
    patientName: '',
    patientPhone: '',
    patientAge: 30,
    patientGender: 'Male' as 'Male' | 'Female' | 'Other',
    reason: 'Consultation',
  });

  // Reschedule Form State
  const [rescheduleDate, setRescheduleDate] = useState(selectedDate);
  const [rescheduleTimeSlot, setRescheduleTimeSlot] = useState('');
  const { data: rescheduleSlots } = useAvailableSlots(doctorId, rescheduleDate);

  // Mutations
  const createMutation = useCreateAppointment();
  const rescheduleMutation = useRescheduleAppointment();
  const cancelMutation = useCancelAppointment();
  const addAvailMutation = useAddDoctorAvailability();
  const deleteAvailMutation = useDeleteDoctorAvailability();

  // Handle Date Navigation
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

  // Submit Add Availability
  const handleAddAvailabilitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addAvailMutation.mutateAsync({
        dates: [availForm.date],
        start_time: availForm.startTime,
        end_time: availForm.endTime,
        slot_minutes: availForm.slotMinutes,
        repeat_weekly_until: availForm.repeatWeekly && availForm.repeatUntil ? availForm.repeatUntil : undefined,
      });
      setIsAddAvailabilityOpen(false);
    } catch (err: any) {
      if (err.affectedAppointments) {
        setConflictModalData({
          message: err.message || 'Cannot add availability due to conflicting appointments.',
          affectedAppointments: err.affectedAppointments,
        });
      }
    }
  };

  // Submit Delete Availability
  const handleDeleteAvailability = async (availId: string) => {
    try {
      await deleteAvailMutation.mutateAsync(availId);
    } catch (err: any) {
      if (err.affectedAppointments) {
        setConflictModalData({
          message: err.message || 'Cannot remove availability because booked appointments exist in this range.',
          affectedAppointments: err.affectedAppointments,
        });
      }
    }
  };

  // Handle Patient Search in Booking Modal
  const handleSearchPatient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchMrnPhone.trim()) return;
    const isMrn = /^MRN-/i.test(searchMrnPhone.trim());
    if (isMrn) {
      setLookupQuery({ mrn: searchMrnPhone.trim().toUpperCase() });
    } else {
      setLookupQuery({ phone: searchMrnPhone.trim() });
    }
  };

  useEffect(() => {
    if (foundPatient) {
      setBookingData((prev) => ({
        ...prev,
        patientName: foundPatient.fullName || (foundPatient as any).name || '',
        patientPhone: foundPatient.phone || '',
        patientAge: foundPatient.age || 30,
        patientGender: (foundPatient.gender as any) || 'Male',
      }));
    }
  }, [foundPatient]);

  // Submit Booking
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingSlot) return;

    try {
      await createMutation.mutateAsync({
        mrn: foundPatient?.mrn || 'MRN-NEW',
        patientId: foundPatient?.id,
        patientName: bookingData.patientName,
        patientPhone: bookingData.patientPhone,
        patientAge: Number(bookingData.patientAge),
        patientGender: bookingData.patientGender,
        doctorId,
        date: selectedDate,
        timeSlot: bookingSlot.time,
        type: 'Consultation',
        reason: bookingData.reason || 'General Consultation',
      });
      setBookingSlot(null);
      setSearchMrnPhone('');
      setLookupQuery(null);
    } catch (_) {}
  };

  // Submit Reschedule
  const handleConfirmReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedulingAppt || !rescheduleTimeSlot) return;

    try {
      await rescheduleMutation.mutateAsync({
        id: reschedulingAppt.id,
        date: rescheduleDate,
        timeSlot: rescheduleTimeSlot,
      });
      setReschedulingAppt(null);
    } catch (_) {}
  };

  // Submit Cancel
  const handleConfirmCancel = async () => {
    if (!cancellingAppt) return;
    try {
      await cancelMutation.mutateAsync(cancellingAppt.id);
      setCancellingAppt(null);
    } catch (_) {}
  };

  const isPastDate = selectedDate < todayStr;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title={`Doctor Schedule — Dr. ${doctor?.fullName || doctor?.name || 'Physician'}`}
        subtitle={`Specialization: ${doctor?.specializations?.[0]?.name || 'General Physician'} • Daily Limit: ${daySchedule?.dailyLimit || 30} Patients`}
        actions={
          <div className="flex items-center gap-2">
            {isDoctor && (
              <Button
                variant="gradient"
                size="sm"
                onClick={() => setIsAddAvailabilityOpen(true)}
                className="text-xs font-bold gap-1.5 shadow-xs cursor-pointer"
              >
                <CalendarPlus className="h-4 w-4" />
                <span>Add Availability Date</span>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => router.push('/doctors')} className="text-xs font-bold gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Directory</span>
            </Button>
          </div>
        }
      />

      {/* Date Navigator Bar */}
      <Card className="p-4 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-teal-600/10 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 flex items-center justify-center font-bold">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Selected Schedule Date</span>
            <span className="font-bold text-slate-900 dark:text-white font-heading text-sm">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        </div>

        {/* Date Selector Buttons */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrevDay} className="h-10 px-3 text-xs font-bold gap-1">
            <ChevronLeft className="h-4 w-4" />
            <span>Prev</span>
          </Button>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-10 text-xs font-bold rounded-xl w-36"
          />
          <Button variant="outline" size="sm" onClick={handleNextDay} className="h-10 px-3 text-xs font-bold gap-1">
            <span>Next</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant={selectedDate === todayStr ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedDate(todayStr)}
            className="h-10 px-4 text-xs font-bold"
          >
            Today
          </Button>
        </div>
      </Card>

      {/* Session State Banner */}
      {daySchedule && (
        <Card className="p-5 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Session Status</span>
            <Badge
              variant={
                daySchedule.sessionState === 'UPCOMING'
                  ? 'outline'
                  : daySchedule.sessionState === 'IN_SESSION'
                  ? 'default'
                  : daySchedule.sessionState === 'FULLY_BOOKED'
                  ? 'destructive'
                  : 'secondary'
              }
              className="font-bold text-xs"
            >
              {daySchedule.sessionState.replace('_', ' ')}
            </Badge>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Working Hours</span>
            <span className="font-bold font-mono text-slate-800 dark:text-slate-200">{daySchedule.workingHours}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Booked Patients</span>
            <span className="font-bold font-mono text-teal-600 dark:text-teal-400 text-sm">
              {daySchedule.bookedCount} / {daySchedule.dailyLimit}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Available Free Slots</span>
            <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400 text-sm">
              {daySchedule.slots.filter((s) => s.isAvailable).length} Slots
            </span>
          </div>
        </Card>
      )}

      {/* 14-Day Upcoming Overview Strip */}
      <Card className="p-5 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <CalendarCheck className="h-4 w-4 text-teal-600" />
            <span>Upcoming 14-Day Availability Overview</span>
          </div>
          <span className="text-[11px] text-slate-400">Click any date to inspect schedule</span>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {availabilityOverview?.dates?.map((d: any) => {
            const isSel = d.date === selectedDate;
            const dayName = new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = d.date.split('-')[2];
            const isFull = d.bookedCount >= d.dailyLimit || d.sessionState === 'FULLY_BOOKED';

            return (
              <button
                key={d.date}
                type="button"
                onClick={() => setSelectedDate(d.date)}
                className={`p-3 rounded-2xl border text-center transition-all shrink-0 min-w-[90px] cursor-pointer space-y-1 ${
                  isSel
                    ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 ring-2 ring-teal-500/20 shadow-sm'
                    : 'border-slate-200/70 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950 hover:border-slate-300'
                }`}
              >
                <span className="text-[10px] font-bold uppercase block text-slate-400">{dayName}</span>
                <span className="text-sm font-extrabold font-mono block text-slate-900 dark:text-white">{dayNum}</span>
                {isFull ? (
                  <Badge variant="destructive" className="text-[9px] px-1 py-0 uppercase block">Full</Badge>
                ) : (
                  <span className="text-[10px] font-semibold text-emerald-600 block">{d.freeSlotsCount} free</span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Doctor Configured Availabilities (Doctor Management View) */}
      {isDoctor && (
        <Card className="p-5 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold font-heading text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarPlus className="h-4 w-4 text-teal-600" />
              <span>Configured Date Availability Ranges</span>
            </h3>
            <Button
              size="sm"
              variant="gradient"
              onClick={() => setIsAddAvailabilityOpen(true)}
              className="text-xs font-bold gap-1 h-8"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Date Range</span>
            </Button>
          </div>

          {!doctorAvailabilities || doctorAvailabilities.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
              <p>No availability dates configured for your profile.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddAvailabilityOpen(true)}
                className="text-xs font-bold gap-2"
              >
                <CalendarPlus className="h-4 w-4 text-teal-600" />
                <span>Add Your First Availability Date</span>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Time Range</th>
                    <th className="p-3">Slot Duration</th>
                    <th className="p-3">Booked Count</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {doctorAvailabilities.map((avail: any) => (
                    <tr key={avail.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">{avail.date}</td>
                      <td className="p-3 font-mono text-teal-700 dark:text-teal-400 font-semibold">
                        {avail.start_time.substring(0, 5)} - {avail.end_time.substring(0, 5)}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">{avail.slot_minutes} Mins</td>
                      <td className="p-3">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {avail.bookedCount || 0} Booked
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteAvailability(avail.id)}
                          className="text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 h-8 w-8 p-0 rounded-lg"
                          title="Delete Availability Range"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Main Time Slots Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold font-heading text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="h-5 w-5 text-teal-600" />
            <span>Time Slots Grid — {selectedDate}</span>
          </h2>
          {isPastDate && (
            <Badge variant="secondary" className="text-xs font-bold">
              Read-Only Past Date History
            </Badge>
          )}
        </div>

        {slotsLoading ? (
          <Card className="p-8 text-center text-xs text-slate-400">Loading day schedule & slots...</Card>
        ) : !daySchedule || daySchedule.slots.length === 0 ? (
          <EmptyState
            title="Doctor Not Visiting / Off"
            description={daySchedule?.disabledReason || 'Doctor has no scheduled visiting slots on this day.'}
            icon={Stethoscope}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {daySchedule.slots.map((slot: SlotAvailability, idx: number) => {
              const isBooked = slot.state === 'booked';
              const isAvailable = slot.state === 'available';
              const isPast = slot.state === 'past';
              const isBreak = slot.state === 'break';
              const isFull = slot.state === 'not_available';

              return (
                <Card
                  key={idx}
                  className={`p-4 rounded-2xl border transition-all space-y-3 shadow-xs ${
                    isBooked
                      ? 'border-violet-200 bg-violet-50/40 dark:border-violet-900/40 dark:bg-violet-950/20'
                      : isAvailable
                      ? 'border-teal-200 bg-white dark:border-teal-900/40 dark:bg-slate-900 hover:border-teal-400'
                      : 'border-slate-200/60 bg-slate-50/60 dark:border-slate-800/60 dark:bg-slate-950 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      {slot.time}
                    </span>

                    {isBooked && (
                      <Badge className="bg-violet-600 text-white text-[10px] uppercase font-bold">
                        Booked
                      </Badge>
                    )}
                    {isAvailable && (
                      <Badge className="bg-emerald-600 text-white text-[10px] uppercase font-bold">
                        Free
                      </Badge>
                    )}
                    {isPast && (
                      <Badge variant="outline" className="text-slate-400 text-[10px] uppercase font-bold">
                        Past
                      </Badge>
                    )}
                    {isBreak && (
                      <Badge variant="secondary" className="text-[10px] uppercase font-bold">
                        Break
                      </Badge>
                    )}
                    {isFull && (
                      <Badge variant="destructive" className="text-[10px] uppercase font-bold">
                        Full
                      </Badge>
                    )}
                  </div>

                  {/* Slot Body */}
                  {isBooked ? (
                    <div className="space-y-2 pt-2 border-t border-violet-100 dark:border-violet-900/40 text-xs">
                      <div className="space-y-0.5">
                        <span className="font-bold text-slate-900 dark:text-white block">{slot.patientName || 'Patient'}</span>
                        <span className="font-mono text-[11px] text-teal-600 font-semibold block">{slot.patientMrn}</span>
                        {slot.reason && <p className="text-slate-500 italic text-[11px] truncate">&quot;{slot.reason}&quot;</p>}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <StatusBadge status={(slot.status || 'scheduled').toLowerCase() as any} />
                        {slot.status === 'scheduled' && !isPastDate && isReceptionistOrStaff && (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setReschedulingAppt({ id: slot.appointmentId!, patientName: slot.patientName || '', currentSlot: slot.time })}
                              className="h-7 text-[10px] px-2 font-bold"
                            >
                              Move
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setCancellingAppt({ id: slot.appointmentId!, patientName: slot.patientName || '' })}
                              className="h-7 text-[10px] px-2 font-bold"
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : isAvailable ? (
                    <div className="pt-2">
                      <Button
                        size="sm"
                        onClick={() => setBookingSlot(slot)}
                        className="w-full h-8 text-xs font-bold gap-1 bg-teal-600 hover:bg-teal-700 text-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Book This Slot</span>
                      </Button>
                    </div>
                  ) : (
                    <div className="pt-2 text-center text-[11px] text-slate-400 italic">
                      {isPast ? 'Slot time passed' : isBreak ? 'Doctor Break Time' : 'Daily Limit Reached'}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* ADD AVAILABILITY DIALOG (Doctor) */}
      {/* --------------------------------------------------------------------- */}
      <Dialog open={isAddAvailabilityOpen} onOpenChange={setIsAddAvailabilityOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-teal-600" />
              <DialogTitle>Add Doctor Availability Date</DialogTitle>
            </div>
            <DialogDescription>
              Select a specific date and time range for doctor appointments.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddAvailabilitySubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Target Date <span className="text-rose-500">*</span>
              </label>
              <Input
                type="date"
                min={todayStr}
                value={availForm.date}
                onChange={(e) => setAvailForm({ ...availForm, date: e.target.value })}
                className="h-10 text-xs font-bold rounded-xl"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Start Time <span className="text-rose-500">*</span>
                </label>
                <Input
                  type="time"
                  value={availForm.startTime}
                  onChange={(e) => setAvailForm({ ...availForm, startTime: e.target.value })}
                  className="h-10 text-xs font-mono rounded-xl"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  End Time <span className="text-rose-500">*</span>
                </label>
                <Input
                  type="time"
                  value={availForm.endTime}
                  onChange={(e) => setAvailForm({ ...availForm, endTime: e.target.value })}
                  className="h-10 text-xs font-mono rounded-xl"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Slot Duration (Minutes)</label>
              <Select
                value={String(availForm.slotMinutes)}
                onChange={(e) => setAvailForm({ ...availForm, slotMinutes: Number(e.target.value) })}
              >
                <option value="10">10 Minutes</option>
                <option value="15">15 Minutes (Default)</option>
                <option value="20">20 Minutes</option>
                <option value="30">30 Minutes</option>
                <option value="45">45 Minutes</option>
                <option value="60">60 Minutes</option>
              </Select>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={availForm.repeatWeekly}
                  onChange={(e) => setAvailForm({ ...availForm, repeatWeekly: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-teal-500 h-4 w-4"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Repeat Weekly Until Date
                </span>
              </label>

              {availForm.repeatWeekly && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-bold text-slate-500">End Date for Weekly Repetition</label>
                  <Input
                    type="date"
                    min={availForm.date}
                    value={availForm.repeatUntil}
                    onChange={(e) => setAvailForm({ ...availForm, repeatUntil: e.target.value })}
                    className="h-9 text-xs font-bold rounded-xl"
                    required={availForm.repeatWeekly}
                  />
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddAvailabilityOpen(false)}
                className="text-xs font-bold rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="gradient"
                disabled={addAvailMutation.isPending}
                className="text-xs font-bold rounded-xl gap-2"
              >
                {addAvailMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Save Availability</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CONFLICT DIALOG (AFFECTED BOOKINGS) */}
      <Dialog open={!!conflictModalData} onOpenChange={(open) => !open && setConflictModalData(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle>Action Blocked — Bookings Exist</DialogTitle>
            </div>
            <DialogDescription>{conflictModalData?.message}</DialogDescription>
          </DialogHeader>

          {conflictModalData && (
            <div className="space-y-3 my-2 text-xs">
              <p className="font-bold text-slate-700 dark:text-slate-300">
                The following {conflictModalData.affectedAppointments.length} appointment(s) must be rescheduled or cancelled first:
              </p>
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {conflictModalData.affectedAppointments.map((apt: any) => (
                  <div key={apt.id} className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 space-y-0.5">
                    <p className="font-bold text-amber-900 dark:text-amber-200">{apt.patientName} ({apt.mrn || 'N/A'})</p>
                    <p className="font-mono text-amber-700 dark:text-amber-400">Date: {apt.date} • Time Slot: {apt.timeSlot}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="default"
              onClick={() => setConflictModalData(null)}
              className="text-xs font-bold rounded-xl"
            >
              Understand & Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --------------------------------------------------------------------- */}
      {/* BOOKING DIALOG */}
      {/* --------------------------------------------------------------------- */}
      <Dialog open={!!bookingSlot} onOpenChange={() => setBookingSlot(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-teal-600" />
              <span>Book Appointment Slot — {bookingSlot?.time}</span>
            </DialogTitle>
            <DialogDescription>
              Dr. {doctor?.fullName || doctor?.name} • Date: {selectedDate}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2 text-xs">
            <form onSubmit={handleSearchPatient} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  value={searchMrnPhone}
                  onChange={(e) => setSearchMrnPhone(e.target.value)}
                  placeholder="Lookup existing patient by MRN or Mobile Phone..."
                  className="pl-9 h-9 text-xs"
                />
              </div>
              <Button type="submit" variant="outline" size="sm" disabled={patientSearching} className="h-9 px-3 text-xs font-bold">
                {patientSearching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Search'}
              </Button>
            </form>

            {foundPatient && (
              <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 dark:bg-teal-950/40 dark:border-teal-900 space-y-1">
                <span className="font-bold text-teal-800 dark:text-teal-300 block">Existing Patient Verified:</span>
                <p className="font-semibold text-slate-900 dark:text-white">{foundPatient.fullName} ({foundPatient.mrn})</p>
                <p className="text-slate-500">{foundPatient.phone} • {foundPatient.age} Y / {foundPatient.gender}</p>
              </div>
            )}

            <form id="booking-form" onSubmit={handleConfirmBooking} className="space-y-3">
              <div>
                <label className="font-semibold block mb-1">Patient Full Name *</label>
                <Input
                  value={bookingData.patientName}
                  onChange={(e) => setBookingData({ ...bookingData, patientName: e.target.value })}
                  placeholder="e.g. Mohammad Ali"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Mobile Phone *</label>
                  <Input
                    value={bookingData.patientPhone}
                    onChange={(e) => setBookingData({ ...bookingData, patientPhone: e.target.value })}
                    placeholder="03001234567"
                    required
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Age *</label>
                  <Input
                    type="number"
                    value={bookingData.patientAge}
                    onChange={(e) => setBookingData({ ...bookingData, patientAge: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Consultation Reason</label>
                <Input
                  value={bookingData.reason}
                  onChange={(e) => setBookingData({ ...bookingData, reason: e.target.value })}
                  placeholder="e.g. Routine checkup"
                />
              </div>
            </form>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBookingSlot(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="booking-form"
              disabled={createMutation.isPending}
              size="sm"
              className="bg-teal-600 text-white hover:bg-teal-700 font-bold"
            >
              {createMutation.isPending ? 'Confirming...' : 'Confirm Appointment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RESCHEDULE DIALOG */}
      <Dialog open={!!reschedulingAppt} onOpenChange={() => setReschedulingAppt(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reschedule Appointment</DialogTitle>
            <DialogDescription>
              Move {reschedulingAppt?.patientName}&apos;s appointment to a new date and free time slot.
            </DialogDescription>
          </DialogHeader>

          <form id="reschedule-form" onSubmit={handleConfirmReschedule} className="space-y-4 my-2 text-xs">
            <div>
              <label className="font-semibold block mb-1">Select Target Date</label>
              <Input
                type="date"
                min={todayStr}
                value={rescheduleDate}
                onChange={(e) => {
                  setRescheduleDate(e.target.value);
                  setRescheduleTimeSlot('');
                }}
                className="h-10 text-xs font-bold"
              />
            </div>

            <div>
              <label className="font-semibold block mb-1">Available Free Time Slot *</label>
              <Select
                value={rescheduleTimeSlot}
                onChange={(e) => setRescheduleTimeSlot(e.target.value)}
                required
              >
                <option value="">-- Choose a Free Slot --</option>
                {rescheduleSlots?.slots
                  ?.filter((s) => s.isAvailable)
                  .map((s) => (
                    <option key={s.time} value={s.time}>
                      {s.time}
                    </option>
                  ))}
              </Select>
            </div>
          </form>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReschedulingAppt(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="reschedule-form"
              disabled={rescheduleMutation.isPending || !rescheduleTimeSlot}
              size="sm"
              className="bg-teal-600 text-white font-bold"
            >
              {rescheduleMutation.isPending ? 'Saving...' : 'Confirm Reschedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CANCEL DIALOG */}
      <Dialog open={!!cancellingAppt} onOpenChange={() => setCancellingAppt(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-rose-600 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              <span>Cancel Appointment</span>
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel the scheduled appointment for <strong>{cancellingAppt?.patientName}</strong>?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCancellingAppt(null)}>
              Keep Appointment
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={cancelMutation.isPending}
              onClick={handleConfirmCancel}
              className="font-bold"
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function DoctorSchedulePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading Doctor Schedule...</div>}>
      <DoctorScheduleContent />
    </Suspense>
  );
}
