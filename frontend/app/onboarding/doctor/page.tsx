'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/components/auth-provider';
import { saveOnboardingStep } from '@/services/auth.service';
import { formatCnicInput, validateCnicPattern, maskCnicDisplay } from '@/lib/cnic';
import { CalendarPicker } from '@/components/calendar-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select } from '@/components/ui/select';
import {
  Stethoscope,
  Plus,
  Trash2,
  Clock,
  Award,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Lock,
  Calendar,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

export interface AvailabilityRow {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  slot_minutes: number;
}

const infoSchema = z.object({
  cnic: z
    .string()
    .trim()
    .min(13, 'CNIC must be 13 digits (XXXXX-XXXXXXX-X)')
    .regex(/^\d{5}-\d{7}-\d$/, 'Invalid CNIC format. Must be XXXXX-XXXXXXX-X'),
  qualification: z.string().trim().min(2, 'Qualification is required (e.g. MBBS, FCPS).'),
  licenseNumber: z.string().trim().min(2, 'Medical license number is required.'),
  clinicName: z.string().trim().min(2, 'Hospital / Clinic name is required.'),
});

type InfoValues = z.infer<typeof infoSchema>;

const PRESET_SPECIALIZATIONS = [
  'General Physician',
  'Cardiology',
  'Dermatology',
  'Pediatrics',
  'Gynecology & Obstetrics',
  'Orthopedics',
  'ENT',
  'Ophthalmology',
  'Neurology',
  'Psychiatry',
  'Surgery',
];

interface SpecItem {
  name: string;
  experience_years: number;
  is_primary: boolean;
}

export default function CompleteProfilePage() {
  const router = useRouter();
  const { user, refreshSession } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  // CNIC state & Lock status
  const isCnicLocked = !!(user?.cnic && user.cnic.trim() !== '');

  // Step 1 Form
  const {
    register: registerInfo,
    handleSubmit: handleSubmitInfo,
    setValue,
    watch,
    formState: { errors: errorsInfo },
  } = useForm<InfoValues>({
    resolver: zodResolver(infoSchema),
    defaultValues: {
      cnic: user?.cnic ? formatCnicInput(user.cnic) : '',
      qualification: '',
      licenseNumber: user?.licenseNumber || '',
      clinicName: user?.clinicName || 'City Central Hospital',
    },
  });

  const cnicValue = watch('cnic') || '';

  const handleCnicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isCnicLocked) return;
    const formatted = formatCnicInput(e.target.value);
    setValue('cnic', formatted, { shouldValidate: true });
  };

  // Step 2 State (Specializations)
  const [specializations, setSpecializations] = useState<SpecItem[]>([
    { name: user?.specialization || 'General Physician', experience_years: 5, is_primary: true },
  ]);
  const [newSpecName, setNewSpecName] = useState('');
  const [newSpecExp, setNewSpecExp] = useState(3);

  // Step 3 State: Simple Row-Based Availability List

  const [dailyLimit, setDailyLimit] = useState(20);
  const [rows, setRows] = useState<AvailabilityRow[]>([
    { id: 'row-0', date: todayStr, start_time: '09:00', end_time: '17:00', slot_minutes: 30 },
  ]);
  const [rowErrors, setRowErrors] = useState<Record<number, Record<string, string>>>({});

  const addEmptyRow = () => {
    setRows((prev) => [
      ...prev,
      { id: `row-${Date.now()}-${Math.random()}`, date: todayStr, start_time: '09:00', end_time: '17:00', slot_minutes: 30 },
    ]);
  };

  const removeRow = (id: string) => {
    if (rows.length === 1) {
      toast.error('At least one availability row is required.');
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    setRowErrors({});
  };

  const updateRow = (index: number, field: keyof AvailabilityRow, value: any) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });

    setRowErrors((prev) => {
      if (!prev[index] || !prev[index][field]) return prev;
      const copy = { ...prev };
      const rowCopy = { ...copy[index] };
      delete rowCopy[field];
      if (Object.keys(rowCopy).length === 0) {
        delete copy[index];
      } else {
        copy[index] = rowCopy;
      }
      return copy;
    });
  };

  const onStep1Submit = async (data: InfoValues) => {
    if (!user) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await saveOnboardingStep(
        user.id,
        1,
        {
          qualification: data.qualification,
          license_number: data.licenseNumber,
          clinic_name: data.clinicName,
          cnic: data.cnic,
        },
        false
      );
      setStep(2);
    } catch (err: any) {
      const msg = err.message || 'Failed to save profile info.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addSpecialization = () => {
    if (!newSpecName.trim()) return;
    if (specializations.some((s) => s.name.toLowerCase() === newSpecName.trim().toLowerCase())) {
      toast.error('Specialization already added.');
      return;
    }
    setSpecializations([
      ...specializations,
      { name: newSpecName.trim(), experience_years: Number(newSpecExp) || 1, is_primary: specializations.length === 0 },
    ]);
    setNewSpecName('');
  };

  const removeSpecialization = (index: number) => {
    const updated = specializations.filter((_, idx) => idx !== index);
    if (updated.length > 0 && !updated.some((s) => s.is_primary)) {
      updated[0].is_primary = true;
    }
    setSpecializations(updated);
  };

  const onStep2Submit = async () => {
    if (!user) return;
    if (specializations.length === 0) {
      toast.error('Please add at least one specialization.');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await saveOnboardingStep(user.id, 2, { specializations }, false);
      setStep(3);
    } catch (err: any) {
      const msg = err.message || 'Failed to save specializations.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onStep3Submit = async () => {
    if (!user) return;

    // Client-side row validations
    const errors: Record<number, Record<string, string>> = {};
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.date) {
        if (!errors[i]) errors[i] = {};
        errors[i].date = 'Date is required';
      } else if (r.date < todayStr) {
        if (!errors[i]) errors[i] = {};
        errors[i].date = 'Past dates cannot be selected';
      }

      const [sH, sM] = (r.start_time || '00:00').split(':').map(Number);
      const [eH, eM] = (r.end_time || '00:00').split(':').map(Number);
      const sMins = sH * 60 + sM;
      const eMins = eH * 60 + eM;

      if (r.date === todayStr && sMins <= currentMins) {
        if (!errors[i]) errors[i] = {};
        errors[i].start_time = 'Start time for today must be in the future';
      }

      if (eMins <= sMins) {
        if (!errors[i]) errors[i] = {};
        errors[i].end_time = 'End time must be after start time';
      } else if (eMins - sMins < Number(r.slot_minutes)) {
        if (!errors[i]) errors[i] = {};
        errors[i].slot_minutes = `Range must fit at least one ${r.slot_minutes}-minute slot`;
      }

      // Check internal overlap
      for (let j = i + 1; j < rows.length; j++) {
        const other = rows[j];
        if (r.date === other.date) {
          const [osH, osM] = (other.start_time || '00:00').split(':').map(Number);
          const [oeH, oeM] = (other.end_time || '00:00').split(':').map(Number);
          const osMins = osH * 60 + osM;
          const oeMins = oeH * 60 + oeM;
          if (sMins < oeMins && eMins > osMins) {
            if (!errors[i]) errors[i] = {};
            errors[i].start_time = `Overlaps with row ${j + 1} on ${r.date}`;
            if (!errors[j]) errors[j] = {};
            errors[j].start_time = `Overlaps with row ${i + 1} on ${r.date}`;
          }
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setRowErrors(errors);
      toast.error('Please fix the highlighted fields in your availability rows.');
      return;
    }

    setRowErrors({});
    setIsSubmitting(true);
    setErrorMessage(null);

    const payload = {
      daily_patient_limit: Number(dailyLimit),
      items: rows.map((r) => ({
        date: r.date,
        start_time: r.start_time,
        end_time: r.end_time,
        slot_minutes: Number(r.slot_minutes),
      })),
    };

    try {
      await saveOnboardingStep(user.id, 3, payload, true);
      await refreshSession();
      toast.success('Doctor profile setup complete!');
      router.replace('/doctor/dashboard');
    } catch (err: any) {
      const msg = err.userMessage || err.message || 'Failed to save availability schedule.';
      setErrorMessage(msg);
      toast.error(msg);

      if (err.details && Array.isArray(err.details)) {
        const backendErrs: Record<number, Record<string, string>> = {};
        for (const d of err.details) {
          if (typeof d.index === 'number' && d.field) {
            if (!backendErrs[d.index]) backendErrs[d.index] = {};
            backendErrs[d.index][d.field] = d.message;
          }
        }
        if (Object.keys(backendErrs).length > 0) {
          setRowErrors(backendErrs);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 flex items-center justify-center">
      <Card className="w-full max-w-2xl p-6 sm:p-8 rounded-3xl border border-slate-200/80 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold font-heading text-slate-900 dark:text-white">
                Complete Physician Profile
              </h1>
              <p className="text-xs text-slate-500">
                Set up your credentials, specializations, and daily schedule
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300 font-bold">
            Step {step} of 3
          </Badge>
        </div>

        <Progress value={(step / 3) * 100} className="h-2 rounded-full" />

        {errorMessage && (
          <div role="alert" className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/50 dark:border-red-900 dark:text-red-300 flex items-start gap-3 text-sm font-medium">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* STEP 1: Credentials & Information */}
        {step === 1 && (
          <form onSubmit={handleSubmitInfo(onStep1Submit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>CNIC Number *</span>
                  {isCnicLocked && (
                    <span className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Locked after save
                    </span>
                  )}
                </label>
                <div className="relative">
                  <Input
                    placeholder="42101-1234567-1"
                    value={isCnicLocked ? maskCnicDisplay(cnicValue) : cnicValue}
                    disabled={isCnicLocked}
                    onChange={handleCnicChange}
                    className="h-11 rounded-xl font-mono text-sm"
                  />
                  {isCnicLocked && (
                    <div className="absolute right-3 top-3 text-slate-400">
                      <Lock className="h-4 w-4" />
                    </div>
                  )}
                </div>
                {errorsInfo.cnic && <p className="text-xs text-red-600 mt-1">{errorsInfo.cnic.message}</p>}
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                  Qualification *
                </label>
                <Input placeholder="MBBS, FCPS (Cardiology)" {...registerInfo('qualification')} className="h-11 rounded-xl" />
                {errorsInfo.qualification && <p className="text-xs text-red-600 mt-1">{errorsInfo.qualification.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                  Medical License Number *
                </label>
                <Input placeholder="DOC-8890-PK" {...registerInfo('licenseNumber')} className="h-11 rounded-xl" />
                {errorsInfo.licenseNumber && <p className="text-xs text-red-600 mt-1">{errorsInfo.licenseNumber.message}</p>}
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                  Hospital / Clinic Name *
                </label>
                <Input placeholder="City Central Hospital" {...registerInfo('clinicName')} className="h-11 rounded-xl" />
                {errorsInfo.clinicName && <p className="text-xs text-red-600 mt-1">{errorsInfo.clinicName.message}</p>}
              </div>
            </div>

            <Button type="submit" disabled={isSubmitting} variant="gradient" className="w-full h-11 font-bold gap-2 rounded-xl mt-4 cursor-pointer">
              {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <span>Next: Specializations</span>}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        )}

        {/* STEP 2: Multiple Specializations with Years Experience */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Add Specialization</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Select value={newSpecName} onChange={(e) => setNewSpecName(e.target.value)} className="h-10 text-xs">
                  <option value="">Select or type custom</option>
                  {PRESET_SPECIALIZATIONS.map((spec) => (
                    <option key={spec} value={spec}>
                      {spec}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  placeholder="Years Exp"
                  value={newSpecExp}
                  onChange={(e) => setNewSpecExp(Number(e.target.value))}
                  className="h-10 text-xs rounded-xl"
                />
                <Button type="button" onClick={addSpecialization} variant="gradient" className="h-10 text-xs font-bold gap-1 rounded-xl cursor-pointer">
                  <Plus className="h-4 w-4" />
                  <span>Add</span>
                </Button>
              </div>
            </div>

            {/* List of Specializations */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Configured Specializations</p>
              {specializations.map((spec, idx) => (
                <div key={idx} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Award className="h-4 w-4 text-teal-600" />
                    <div>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{spec.name}</span>
                      <span className="text-xs text-slate-500 ml-2">({spec.experience_years} years exp)</span>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeSpecialization(idx)} className="text-red-500 hover:text-red-700 h-8 w-8 p-0 cursor-pointer">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1 h-11 rounded-xl gap-2 cursor-pointer">
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>
              <Button type="button" onClick={onStep2Submit} disabled={isSubmitting} variant="gradient" className="flex-1 h-11 rounded-xl gap-2 font-bold cursor-pointer">
                {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <span>Next: Availability Schedule</span>}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Simple Row-Based Availability List & Daily Limit */}
        {step === 3 && (
          <div className="space-y-5">
            {/* Daily Limit Input */}
            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                Maximum Patient Limit Per Day (Daily Limit) *
              </label>
              <Input
                type="number"
                min={1}
                max={150}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value))}
                className="h-11 rounded-xl"
              />
              <p className="text-xs text-slate-400 mt-1">Prevents overbooking once patient count reaches this number.</p>
            </div>

            {/* Availability Rows Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-teal-600" />
                  Practice Availability Schedule *
                </h3>
                <p className="text-xs text-slate-500">Each row represents an independent date and time range.</p>
              </div>
              <Badge variant="outline" className="text-xs font-mono">
                {rows.length} {rows.length === 1 ? 'Row' : 'Rows'}
              </Badge>
            </div>

            {/* List of Availability Rows */}
            <div className="space-y-4">
              {rows.map((row, index) => (
                <Card
                  key={row.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-700 dark:text-teal-300 uppercase tracking-wider">
                      Row #{index + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1}
                      className="text-red-500 hover:text-red-700 dark:hover:text-red-400 h-8 w-8 p-0 cursor-pointer disabled:opacity-40"
                      title="Remove Row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    {/* Date Field */}
                    <div>
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                        Date *
                      </label>
                      <Input
                        type="date"
                        min={todayStr}
                        value={row.date}
                        onChange={(e) => updateRow(index, 'date', e.target.value)}
                        className={`h-10 text-xs rounded-xl ${rowErrors[index]?.date ? 'border-red-500 bg-red-50/40 dark:bg-red-950/20' : ''}`}
                      />
                      {rowErrors[index]?.date && (
                        <p className="text-[11px] font-semibold text-red-600 mt-1">{rowErrors[index].date}</p>
                      )}
                    </div>

                    {/* Start Time Field */}
                    <div>
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                        Start Time *
                      </label>
                      <Input
                        type="time"
                        value={row.start_time}
                        onChange={(e) => updateRow(index, 'start_time', e.target.value)}
                        className={`h-10 text-xs rounded-xl ${rowErrors[index]?.start_time ? 'border-red-500 bg-red-50/40 dark:bg-red-950/20' : ''}`}
                      />
                      {rowErrors[index]?.start_time && (
                        <p className="text-[11px] font-semibold text-red-600 mt-1">{rowErrors[index].start_time}</p>
                      )}
                    </div>

                    {/* End Time Field */}
                    <div>
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                        End Time *
                      </label>
                      <Input
                        type="time"
                        value={row.end_time}
                        onChange={(e) => updateRow(index, 'end_time', e.target.value)}
                        className={`h-10 text-xs rounded-xl ${rowErrors[index]?.end_time ? 'border-red-500 bg-red-50/40 dark:bg-red-950/20' : ''}`}
                      />
                      {rowErrors[index]?.end_time && (
                        <p className="text-[11px] font-semibold text-red-600 mt-1">{rowErrors[index].end_time}</p>
                      )}
                    </div>

                    {/* Slot Minutes Field */}
                    <div>
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                        Slot Duration *
                      </label>
                      <Select
                        value={row.slot_minutes.toString()}
                        onChange={(e) => updateRow(index, 'slot_minutes', Number(e.target.value))}
                        className={`h-10 text-xs rounded-xl ${rowErrors[index]?.slot_minutes ? 'border-red-500 bg-red-50/40 dark:bg-red-950/20' : ''}`}
                      >
                        <option value="10">10 Minutes</option>
                        <option value="15">15 Minutes</option>
                        <option value="20">20 Minutes</option>
                        <option value="30">30 Minutes</option>
                        <option value="60">60 Minutes</option>
                      </Select>
                      {rowErrors[index]?.slot_minutes && (
                        <p className="text-[11px] font-semibold text-red-600 mt-1">{rowErrors[index].slot_minutes}</p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Add Another Date Button */}
            <Button
              type="button"
              variant="outline"
              onClick={addEmptyRow}
              className="w-full h-11 rounded-xl border-dashed border-teal-500 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/50 font-bold gap-2 text-xs cursor-pointer"
            >
              <Plus className="h-4 w-4 text-teal-600" />
              <span>Add another date</span>
            </Button>

            <div className="flex items-center gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1 h-11 rounded-xl gap-2 cursor-pointer">
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Button>
              <Button type="button" onClick={onStep3Submit} disabled={isSubmitting} variant="gradient" className="flex-1 h-11 rounded-xl gap-2 font-bold cursor-pointer">
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Saving Profile...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Save Availability & Complete Profile</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

