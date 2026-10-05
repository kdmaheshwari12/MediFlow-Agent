'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAppointmentWizardStore, normalizePatient, normalizeDoctor } from '@/stores/appointment-wizard.store';
import { useRegisterPatient } from '@/features/patients/hooks';
import { useAvailableSlots, useCreateAppointment, useDoctorAvailabilityDates } from '@/features/appointments/hooks';
import { listDoctors, listSpecializations, Specialization } from '@/services/appointments.service';
import { Stepper } from '@/components/common/Stepper';
import { WorkflowBanner } from '@/components/domain/WorkflowBanner';
import { MrnBadge } from '@/components/domain/MrnBadge';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  UserCheck,
  UserPlus,
  Search,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Printer,
  Info,
  Users,
  AlertCircle,
  User,
  Stethoscope,
  FileText,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppointmentType } from '@/types/mediflow';
import { MESSAGES } from '@/constants/messages';

const WIZARD_STEPS = [
  { number: 1, title: 'Patient Info', subtitle: 'MRN or Registration' },
  { number: 2, title: 'Select Doctor', subtitle: 'Specialty & Clinic' },
  { number: 3, title: 'Date & Time', subtitle: 'Available Slot Grid' },
  { number: 4, title: 'Details', subtitle: 'Reason & Type' },
  { number: 5, title: 'Review & Confirm', subtitle: 'Final Submission' },
];

function formatDisplayDateTime(dateStr: string, timeSlotStr: string): string {
  if (!dateStr) return timeSlotStr || 'N/A';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const formattedDate = d.toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return `${formattedDate} at ${timeSlotStr}`;
  } catch {
    return `${dateStr} at ${timeSlotStr}`;
  }
}

