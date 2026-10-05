'use client';

import React, { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useDoctorPatients } from '@/features/doctors/hooks';
import { useSearchPatients, useRegisterPatient, useDeletePatient } from '@/features/patients/hooks';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Search,
  Users,
  PlusCircle,
  ArrowRight,
  UserCheck,
  Trash2,
  Loader2,
  AlertTriangle,
  UserPlus,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Stethoscope,
  CheckCircle2,
  RefreshCw,
  FileText,
  MessageSquare,
  Sparkles,
  CalendarCheck,
} from 'lucide-react';
import { Patient } from '@/types/mediflow';
import { toast } from 'sonner';

// Helper to format Date string
function formatDisplayDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getAdjacentDate(dateStr: string, daysOffset: number): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d + daysOffset);
    const yr = dateObj.getFullYear();
    const mo = String(dateObj.getMonth() + 1).padStart(2, '0');
    const da = String(dateObj.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  } catch {
    return dateStr;
  }
}

// ============================================================================
// DOCTOR MODULE: DATE-WISE PATIENT DIRECTORY VIEW
// ============================================================================
function DoctorDateWisePatientsView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get initial date string (YYYY-MM-DD) or default to today's local date string
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const initialDate = searchParams.get('date') || todayStr;

  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'WAITING' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientItem, setSelectedPatientItem] = useState<any | null>(null);

  const { data: doctorData, isLoading, isError, refetch } = useDoctorPatients(selectedDate);

  const serverDate = doctorData?.date || selectedDate;
  const isToday = doctorData?.isToday ?? (selectedDate === todayStr);
  const isFuture = doctorData?.isFuture ?? (selectedDate > todayStr);
  const hasAvailability = doctorData?.hasAvailability ?? true;

  const appointments = doctorData?.appointments || [];
  const counts = doctorData?.counts || {
    total: 0,
    waiting: 0,
    inProgress: 0,
    completed: 0,
    remaining: 0,
    assignedCount: 0,
    dailyLimit: 30,
  };

  // Filter appointments by status & search query
  const filteredAppointments = useMemo(() => {
    return appointments.filter((apt: any) => {
      // Status Filter
      if (statusFilter === 'WAITING' && apt.status !== 'WAITING') return false;
      if (statusFilter === 'IN_PROGRESS' && apt.status !== 'IN_PROGRESS' && apt.status !== 'IN_CONSULTATION') return false;
      if (statusFilter === 'COMPLETED' && apt.status !== 'COMPLETED' && apt.status !== 'DONE') return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const pName = apt.patient?.name?.toLowerCase() || '';
        const pMrn = apt.patient?.mrn?.toLowerCase() || '';
        const pPhone = apt.patient?.phone?.toLowerCase() || '';
        return pName.includes(q) || pMrn.includes(q) || pPhone.includes(q);
      }

      return true;
    });
  }, [appointments, statusFilter, searchQuery]);

  const handlePrevDay = () => setSelectedDate(getAdjacentDate(selectedDate, -1));
  const handleNextDay = () => setSelectedDate(getAdjacentDate(selectedDate, 1));
  const handleTodayShortcut = () => setSelectedDate(todayStr);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Patients"
        subtitle="Patients scheduled and checked on the selected date."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="text-xs font-bold gap-1 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5 text-teal-600" />
              <span>Refresh</span>
            </Button>
            <Link href="/availability">
              <Button variant="outline" size="sm" className="text-xs font-bold gap-1 cursor-pointer">
                <CalendarCheck className="h-3.5 w-3.5 text-teal-600" />
                <span>My Availability</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* Date Navigation Toolbar */}
      <Card className="p-4 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrevDay} className="h-9 w-9 p-0 rounded-xl cursor-pointer">
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 px-4 py-1.5 rounded-2xl border border-slate-200 dark:border-slate-800">
            <CalendarIcon className="h-4 w-4 text-teal-600" />
            <span className="text-sm font-bold text-slate-900 dark:text-white font-heading">
              {formatDisplayDate(serverDate)}
            </span>
            {isToday && (
              <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200 text-[10px] font-bold">
                Today
              </Badge>
            )}
            {isFuture && (
              <Badge variant="outline" className="text-slate-500 text-[10px] font-bold">
                Future Date
              </Badge>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={handleNextDay} className="h-9 w-9 p-0 rounded-xl cursor-pointer">
            <ChevronRight className="h-4 w-4" />
          </Button>

          {!isToday && (
            <Button variant="ghost" size="sm" onClick={handleTodayShortcut} className="text-xs font-bold text-teal-600 hover:text-teal-700 cursor-pointer">
              Go to Today
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500">Pick Date:</label>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            className="h-9 text-xs rounded-xl w-38"
          />
        </div>
      </Card>

      {/* Summary Counts Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        <Card className="p-3.5 rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Patients</span>
          <p className="text-xl font-bold font-heading text-slate-900 dark:text-white">{counts.total}</p>
        </Card>

        <Card className="p-3.5 rounded-2xl border border-amber-200/80 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Waiting</span>
          <p className="text-xl font-bold font-heading text-amber-700 dark:text-amber-300">{counts.waiting}</p>
        </Card>

        <Card className="p-3.5 rounded-2xl border border-teal-200/80 bg-teal-50/40 dark:border-teal-900/40 dark:bg-teal-950/20 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">In Progress</span>
          <p className="text-xl font-bold font-heading text-teal-700 dark:text-teal-300">{counts.inProgress}</p>
        </Card>

        <Card className="p-3.5 rounded-2xl border border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Completed</span>
          <p className="text-xl font-bold font-heading text-emerald-700 dark:text-emerald-300">{counts.completed}</p>
        </Card>

        <Card className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Remaining</span>
          <p className="text-xl font-bold font-heading text-slate-800 dark:text-slate-200">{counts.remaining}</p>
        </Card>

        <Card className="p-3.5 rounded-2xl border border-violet-200/80 bg-violet-50/40 dark:border-violet-900/40 dark:bg-violet-950/20 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">Assigned / Limit</span>
          <p className="text-xl font-bold font-heading text-violet-700 dark:text-violet-300">
            {counts.assignedCount} / {counts.dailyLimit}
          </p>
        </Card>
      </div>

      {/* Filter Tabs & Search Bar */}
      <Card className="p-4 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-950 rounded-2xl text-xs overflow-x-auto">
            {(
              [
                { id: 'ALL', label: `All (${counts.total})` },
                { id: 'WAITING', label: `Waiting (${counts.waiting})` },
                { id: 'IN_PROGRESS', label: `In Progress (${counts.inProgress})` },
                { id: 'COMPLETED', label: `Completed (${counts.completed})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, MRN, phone..."
              className="pl-9 h-9 text-xs rounded-xl"
            />
          </div>
        </div>
      </Card>

      {/* Patient Cards / Rows List */}
      {isLoading ? (
        <Card className="p-12 text-center text-xs text-slate-400 space-y-2">
          <Loader2 className="h-6 w-6 animate-spin text-teal-600 mx-auto" />
          <span>Loading doctor schedule for {formatDisplayDate(selectedDate)}...</span>
        </Card>
      ) : isError ? (
        <Card className="p-8 text-center text-xs text-rose-500 space-y-3">
          <AlertTriangle className="h-6 w-6 mx-auto text-rose-500" />
          <p className="font-bold">Failed to load patient directory for this date.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="text-xs font-bold gap-1">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </Button>
        </Card>
      ) : filteredAppointments.length === 0 ? (
        <EmptyState
          title={`No patients on ${formatDisplayDate(selectedDate)}`}
          description={
            searchQuery || statusFilter !== 'ALL'
              ? 'No scheduled patients match your active filters or search query.'
              : !hasAvailability
              ? 'You have no availability set for this date.'
              : 'No patient appointments scheduled for this date.'
          }
          icon={Users}
          action={
            !hasAvailability ? (
              <Link href="/availability">
                <Button variant="gradient" size="sm" className="text-xs font-bold gap-1">
                  <CalendarCheck className="h-3.5 w-3.5" />
                  <span>Set Availability for {formatDisplayDate(selectedDate)}</span>
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredAppointments.map((apt: any) => {
            const p = apt.patient || {};
            const isCompleted = apt.status === 'COMPLETED' || apt.status === 'DONE';
            const isInProgress = apt.status === 'IN_PROGRESS' || apt.status === 'IN_CONSULTATION';
            const canStart = isToday && (apt.status === 'SCHEDULED' || apt.status === 'WAITING' || isInProgress);

            return (
              <Card
                key={apt.id}
                onClick={() => setSelectedPatientItem(apt)}
                className="p-4 sm:p-5 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-teal-300 dark:hover:border-teal-700 transition-all cursor-pointer shadow-xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-950 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                      <Clock className="h-3.5 w-3.5 text-teal-600" />
                      <span>{apt.timeSlot}</span>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white font-heading">
                        {p.name || p.fullName || 'Patient'}
                      </h3>
                      <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-400">
                        {p.mrn}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 justify-between sm:justify-end">
                    <StatusBadge status={apt.status as any} />

                    {canStart && (
                      <Button
                        size="sm"
                        variant="gradient"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/checkup/${apt.appointmentId}`);
                        }}
                        className="text-xs font-bold gap-1 h-9 px-4 cursor-pointer"
                      >
                        <Stethoscope className="h-3.5 w-3.5" />
                        <span>{isInProgress ? 'Resume Checkup' : 'Start Checkup'}</span>
                      </Button>
                    )}

                    {!canStart && isCompleted && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPatientItem(apt);
                        }}
                        className="text-xs font-bold gap-1 h-9 px-3 text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>View Prescription</span>
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-600 dark:text-slate-400">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Age / Gender</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{p.age || '--'} Y / {p.gender || '--'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Contact Phone</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{p.phone || '--'}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Reason for Visit</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate block">{apt.reason}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Patient Detail Drawer / Modal */}
      <Sheet open={!!selectedPatientItem} onOpenChange={() => setSelectedPatientItem(null)}>
        <SheetHeader>
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-teal-600" />
            <SheetTitle>Patient Consultation Record</SheetTitle>
          </div>
          <SheetDescription>
            {selectedPatientItem?.patient?.name} • MRN: {selectedPatientItem?.patient?.mrn}
          </SheetDescription>
        </SheetHeader>

        {selectedPatientItem && (
          <div className="space-y-5 mt-4 text-xs">
            {/* Patient Context */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <span className="font-bold text-sm text-slate-900 dark:text-white">
                  {selectedPatientItem.patient?.name}
                </span>
                <StatusBadge status={selectedPatientItem.status as any} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-400">
                <div>Phone: <strong className="font-mono text-slate-800 dark:text-slate-200">{selectedPatientItem.patient?.phone}</strong></div>
                <div>Age/Gender: <strong className="text-slate-800 dark:text-slate-200">{selectedPatientItem.patient?.age} Y / {selectedPatientItem.patient?.gender}</strong></div>
              </div>
              {selectedPatientItem.patient?.allergies?.length > 0 && (
                <div className="pt-1">
                  <Badge variant="destructive" className="text-[10px] uppercase font-bold">
                    Allergies: {selectedPatientItem.patient.allergies.join(', ')}
                  </Badge>
                </div>
              )}
            </div>

            {/* Visit Details */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <span className="font-bold text-slate-700 dark:text-slate-300 block">Consultation Info</span>
              <p><strong>Date & Time:</strong> {formatDisplayDate(selectedDate)} ({selectedPatientItem.timeSlot})</p>
              <p><strong>Chief Complaint:</strong> {selectedPatientItem.reason}</p>
              {selectedPatientItem.notes && <p><strong>Notes:</strong> {selectedPatientItem.notes}</p>}
            </div>

            {/* Prescription (if completed) */}
            {selectedPatientItem.prescription && (
              <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                  <FileText className="h-4 w-4" />
                  <span>Prescription Record</span>
                </div>
                <p><strong>Diagnosis:</strong> {selectedPatientItem.prescription.diagnosis}</p>
                {selectedPatientItem.prescription.medicines?.length > 0 && (
                  <div>
                    <span className="font-bold block mb-1">Medicines:</span>
                    <ul className="list-disc list-inside space-y-1 font-medium text-slate-700 dark:text-slate-300">
                      {selectedPatientItem.prescription.medicines.map((m: any, idx: number) => (
                        <li key={idx}>
                          {m.name || m.medicine} - {m.dosage} ({m.frequency})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selectedPatientItem.prescription.follow_up_period && (
                  <p><strong>Follow-up:</strong> {selectedPatientItem.prescription.follow_up_period}</p>
                )}
              </div>
            )}

            {/* SMS Log Status */}
            {selectedPatientItem.messageLog && (
              <div className="p-4 rounded-2xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 font-bold text-teal-800 dark:text-teal-300">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>SMS Delivery Log</span>
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {selectedPatientItem.messageLog.status}
                  </Badge>
                </div>
                <p className="italic text-slate-600 dark:text-slate-400 font-sans text-[11px] pt-1">
                  "{selectedPatientItem.messageLog.draft}"
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 space-y-2">
              {isToday && (selectedPatientItem.status === 'SCHEDULED' || selectedPatientItem.status === 'WAITING' || selectedPatientItem.status === 'IN_PROGRESS' || selectedPatientItem.status === 'IN_CONSULTATION') && (
                <Button
                  variant="gradient"
                  onClick={() => router.push(`/checkup/${selectedPatientItem.appointmentId}`)}
                  className="w-full h-11 text-xs font-bold gap-2 cursor-pointer"
                >
                  <Stethoscope className="h-4 w-4" />
                  <span>Start / Resume Checkup</span>
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => router.push(`/patients/${selectedPatientItem.patient?.mrn}`)}
                className="w-full h-10 text-xs font-bold gap-2 cursor-pointer"
              >
                <Sparkles className="h-4 w-4 text-teal-600" />
                <span>Open Full Patient AI History</span>
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

// ============================================================================
// RECEPTIONIST MODULE: STATIC DIRECTORY & REGISTRATION VIEW (UNCHANGED)
// ============================================================================
function ReceptionistPatientsView() {
  const { user } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const { data: patients, isLoading } = useSearchPatients(searchQuery);
  const registerPatientMutation = useRegisterPatient();
  const deletePatientMutation = useDeletePatient();

  const [selectedStaffPatient, setSelectedStaffPatient] = useState<Patient | null>(null);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<Patient | null>(null);

  const [regForm, setRegForm] = useState({
    fullName: '',
    phone: '',
    age: '',
    gender: 'Male' as 'Male' | 'Female' | 'Other',
    emergencyContactName: '',
    emergencyContactPhone: '',
    allergies: '',
  });

  const isReceptionistOrStaff = user?.role === 'staff' || user?.role === 'receptionist';

  const handleRowClick = (patient: Patient) => {
    setSelectedStaffPatient(patient);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regForm.fullName.trim() || !regForm.phone.trim() || !regForm.age) {
      toast.error('Please fill in required fields (Name, Phone, Age)');
      return;
    }

    const parsedAge = parseInt(regForm.age, 10);
    if (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 120) {
      toast.error('Please enter a valid age between 0 and 120');
      return;
    }

    try {
      await registerPatientMutation.mutateAsync({
        fullName: regForm.fullName.trim(),
        phone: regForm.phone.trim(),
        age: parsedAge,
        gender: regForm.gender,
        emergencyContactName: regForm.emergencyContactName.trim() || 'N/A',
        emergencyContactPhone: regForm.emergencyContactPhone.trim() || 'N/A',
        allergies: regForm.allergies ? regForm.allergies.split(',').map((s) => s.trim()).filter(Boolean) : [],
      });
      setIsRegisterModalOpen(false);
      setRegForm({
        fullName: '',
        phone: '',
        age: '',
        gender: 'Male',
        emergencyContactName: '',
        emergencyContactPhone: '',
        allergies: '',
      });
    } catch (_) {}
  };

  const handleDeleteConfirm = async () => {
    if (!patientToDelete) return;
    try {
      await deletePatientMutation.mutateAsync(patientToDelete.id);
      if (selectedStaffPatient?.id === patientToDelete.id) {
        setSelectedStaffPatient(null);
      }
      setPatientToDelete(null);
    } catch (_) {}
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patient Directory"
        subtitle="Search, register, and manage patient medical records and registration data"
        actions={
          isReceptionistOrStaff && (
            <Button
              variant="gradient"
              onClick={() => setIsRegisterModalOpen(true)}
              className="gap-2 text-xs font-bold shadow-xs cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>Register New Patient</span>
            </Button>
          )
        }
      />

      <Card className="p-4 rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by MRN, patient name, or phone number..."
            className="pl-10 h-11 text-xs sm:text-sm rounded-xl"
          />
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-8 text-center text-xs text-slate-400">Loading patient directory...</Card>
      ) : patients?.length === 0 ? (
        <EmptyState
          title="No Patients Found"
          description="No patient record matches your search query."
          icon={Users}
        />
      ) : (
        <Card className="rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase text-[10px] font-bold">
                <tr>
                  <th className="p-4">MRN</th>
                  <th className="p-4">Patient Name</th>
                  <th className="p-4">Age / Gender</th>
                  <th className="p-4">Contact Phone</th>
                  <th className="p-4">Allergies</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {patients?.map((patient) => (
                  <tr
                    key={patient.id}
                    onClick={() => handleRowClick(patient)}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <td className="p-4 font-mono font-bold text-teal-700 dark:text-teal-400">{patient.mrn}</td>
                    <td className="p-4 font-bold text-slate-900 dark:text-white">{patient.fullName}</td>
                    <td className="p-4 text-slate-600 dark:text-slate-400">{patient.age} Y / {patient.gender}</td>
                    <td className="p-4 font-mono text-slate-600 dark:text-slate-400">{patient.phone}</td>
                    <td className="p-4">
                      {patient.allergies.length > 0 ? (
                        <Badge variant="destructive" className="text-[10px] uppercase font-bold">
                          {patient.allergies.join(', ')}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">None</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRowClick(patient)}
                          className="text-xs font-semibold gap-1 text-teal-600 hover:text-teal-700"
                        >
                          <span>View Summary</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>

                        {isReceptionistOrStaff && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPatientToDelete(patient)}
                            className="text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 h-8 w-8 p-0 rounded-lg"
                            title="Delete Patient"
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* Staff Basic-Info Drawer */}
      <Sheet open={!!selectedStaffPatient} onOpenChange={() => setSelectedStaffPatient(null)}>
        <SheetHeader>
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-teal-600" />
            <SheetTitle>Patient Basic Summary</SheetTitle>
          </div>
          <SheetDescription>MRN: {selectedStaffPatient?.mrn} (Reception View)</SheetDescription>
        </SheetHeader>

        {selectedStaffPatient && (
          <div className="space-y-6 mt-6 text-xs">
            <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 space-y-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{selectedStaffPatient.fullName}</h3>
              <p className="text-slate-500 font-mono">Phone: {selectedStaffPatient.phone}</p>
              <p className="text-slate-500">Age/Gender: {selectedStaffPatient.age} Y / {selectedStaffPatient.gender}</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 space-y-1">
              <span className="font-bold text-slate-700 dark:text-slate-300 block">Emergency Contact</span>
              <p className="text-slate-600 dark:text-slate-400">{selectedStaffPatient.emergencyContactName} ({selectedStaffPatient.emergencyContactPhone})</p>
            </div>

            <div className="space-y-3 pt-2">
              <Link href="/appointments/new">
                <Button variant="gradient" className="w-full h-11 text-xs font-bold gap-2">
                  <PlusCircle className="h-4 w-4" />
                  <span>Create Appointment for this Patient</span>
                </Button>
              </Link>

              {isReceptionistOrStaff && (
                <Button
                  variant="outline"
                  onClick={() => setPatientToDelete(selectedStaffPatient)}
                  className="w-full h-10 text-xs font-bold gap-2 border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="h-4 w-4 text-rose-500" />
                  <span>Delete Patient Record</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </Sheet>

      {/* Register Patient Modal */}
      <Dialog open={isRegisterModalOpen} onOpenChange={setIsRegisterModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-teal-600" />
              <DialogTitle>Register New Patient</DialogTitle>
            </div>
            <DialogDescription>
              Enter details to create a new patient record with auto-generated MRN.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRegisterSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <Input
                value={regForm.fullName}
                onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                placeholder="e.g. John Doe"
                className="h-10 text-xs rounded-xl"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Phone Number <span className="text-rose-500">*</span>
                </label>
                <Input
                  value={regForm.phone}
                  onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                  placeholder="e.g. +923001234567"
                  className="h-10 text-xs rounded-xl font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Age <span className="text-rose-500">*</span>
                </label>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={regForm.age}
                  onChange={(e) => setRegForm({ ...regForm, age: e.target.value })}
                  placeholder="e.g. 35"
                  className="h-10 text-xs rounded-xl"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Gender</label>
              <div className="grid grid-cols-3 gap-2">
                {(['Male', 'Female', 'Other'] as const).map((g) => (
                  <Button
                    key={g}
                    type="button"
                    variant={regForm.gender === g ? 'gradient' : 'outline'}
                    size="sm"
                    onClick={() => setRegForm({ ...regForm, gender: g })}
                    className="h-9 text-xs font-semibold rounded-xl"
                  >
                    {g}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Emergency Contact Name</label>
                <Input
                  value={regForm.emergencyContactName}
                  onChange={(e) => setRegForm({ ...regForm, emergencyContactName: e.target.value })}
                  placeholder="e.g. Mary Doe"
                  className="h-10 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Emergency Contact Phone</label>
                <Input
                  value={regForm.emergencyContactPhone}
                  onChange={(e) => setRegForm({ ...regForm, emergencyContactPhone: e.target.value })}
                  placeholder="e.g. +923009876543"
                  className="h-10 text-xs rounded-xl font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Allergies (comma separated)</label>
              <Input
                value={regForm.allergies}
                onChange={(e) => setRegForm({ ...regForm, allergies: e.target.value })}
                placeholder="e.g. Penicillin, Dust, Pollen"
                className="h-10 text-xs rounded-xl"
              />
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRegisterModalOpen(false)}
                className="text-xs font-bold rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="gradient"
                disabled={registerPatientMutation.isPending}
                className="text-xs font-bold rounded-xl gap-2"
              >
                {registerPatientMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Register Patient</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Patient Confirmation Dialog */}
      <Dialog open={!!patientToDelete} onOpenChange={(open) => !open && setPatientToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle>Delete Patient Record</DialogTitle>
            </div>
            <DialogDescription>
              This action cannot be undone. Are you sure you want to delete patient:
            </DialogDescription>
          </DialogHeader>

          {patientToDelete && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 space-y-1">
              <p className="font-bold text-rose-900 dark:text-rose-200 text-sm">{patientToDelete.fullName}</p>
              <p className="text-xs font-mono text-rose-700 dark:text-rose-400">MRN: {patientToDelete.mrn} | Phone: {patientToDelete.phone}</p>
              <p className="text-[11px] text-rose-600 dark:text-rose-400 pt-2">
                Deleting this patient will permanently remove all associated appointments, medical records, and prescriptions.
              </p>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPatientToDelete(null)}
              className="text-xs font-bold rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDeleteConfirm}
              disabled={deletePatientMutation.isPending}
              className="text-xs font-bold rounded-xl gap-2 bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deletePatientMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Delete Patient</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// MAIN PATIENTS PAGE (DISPATCHES BY ROLE)
function PatientsPageContent() {
  const { user } = useAuthStore();
  if (!user) return null;

  if (user.role === 'doctor') {
    return <DoctorDateWisePatientsView />;
  }

  return <ReceptionistPatientsView />;
}

export default function PatientsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading patient directory...</div>}>
      <PatientsPageContent />
    </Suspense>
  );
}