function NewAppointmentContent() {
  const { user } = useAuthStore();
  const router = useRouter();

  const {
    step,
    patientType,
    selectedPatient,
    selectedDoctor,
    selectedDoctorId,
    selectedDate,
    selectedTimeSlot,
    type,
    reason,
    notes,
    confirmedAppointment,
    setStep,
    setPatientType,
    setSelectedPatient,
    setSelectedDoctor,
    setDateTime,
    setDetails,
    setConfirmedAppointment,
    resetWizard,
  } = useAppointmentWizardStore();

  // Gate Screen Existing Patient Lookup State
  const [mrnInput, setMrnInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);

  // New Patient Form State
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAge, setNewAge] = useState<number | ''>('');
  const [newGender, setNewGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [newEmergencyName, setNewEmergencyName] = useState('');
  const [newEmergencyPhone, setNewEmergencyPhone] = useState('');

  // Service Mutations
  const registerPatientMutation = useRegisterPatient();
  const createAppointmentMutation = useCreateAppointment();

  // Available Slots query
  const { data: daySchedule, isLoading: slotsLoading, refetch: refetchSlots } = useAvailableSlots(selectedDoctorId, selectedDate);

  const todayStr = new Date().toISOString().split('T')[0];
  const sixtyDaysObj = new Date();
  sixtyDaysObj.setDate(sixtyDaysObj.getDate() + 60);
  const sixtyDaysStr = sixtyDaysObj.toISOString().split('T')[0];
  const { data: availabilityOverview } = useDoctorAvailabilityDates(selectedDoctorId, todayStr, sixtyDaysStr);

  const [doctors, setDoctors] = useState<any[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(true);
  const [specializations, setSpecializations] = useState<Specialization[]>([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('');
  const [doctorSearch, setDoctorSearch] = useState<string>('');

  React.useEffect(() => {
    listSpecializations(true).then(setSpecializations).catch(() => {});
  }, []);

  React.useEffect(() => {
    setDoctorsLoading(true);
    listDoctors(user?.clinicId, selectedSpecialty)
      .then((data) => setDoctors(data || []))
      .catch(() => setDoctors([]))
      .finally(() => setDoctorsLoading(false));
  }, [user, selectedSpecialty]);

  // Existing Patient Lookup Handler
  const handleExistingPatientLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError(null);
    if (!mrnInput.trim()) {
      toast.error('Please enter an MRN.');
      return;
    }

    try {
      const { getPatientByMrn } = await import('@/services/patients.service');
      const rawPatient = await getPatientByMrn(mrnInput, phoneInput);
      const normalized = normalizePatient(rawPatient);

      if (!normalized || !normalized.name || !normalized.mrn) {
        toast.error('Patient record retrieved is incomplete. Please check MRN.');
        return;
      }

      setSelectedPatient(normalized);
      toast.success(`Patient ${normalized.name} (${normalized.mrn}) found!`);
      setStep(2);
    } catch (err: any) {
      setLookupError(err.userMessage || MESSAGES.MRN_NOT_FOUND);
      toast.error(err.userMessage || MESSAGES.MRN_NOT_FOUND);
    }
  };

  // New Patient Registration Handler
  const handleNewPatientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newFullName.trim();
    if (!trimmedName || !newPhone.trim()) {
      toast.error('Patient Full Name and Phone are required.');
      return;
    }

    try {
      const newPatientRaw = await registerPatientMutation.mutateAsync({
        fullName: trimmedName,
        phone: newPhone.trim(),
        age: Number(newAge) || 30,
        gender: newGender,
        emergencyContactName: newEmergencyName || 'Family Member',
        emergencyContactPhone: newEmergencyPhone || newPhone,
      });

      const normalized = normalizePatient({
        ...newPatientRaw,
        name: trimmedName,
        fullName: trimmedName,
        phone: newPhone.trim(),
        age: Number(newAge) || 30,
        gender: newGender,
      });

      if (!normalized || !normalized.name) {
        toast.error('Failed to normalize patient record. Please re-enter patient name.');
        return;
      }

      setSelectedPatient(normalized);
      toast.success(`New Patient ${normalized.name} registered! Code: ${normalized.mrn}`);
      setStep(2);
    } catch (err: any) {
      toast.error(err.userMessage || 'Failed to register patient.');
    }
  };

  // Final Appointment Submission
  const handleFinalSubmit = async () => {
    if (!selectedPatient || !selectedPatient.name || selectedPatient.name === 'Unknown') {
      toast.error('Patient details are missing. Please go back to Step 1 and re-select patient.');
      return;
    }

    if (!selectedDoctor || !selectedDoctor.id) {
      toast.error('Doctor selection is missing. Please go back to Step 2 and select an attending physician.');
      return;
    }

    if (!selectedDate || !selectedTimeSlot) {
      toast.error('Date and time slot selection is missing.');
      return;
    }

    // Re-verify slots right before booking
    await refetchSlots();

    try {
      const newApt = await createAppointmentMutation.mutateAsync({
        mrn: selectedPatient.mrn,
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        patientPhone: selectedPatient.phone,
        patientAge: selectedPatient.age,
        patientGender: selectedPatient.gender,
        doctorId: selectedDoctor.id,
        doctorName: selectedDoctor.name,
        date: selectedDate,
        timeSlot: selectedTimeSlot,
        type,
        reason: reason || 'General Consultation',
        notes,
      });

      setConfirmedAppointment(newApt);
      toast.success('Appointment booked successfully!');
    } catch {
      // Conflict error handled by mutation toast
    }
  };

  // Helper for Badge styling
  const getBadgeStyle = (label: string, sessionState: string) => {
    if (sessionState === 'IN_SESSION') return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300';
    if (sessionState === 'UPCOMING') return 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-300';
    if (sessionState === 'FULLY_BOOKED') return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300';
    if (sessionState === 'ENDED') return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-400';
    return 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300';
  };

  // Render Booking Confirmation Screen (Success Card)
  if (confirmedAppointment) {
    const isWaiting = confirmedAppointment.status === 'WAITING' || (confirmedAppointment as any).status === 'waiting';

    return (
      <div className="space-y-6 max-w-2xl mx-auto py-8">
        <Card className="p-8 sm:p-12 text-center rounded-3xl border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-900 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 mx-auto">
            <CheckCircle2 className="h-10 w-10 animate-bounce" />
          </div>

          <div className="space-y-2">
            <Badge variant="outline" className={`font-bold uppercase ${isWaiting ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300'}`}>
              {isWaiting ? 'Added to Waiting Queue' : 'Appointment Booked'}
            </Badge>
            <h1 className="text-3xl font-heading font-extrabold text-slate-900 dark:text-white">
              Appointment Booked
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              The appointment has been successfully created and logged into the clinic queue.
            </p>
          </div>

          {/* Joined Patient & Doctor Confirmation Card */}
          <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-left space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Patient Name</span>
                <span className="text-base font-extrabold text-slate-900 dark:text-white">
                  {confirmedAppointment.patientName}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">MRN</span>
                <MrnBadge mrn={confirmedAppointment.mrn} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Attending Physician</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {confirmedAppointment.doctorName}
                </span>
                <span className="text-[11px] text-teal-600 dark:text-teal-400 block font-medium">
                  {confirmedAppointment.doctorSpecialization || 'Specialist'}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Date & Time</span>
                <span className="font-bold text-teal-700 dark:text-teal-300 font-mono block">
                  {formatDisplayDateTime(confirmedAppointment.date, confirmedAppointment.timeSlot)}
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-500 block mt-1">
                  Status: <strong className="text-slate-800 dark:text-slate-200">{confirmedAppointment.status}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              variant="gradient"
              onClick={() => router.push('/appointments')}
              className="w-full sm:w-auto font-bold px-6 gap-2"
            >
              <span>View Appointment</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => resetWizard()}
              className="w-full sm:w-auto font-bold gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Book Another</span>
            </Button>
            <Button
              variant="ghost"
              onClick={() => router.push('/dashboard')}
              className="w-full sm:w-auto text-xs"
            >
              Back to Dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Clinic Appointment"
        subtitle="Staff Reception Wizard — Book consultation slots for new or existing patients"
      />

      <WorkflowBanner />

      <Card className="p-6 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs">
        <Stepper currentStep={step} steps={WIZARD_STEPS} />
      </Card>

      {/* ---------------------------------------------------------------------- */}
      {/* STEP 1: PATIENT SELECTION */}
      {/* ---------------------------------------------------------------------- */}
      {step === 1 && (
        <div className="space-y-6">
          {!patientType ? (
            <div className="space-y-4">
              <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-white text-center">
                Has this patient been checked by this doctor before?
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
                <Card
                  onClick={() => setPatientType('EXISTING')}
                  className="p-8 rounded-3xl border-2 border-slate-200 dark:border-slate-800 hover:border-teal-500 dark:hover:border-teal-400 bg-white dark:bg-slate-900 hover:bg-teal-50/30 dark:hover:bg-teal-950/20 transition-all cursor-pointer text-center space-y-4 group shadow-sm"
                >
                  <div className="h-16 w-16 rounded-2xl bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 flex items-center justify-center mx-auto group-hover:scale-105 transition-transform">
                    <UserCheck className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold font-heading text-slate-900 dark:text-white">
                      YES, Existing Patient
                    </h3>
                    <p className="text-xs text-slate-500">
                      Search using Medical Record Number (MRN-#####) & Phone number.
                    </p>
                  </div>
                  <Button variant="outline" className="w-full text-xs font-bold border-teal-500 text-teal-700">
                    Find Existing Record →
                  </Button>
                </Card>

                <Card
                  onClick={() => setPatientType('NEW')}
                  className="p-8 rounded-3xl border-2 border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-400 bg-white dark:bg-slate-900 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 transition-all cursor-pointer text-center space-y-4 group shadow-sm"
                >
                  <div className="h-16 w-16 rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center mx-auto group-hover:scale-105 transition-transform">
                    <UserPlus className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold font-heading text-slate-900 dark:text-white">
                      NO, New Patient
                    </h3>
                    <p className="text-xs text-slate-500">
                      Register a new patient and generate a unique sequential MRN code.
                    </p>
                  </div>
                  <Button variant="outline" className="w-full text-xs font-bold border-emerald-500 text-emerald-700">
                    Register New Patient →
                  </Button>
                </Card>
              </div>
            </div>
          ) : patientType === 'EXISTING' ? (
            <Card className="max-w-xl mx-auto p-6 sm:p-8 rounded-3xl border border-slate-200/80 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white font-heading">
                  Find Existing Patient Record
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setPatientType(null)} className="text-xs">
                  Change Selection
                </Button>
              </div>

              {lookupError && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <span>{lookupError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPatientType('NEW')}
                    className="text-xs font-bold text-teal-700 underline block cursor-pointer"
                  >
                    Register as new patient instead →
                  </button>
                </div>
              )}

              <form onSubmit={handleExistingPatientLookup} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold block mb-1">Medical Record Number (MRN) *</label>
                  <Input
                    value={mrnInput}
                    onChange={(e) => setMrnInput(e.target.value.toUpperCase())}
                    placeholder="MRN-10022"
                    className="font-mono text-sm font-bold uppercase"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">Contact Phone Number (Optional Verification)</label>
                  <Input
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="+92 300 1234567"
                  />
                </div>

                <Button type="submit" variant="gradient" className="w-full h-11 text-sm font-bold gap-2 cursor-pointer">
                  <Search className="h-4 w-4" />
                  <span>Find Patient & Continue</span>
                </Button>
              </form>
            </Card>
          ) : (
            <Card className="max-w-2xl mx-auto p-6 sm:p-8 rounded-3xl border border-slate-200/80 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white font-heading">
                  Register New Patient
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setPatientType(null)} className="text-xs">
                  Change Selection
                </Button>
              </div>

              <form onSubmit={handleNewPatientSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold block mb-1">Full Name *</label>
                    <Input
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                      placeholder="Ali Khan"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">Phone Number *</label>
                    <Input
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="+92 300 1234567"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold block mb-1">Age *</label>
                    <Input
                      type="number"
                      value={newAge}
                      onChange={(e) => setNewAge(parseInt(e.target.value))}
                      required
                      min={0}
                      max={120}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">Gender *</label>
                    <Select value={newGender} onChange={(e) => setNewGender(e.target.value as any)}>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold block mb-1">Emergency Contact Name</label>
                    <Input
                      value={newEmergencyName}
                      onChange={(e) => setNewEmergencyName(e.target.value)}
                      placeholder="Family Member"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">Emergency Contact Phone</label>
                    <Input
                      value={newEmergencyPhone}
                      onChange={(e) => setNewEmergencyPhone(e.target.value)}
                      placeholder="+92 312 9876543"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={registerPatientMutation.isPending}
                  variant="gradient"
                  className="w-full h-11 text-sm font-bold gap-2 cursor-pointer"
                >
                  {registerPatientMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Registering & Generating MRN...
                    </>
                  ) : (
                    <>
                      <span>Register Patient & Generate MRN</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </Card>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* STEP 2: DOCTOR SELECTION */}
      {/* ---------------------------------------------------------------------- */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold font-heading text-slate-900 dark:text-white">
                Select Attending Physician
              </h2>
              <p className="text-xs text-slate-500">
                Every onboarded doctor in {user?.clinicName || 'your clinic'} is listed below with live session status.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStep(1)} className="text-xs gap-1 cursor-pointer">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search doctor name or specialization..."
                className="pl-10 h-10 text-xs"
                value={doctorSearch}
                onChange={(e) => setDoctorSearch(e.target.value)}
              />
            </div>

            <Select
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
              className="w-full sm:w-64 h-10 text-xs"
            >
              <option value="">All Specializations</option>
              {specializations.map((spec) => (
                <option key={spec.id} value={spec.slug}>
                  {spec.name} ({spec.count || 0})
                </option>
              ))}
            </Select>
          </div>

          {doctorsLoading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading clinic doctors directory...</div>
          ) : doctors.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl space-y-2">
              <AlertCircle className="h-8 w-8 text-slate-400 mx-auto" />
              <p className="font-bold">No doctors found matching filter.</p>
              <p className="text-xs text-slate-400">Try clearing your search query or specialization selection.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {doctors
                .filter((doc) => {
                  if (!doctorSearch.trim()) return true;
                  const q = doctorSearch.toLowerCase();
                  return (
                    doc.fullName?.toLowerCase().includes(q) ||
                    doc.name?.toLowerCase().includes(q) ||
                    doc.specializations?.some((s: any) => s.name?.toLowerCase().includes(q))
                  );
                })
                .map((doc) => {
                  const isSelected = selectedDoctorId === doc.id;
                  const canBook = doc.canTakeBooking;

                  return (
                    <Card
                      key={doc.id}
                      onClick={() => {
                        if (canBook) {
                          setSelectedDoctor(doc);
                        } else {
                          toast.warning(doc.disabledReason || 'Doctor is not available for booking today.');
                        }
                      }}
                      className={`p-5 rounded-3xl border-2 transition-all flex flex-col justify-between space-y-4 ${
                        !canBook
                          ? 'opacity-65 bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 cursor-not-allowed'
                          : isSelected
                          ? 'border-teal-600 bg-teal-50/40 dark:bg-teal-950/20 shadow-md ring-2 ring-teal-500/10 cursor-pointer'
                          : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-slate-300 cursor-pointer'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-2xl bg-teal-600/10 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 flex items-center justify-center font-bold text-lg font-heading shrink-0">
                              {(doc.fullName || doc.name || 'D').replace(/^Dr\.\s*/i, '').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-slate-900 dark:text-white font-heading">
                                Dr. {(doc.fullName || doc.name || 'Doctor').replace(/^Dr\.\s*/i, '')}
                              </h3>
                              <span className="text-[11px] text-slate-500">{doc.qualification || 'Physician'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Live Session Badge */}
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0.5 ${getBadgeStyle(doc.badgeLabel, doc.sessionState)}`}>
                            {doc.badgeLabel}
                          </Badge>
                          <span className="text-[10px] font-mono text-slate-400">
                            {doc.workingHours}
                          </span>
                        </div>

                        {/* Specializations */}
                        <div className="flex flex-wrap gap-1">
                          {doc.specializations?.map((spec: any) => (
                            <Badge key={spec.id} variant="secondary" className="text-[9px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {spec.name} {spec.yearsExperience ? `(${spec.yearsExperience}y exp)` : ''}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Card Footer */}
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-xs space-y-2 mt-auto">
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>Free slots today: <strong className="text-teal-700 dark:text-teal-400">{doc.freeSlotsCountToday}</strong></span>
                          <span>Waiting: <strong className="text-amber-600 dark:text-amber-400">{doc.waitingCountToday}</strong></span>
                        </div>

                        {!canBook && doc.nextAvailableDate && (
                          <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                            <Info className="h-3.5 w-3.5" />
                            <span>Next available: {doc.nextAvailableDate}</span>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button
              variant="gradient"
              disabled={!selectedDoctorId || !selectedDoctor}
              onClick={() => {
                if (!selectedDoctor || !selectedDoctor.name) {
                  toast.error('Please select an attending doctor.');
                  return;
                }
                setStep(3);
              }}
              className="font-bold px-8 gap-2 cursor-pointer"
            >
              <span>Next: Select Date & Time</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* STEP 3: DATE & TIME SLOT SELECTION */}
      {/* ---------------------------------------------------------------------- */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold font-heading text-slate-900 dark:text-white">
                Select Date & Available Time Slot
              </h2>
              <p className="text-xs text-slate-500">Single source of truth server slot calculation</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStep(2)} className="text-xs gap-1 cursor-pointer">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </Button>
          </div>

          {/* IN_SESSION INFO BANNER */}
          {daySchedule?.sessionState === 'IN_SESSION' && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-3 animate-in fade-in duration-300">
              <Info className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <strong className="block text-sm">Doctor is currently in session</strong>
                <span>The patient will be added directly to the waiting queue upon booking.</span>
              </div>
            </div>
          )}

          <Card className="p-6 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                Select Available Doctor Date *
              </label>

              <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {availabilityOverview?.dates?.map((d: any) => {
                  const isSel = d.date === selectedDate;
                  const isAvail = d.isAvailable;
                  const dayName = new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });

                  return (
                    <button
                      key={d.date}
                      type="button"
                      disabled={!isAvail}
                      onClick={() => setDateTime(d.date, '')}
                      className={`p-3 rounded-2xl border text-center transition-all shrink-0 min-w-[95px] space-y-1 ${
                        isSel
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 ring-2 ring-teal-500/20 shadow-sm cursor-pointer'
                          : isAvail
                          ? 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-slate-300 cursor-pointer'
                          : 'border-slate-200/50 bg-slate-50/50 dark:border-slate-800/40 dark:bg-slate-950/40 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase block text-slate-400">{dayName}</span>
                      <span className="text-sm font-extrabold font-mono block text-slate-900 dark:text-white">{d.date.substring(5)}</span>
                      {isAvail ? (
                        <span className="text-[10px] font-bold text-emerald-600 block">{d.freeSlotsCount} slots</span>
                      ) : (
                        <span className="text-[9px] font-semibold text-slate-400 block">{d.disabledReason || 'Unavailable'}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <span className="text-xs text-slate-500">Or choose specific date:</span>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setDateTime(e.target.value, '')}
                  min={new Date().toISOString().split('T')[0]}
                  className="h-9 text-xs font-bold rounded-xl w-40"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Time Slots Grid ({selectedDate})
                </label>
                {daySchedule?.workingHours && (
                  <span className="text-xs text-slate-400 font-mono">Working Hours: {daySchedule.workingHours}</span>
                )}
              </div>

              {slotsLoading ? (
                <div className="p-8 text-center text-xs text-slate-400">Computing available slots...</div>
              ) : !daySchedule || daySchedule.sessionState === 'NOT_SCHEDULED' ? (
                <div className="p-6 text-center text-xs text-slate-500 border rounded-2xl bg-slate-50 dark:bg-slate-950 space-y-2">
                  <p className="font-bold text-slate-700 dark:text-slate-300">Doctor Not Available On {selectedDate}</p>
                  <p>{daySchedule?.disabledReason || 'Schedule not configured for this date.'}</p>
                  {daySchedule?.nextAvailableDate && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDateTime(daySchedule.nextAvailableDate!, '')}
                      className="text-xs font-bold border-teal-500 text-teal-700 mt-2 cursor-pointer"
                    >
                      Jump to Next Available Date ({daySchedule.nextAvailableDate})
                    </Button>
                  )}
                </div>
              ) : daySchedule.sessionState === 'FULLY_BOOKED' || (daySchedule.slots?.filter(s => s.isAvailable).length === 0) ? (
                <div className="p-6 text-center text-xs text-amber-800 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl space-y-2">
                  <p className="font-bold text-sm">No slots left today ({selectedDate})</p>
                  <p>{daySchedule.disabledReason || 'All appointment slots have been taken or passed.'}</p>
                  {daySchedule.nextAvailableDate && (
                    <Button
                      variant="gradient"
                      size="sm"
                      onClick={() => setDateTime(daySchedule.nextAvailableDate!, '')}
                      className="text-xs font-bold mt-2 cursor-pointer"
                    >
                      Book Next Available Date ({daySchedule.nextAvailableDate})
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {daySchedule.slots?.map((slot) => {
                    const isSelected = selectedTimeSlot === slot.time;
                    const isDisabled = !slot.isAvailable;

                    let badgeText = 'Available';
                    let btnStyle = 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-teal-500';

                    if (slot.state === 'booked') {
                      badgeText = slot.bookedByPatientName ? `Booked (${slot.bookedByPatientName})` : 'Booked';
                      btnStyle = 'bg-rose-50 dark:bg-rose-950/40 text-rose-500 border-rose-200 cursor-not-allowed line-through';
                    } else if (slot.state === 'past') {
                      badgeText = 'Ended / Past';
                      btnStyle = 'bg-slate-100 dark:bg-slate-800/50 text-slate-400 border-slate-200 cursor-not-allowed line-through';
                    } else if (slot.state === 'break') {
                      badgeText = 'Break Time';
                      btnStyle = 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 border-amber-200 cursor-not-allowed';
                    } else if (isSelected) {
                      btnStyle = 'bg-teal-600 text-white border-teal-600 shadow-md ring-2 ring-teal-500/20';
                    }

                    return (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setDateTime(selectedDate, slot.time)}
                        className={`p-3 rounded-2xl border text-xs font-bold transition-all text-center cursor-pointer ${btnStyle}`}
                      >
                        <div>{slot.time}</div>
                        {isDisabled && (
                          <span className="text-[9px] font-normal block no-underline opacity-85 mt-0.5">{badgeText}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          <div className="flex justify-end pt-4">
            <Button
              variant="gradient"
              disabled={!selectedTimeSlot}
              onClick={() => setStep(4)}
              className="font-bold px-8 gap-2 cursor-pointer"
            >
              <span>Next: Details & Notes</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* STEP 4: APPOINTMENT DETAILS */}
      {/* ---------------------------------------------------------------------- */}
      {step === 4 && (
        <div className="space-y-6 max-w-2xl mx-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold font-heading text-slate-900 dark:text-white">
              Appointment Reason & Details
            </h2>
            <Button variant="outline" size="sm" onClick={() => setStep(3)} className="text-xs gap-1 cursor-pointer">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </Button>
          </div>

          <Card className="p-6 sm:p-8 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div>
              <label className="text-xs font-semibold block mb-1">Appointment Type *</label>
              <Select value={type} onChange={(e) => setDetails(e.target.value as any, reason, notes)}>
                <option value="Consultation">Consultation</option>
                <option value="Follow-up">Follow-up</option>
                <option value="Procedure">Procedure</option>
                <option value="Emergency">Emergency</option>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1">Reason for Visit / Symptoms *</label>
              <Textarea
                value={reason}
                onChange={(e) => setDetails(type, e.target.value, notes)}
                placeholder="Describe chief symptoms or reason for visit..."
                className="min-h-[100px]"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1">Reception Notes (Optional)</label>
              <Input
                value={notes}
                onChange={(e) => setDetails(type, reason, e.target.value)}
                placeholder="Internal reception notes..."
              />
            </div>
          </Card>

          <div className="flex justify-end pt-4">
            <Button
              variant="gradient"
              disabled={!reason.trim()}
              onClick={() => setStep(5)}
              className="font-bold px-8 gap-2 cursor-pointer"
            >
              <span>Next: Review & Confirm</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* STEP 5: REVIEW & CONFIRM */}
      {/* ---------------------------------------------------------------------- */}
      {step === 5 && (
        <div className="space-y-6 max-w-3xl mx-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold font-heading text-slate-900 dark:text-white">
              Review Appointment & Submit
            </h2>
            <Button variant="outline" size="sm" onClick={() => setStep(4)} className="text-xs gap-1 cursor-pointer">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Patient Card */}
            <Card className="p-6 rounded-3xl border border-teal-200/80 dark:border-teal-900/60 bg-white dark:bg-slate-900 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-teal-100 dark:border-teal-900/40 pb-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-teal-600" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Patient Details</h3>
                </div>
                <MrnBadge mrn={selectedPatient?.mrn} />
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Patient Name</span>
                  <span className="text-base font-extrabold text-slate-900 dark:text-white">
                    {selectedPatient?.name || 'Patient'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Age / Gender</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedPatient?.age || '--'} yrs / {selectedPatient?.gender || 'Unknown'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Phone</span>
                    <span className="font-semibold font-mono text-slate-800 dark:text-slate-200">
                      {selectedPatient?.phone || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Doctor Card */}
            <Card className="p-6 rounded-3xl border border-teal-200/80 dark:border-teal-900/60 bg-white dark:bg-slate-900 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-teal-100 dark:border-teal-900/40 pb-3">
                <Stethoscope className="h-4 w-4 text-teal-600" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Attending Physician</h3>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Doctor Name</span>
                  <span className="text-base font-extrabold text-slate-900 dark:text-white">
                    {selectedDoctor?.name || 'Doctor'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Specialization</span>
                    <span className="font-semibold text-teal-700 dark:text-teal-400">
                      {selectedDoctor?.specialization || 'Specialist'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Experience</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedDoctor?.yearsExperience || 5} yrs experience
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Appointment Schedule & Visit Reason Card */}
          <Card className="p-6 sm:p-8 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <CalendarIcon className="h-4 w-4 text-teal-600" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Schedule & Visit Reason</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Scheduled Date & Time</span>
                <span className="font-bold text-teal-700 dark:text-teal-300 font-mono text-sm">
                  {formatDisplayDateTime(selectedDate, selectedTimeSlot)}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Expected Initial Status</span>
                <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                  {daySchedule?.sessionState === 'IN_SESSION' ? 'Waiting Queue (Doctor in session)' : 'Scheduled'}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Reason for Visit</span>
              <p className="text-slate-800 dark:text-slate-200 italic font-sans">&quot;{reason}&quot;</p>
            </div>

            {notes && (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Reception Notes</span>
                <p className="text-slate-700 dark:text-slate-300 font-mono">{notes}</p>
              </div>
            )}

            <Button
              onClick={handleFinalSubmit}
              disabled={createAppointmentMutation.isPending || !selectedPatient?.name || !selectedDoctor?.name}
              variant="gradient"
              className="w-full h-12 text-sm font-bold gap-2 mt-4 cursor-pointer"
            >
              {createAppointmentMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Creating Appointment...
                </>
              ) : (
                <>
                  <span>Confirm & Book Appointment</span>
                  <CheckCircle2 className="h-4 w-4" />
                </>
              )}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function NewAppointmentPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading appointment wizard...</div>}>
      <NewAppointmentContent />
    </Suspense>
  );
}
