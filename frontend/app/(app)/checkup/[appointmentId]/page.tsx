'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAppointment, useAppointments } from '@/features/appointments/hooks';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAgentStream } from '@/hooks/useAgentStream';
import { fetchApi } from '@/services/api-client';
import {
  Stethoscope,
  Pill,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  History,
  RefreshCw,
  Sparkles,
  ArrowLeft,
  MessageSquare,
  Send,
  X,
  FileText,
  User,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

export interface MedicineRow {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export default function CheckupPage() {
  const params = useParams();
  const router = useRouter();
  const appointmentId = params.appointmentId as string;
  const { user } = useAuthStore();

  const { data: appointment, isLoading: aptLoading } = useAppointment(appointmentId);
  const { data: queueData } = useAppointments({ doctorId: user?.id });
  const queueAppointments = Array.isArray(queueData) ? queueData : (queueData as any)?.appointments || [];

  // Checkup Start & State
  const [isStarted, setIsStarted] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Form State
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpPeriod, setFollowUpPeriod] = useState('7 Days');
  const [customFollowUp, setCustomFollowUp] = useState('');
  const [medicines, setMedicines] = useState<MedicineRow[]>([
    {
      id: 'med-1',
      name: 'Amlodipine Besylate',
      dosage: '5 mg',
      frequency: 'Once daily',
      duration: '14 Days',
      instructions: 'Take after breakfast.',
    },
  ]);

  // Saving & Completing State
  const [isSaving, setIsSaving] = useState(false);
  const [completedResult, setCompletedResult] = useState<any | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [showPastVisits, setShowPastVisits] = useState(false);

  // Patient History Details
  const [patientHistoryData, setPatientHistoryData] = useState<any | null>(null);

  // Auto Start Checkup on Mount
  useEffect(() => {
    if (!appointmentId || !user || user.role !== 'doctor') return;

    const startCheckup = async () => {
      try {
        await fetchApi(`/checkup/${appointmentId}/start`, { method: 'POST' });
        setIsStarted(true);
      } catch (err: any) {
        if (err.code === 'ALREADY_COMPLETED' || err.status === 409) {
          setIsStarted(true);
        } else {
          setStartError(err.userMessage || err.message || 'Failed to start checkup');
        }
      }
    };

    startCheckup();
  }, [appointmentId, user]);

  // Fetch Patient History
  const mrn = appointment?.mrn || (appointment as any)?.patients?.mrn || '';

  useEffect(() => {
    if (!mrn || !user) return;
    fetchApi(`/checkup/history/${mrn}`)
      .then((data) => setPatientHistoryData(data))
      .catch(() => setPatientHistoryData(null));
  }, [mrn, user, completedResult]);

  // Agent Stream Hook for Patient History
  const historyStream = useAgentStream({
    mrn,
    mode: 'history',
    enabled: !!mrn && isStarted,
  });

  const handleAddMedicine = () => {
    setMedicines([
      ...medicines,
      {
        id: `med-${Date.now()}`,
        name: '',
        dosage: '1 Tab',
        frequency: 'Twice daily',
        duration: '7 Days',
        instructions: 'After meals',
      },
    ]);
  };

  const handleRemoveMedicine = (id: string) => {
    setMedicines(medicines.filter((m) => m.id !== id));
  };

  const handleUpdateMedicine = (id: string, field: keyof MedicineRow, value: string) => {
    setMedicines(medicines.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const handleCompleteCheckup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!diagnosis.trim()) {
      toast.error('Please enter a clinical diagnosis.');
      return;
    }

    setIsSaving(true);
    try {
      const selectedPeriod = followUpPeriod === 'Custom' ? customFollowUp : followUpPeriod;

      const payload = {
        diagnosis: diagnosis.trim(),
        medicines: medicines.map((m) => ({
          name: m.name.trim(),
          dosage: m.dosage.trim(),
          frequency: m.frequency.trim(),
          duration: m.duration.trim(),
          instructions: m.instructions.trim(),
        })),
        notes: notes.trim(),
        followUpPeriod: selectedPeriod,
      };

      const result = await fetchApi(`/checkup/${appointmentId}/complete`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setCompletedResult(result);
      if (result.smsStatus === 'sent') {
        toast.success('Checkup completed & SMS sent to patient!');
      } else if (result.smsStatus === 'failed') {
        toast.warning('Checkup saved, but SMS delivery failed. You can resend using the AI panel.');
      } else {
        toast.success('Checkup completed successfully!');
      }
    } catch (err: any) {
      toast.error(err.userMessage || err.message || 'Failed to complete checkup.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResendSms = async (logId: string) => {
    if (!logId) return;
    setIsResending(true);
    try {
      const updatedLog = await fetchApi(`/message-logs/${logId}/resend`, { method: 'POST' });
      setCompletedResult((prev: any) => ({
        ...prev,
        messageLog: updatedLog,
        smsStatus: updatedLog.status === 'sent' ? 'sent' : 'failed',
      }));
      if (updatedLog.status === 'sent') {
        toast.success('SMS resent successfully!');
      } else {
        toast.error('Resend failed: ' + (updatedLog.error_reason || 'Provider error'));
      }
    } catch (err: any) {
      toast.error(err.userMessage || 'Failed to resend SMS');
    } finally {
      setIsResending(false);
    }
  };

  if (aptLoading || !appointment) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-3 text-slate-400">
        <RefreshCw className="h-6 w-6 animate-spin text-teal-600" />
        <span className="text-xs font-semibold">Opening Consultation Room...</span>
      </div>
    );
  }

  const patientObj = (appointment as any).patients || (appointment as any).patient || {};
  const patientName = appointment.patientName || patientObj.name || 'Patient';
  const patientPhone = appointment.patientPhone || patientObj.phone || '';
  const patientAge = appointment.patientAge || patientObj.age || '--';
  const patientGender = appointment.patientGender || patientObj.gender || '--';
  const allergies = patientHistoryData?.allergies || (patientObj.allergies ? patientObj.allergies.split(',') : []);

  const isOldPatient = historyStream.isReturning ?? (patientHistoryData?.isReturning ?? false);
  const visitCount = historyStream.visitCount ?? (patientHistoryData?.visitCount ?? 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title={`Consultation Room — ${patientName}`}
        subtitle={`MRN: ${mrn} • Attending: Dr. ${user?.fullName || ''}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowPastVisits(true)} className="text-xs font-bold gap-1">
              <History className="h-3.5 w-3.5 text-teal-600" />
              <span>Past Visits ({patientHistoryData?.visits?.length || 0})</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')} className="text-xs font-bold gap-1">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Return to Dashboard</span>
            </Button>
          </div>
        }
      />

      {/* Top Horizontal Patient Queue Bar */}
      {queueAppointments.length > 0 && (
        <Card className="p-4 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Users className="h-4 w-4 text-teal-600" />
              <span>Today's Patient Queue ({queueAppointments.length})</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Click patient to switch consultation</span>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto pb-1 pt-1 scrollbar-thin">
            {queueAppointments.map((apt: any) => {
              const isCurrent = apt.id === appointmentId;
              const pName = apt.patientName || apt.patients?.name || 'Patient';
              const pMrn = apt.mrn || apt.patients?.mrn || '';
              const aptStatus = (apt.status || 'SCHEDULED').toUpperCase();

              return (
                <button
                  key={apt.id}
                  onClick={() => router.push(`/checkup/${apt.id}`)}
                  className={`flex-shrink-0 p-3 rounded-2xl border text-left transition-all cursor-pointer min-w-[200px] ${
                    isCurrent
                      ? 'border-teal-500 bg-teal-50/70 dark:bg-teal-950/40 dark:border-teal-600 ring-2 ring-teal-500/20 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700 bg-slate-50/50 dark:bg-slate-950/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[130px]">{pName}</span>
                    <StatusBadge status={aptStatus as any} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>{pMrn}</span>
                    <span>{apt.timeSlot || apt.time_slot || ''}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Main 2-Column Desktop / Mobile Stacked Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: Patient Context, AI History Card, Prescription Builder */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Patient Details & Allergy Alert */}
          <Card className="p-5 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-teal-600 text-white font-bold flex items-center justify-center text-lg">
                  {patientName.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white font-heading">{patientName}</h3>
                  <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-400">{mrn}</span>
                </div>
              </div>
              <StatusBadge status={completedResult ? 'COMPLETED' : ((appointment.status ? appointment.status.toUpperCase() : 'IN_PROGRESS') as any)} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Age / Gender</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{patientAge} Y / {patientGender}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Phone</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">{patientPhone}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Patient Status</span>
                {isOldPatient ? (
                  <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200 border-teal-300 font-bold">
                    Old Patient ({visitCount} visits)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-slate-600 font-bold">
                    New Patient
                  </Badge>
                )}
              </div>
            </div>

            {allergies.length > 0 && (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200 space-y-1">
                <span className="font-bold uppercase text-[10px] flex items-center gap-1 text-rose-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Allergies Alert:
                </span>
                <p className="font-semibold">{allergies.join(', ')}</p>
              </div>
            )}
          </Card>

          {/* AI Patient History Card (Streaming & AI Summary) */}
          <Card className="p-5 sm:p-6 rounded-3xl border border-violet-200/80 bg-gradient-to-br from-violet-50/60 via-white to-violet-50/30 dark:border-violet-900/40 dark:from-violet-950/20 dark:to-slate-900 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400">
                <Sparkles className="h-4 w-4" />
                <span>Patient History (AI Agent)</span>
              </div>
              {isOldPatient ? (
                <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200 border-violet-300 font-bold text-[10px]">
                  Old Patient ({visitCount} visits)
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-500 font-bold text-[10px]">
                  New Patient
                </Badge>
              )}
            </div>

            {historyStream.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-violet-600 animate-pulse font-medium py-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>{historyStream.stepMessage || 'Analyzing history...'}</span>
              </div>
            ) : null}

            {isOldPatient ? (
              <div className="space-y-2">
                <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-sans bg-white/80 dark:bg-slate-950/60 p-4 rounded-2xl border border-violet-100 dark:border-violet-900/30 shadow-2xs">
                  {historyStream.tokens || historyStream.summary || 'Fetching history summary...'}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic p-3 bg-white/60 dark:bg-slate-950/40 rounded-2xl border border-slate-200/60">
                This is a new patient with no previous visit records for your clinic.
              </p>
            )}
          </Card>

          {/* Clinical Examination & Prescription Builder */}
          <Card className="p-6 sm:p-8 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-6 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-teal-600" />
                <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-white">
                  Clinical Examination & Prescription
                </h2>
              </div>
              <Badge variant="outline" className="text-xs font-mono">
                Date: {new Date().toISOString().split('T')[0]}
              </Badge>
            </div>

            <form onSubmit={handleCompleteCheckup} className="space-y-5">
              
              {/* Diagnosis */}
              <div>
                <label className="text-xs font-semibold block mb-1.5 text-slate-700 dark:text-slate-300">
                  Clinical Diagnosis *
                </label>
                <Input
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="e.g. Essential Hypertension / Upper Respiratory Infection"
                  required
                />
              </div>

              {/* Examination Notes */}
              <div>
                <label className="text-xs font-semibold block mb-1.5 text-slate-700 dark:text-slate-300">
                  Examination Notes & Clinical Findings
                </label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="BP 130/85, chest clear, regular heart rate..."
                  className="min-h-[80px]"
                />
              </div>

              {/* Medicines Builder */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Pill className="h-4 w-4 text-teal-600" />
                    <h3 className="text-sm font-bold font-heading text-slate-900 dark:text-white">
                      Prescription Items ({medicines.length})
                    </h3>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddMedicine}
                    className="text-xs font-bold gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Medicine</span>
                  </Button>
                </div>

                <div className="space-y-3">
                  {medicines.map((med, idx) => (
                    <div
                      key={med.id}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-600 dark:text-slate-400">Medicine #{idx + 1}</span>
                        {medicines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMedicine(med.id)}
                            className="text-rose-600 hover:text-rose-700 font-semibold p-1 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Medicine Name *</label>
                          <Input
                            value={med.name}
                            onChange={(e) => handleUpdateMedicine(med.id, 'name', e.target.value)}
                            placeholder="e.g. Amlodipine"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Dosage</label>
                          <Input
                            value={med.dosage}
                            onChange={(e) => handleUpdateMedicine(med.id, 'dosage', e.target.value)}
                            placeholder="5 mg"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Frequency</label>
                          <Input
                            value={med.frequency}
                            onChange={(e) => handleUpdateMedicine(med.id, 'frequency', e.target.value)}
                            placeholder="Once daily"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Duration</label>
                          <Input
                            value={med.duration}
                            onChange={(e) => handleUpdateMedicine(med.id, 'duration', e.target.value)}
                            placeholder="14 Days"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-400 block mb-0.5">Instructions</label>
                          <Input
                            value={med.instructions}
                            onChange={(e) => handleUpdateMedicine(med.id, 'instructions', e.target.value)}
                            placeholder="After breakfast"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Follow-up Period Recommendation */}
              <div className="pt-2">
                <label className="text-xs font-semibold block mb-1.5 text-slate-700 dark:text-slate-300">
                  Follow-up Recommendation
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select value={followUpPeriod} onChange={(e) => setFollowUpPeriod(e.target.value)}>
                    <option value="No Follow-up">No Follow-up</option>
                    <option value="After 3 Days">After 3 Days</option>
                    <option value="7 Days">After 7 Days</option>
                    <option value="2 Weeks">After 2 Weeks</option>
                    <option value="1 Month">After 1 Month</option>
                    <option value="Custom">Custom</option>
                  </Select>
                  {followUpPeriod === 'Custom' && (
                    <Input
                      value={customFollowUp}
                      onChange={(e) => setCustomFollowUp(e.target.value)}
                      placeholder="e.g. 10 Days"
                    />
                  )}
                </div>
              </div>

              {/* Submit & Save Checkup Button */}
              <div className="pt-4 flex justify-end">
                <Button
                  type="submit"
                  disabled={isSaving || !!completedResult}
                  variant="gradient"
                  className="h-12 px-8 text-sm font-bold gap-2"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Saving Prescription & Sending SMS...
                    </>
                  ) : completedResult ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                      <span>Checkup Completed & Saved</span>
                    </>
                  ) : (
                    <>
                      <span>Save Prescription & Send SMS</span>
                      <CheckCircle2 className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Right Sticky Column: AI Assistant Panel & SMS Draft Bubble */}
        <div className="space-y-6">
          <div className="sticky top-6 space-y-4">
            
            {/* Sticky AI Assistant Panel */}
            <Card className="p-6 rounded-3xl border border-teal-200/80 dark:border-teal-900/40 bg-gradient-to-br from-teal-50/50 via-white to-teal-50/20 dark:from-teal-950/20 dark:via-slate-900 dark:to-slate-900 shadow-md space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-teal-100 dark:border-teal-900/40">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white font-heading">
                      AI Assistant Panel
                    </h3>
                    <p className="text-[10px] text-slate-500">Automated Pipeline & SMS Dispatcher</p>
                  </div>
                </div>

                <Badge variant="outline" className="text-[10px] font-bold">
                  {completedResult ? 'Completed' : (historyStream.currentStep !== 'idle' ? historyStream.currentStep : 'Ready')}
                </Badge>
              </div>

              {/* Pipeline Step Timeline */}
              <div className="space-y-2 text-xs">
                {[
                  { label: 'Searching MRN', active: historyStream.currentStep === 'searching_mrn' || historyStream.isDone || !!completedResult },
                  { label: 'Generating Report', active: historyStream.currentStep === 'generating_report' || historyStream.isDone || !!completedResult },
                  { label: 'Saving Prescription', active: isSaving || !!completedResult },
                  { label: 'Drafting Message', active: isSaving || !!completedResult },
                  { label: 'Storing Draft', active: !!completedResult },
                  { label: 'Sending SMS', active: !!completedResult },
                ].map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-white/70 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{s.label}</span>
                    {s.active ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border border-slate-300" />
                    )}
                  </div>
                ))}
              </div>

              {/* SMS Live Draft & Final Card Bubble */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-950 border border-teal-200/80 dark:border-teal-900/60 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                    <MessageSquare className="h-3.5 w-3.5 text-teal-600" />
                    <span>Message to {patientName} ({mrn})</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">{patientPhone || 'Recipient Phone'}</span>
                </div>

                <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans italic bg-teal-50/40 dark:bg-teal-950/20 p-3 rounded-xl border border-teal-100 dark:border-teal-900/40 min-h-[60px]">
                  {completedResult?.messageLog?.draft
                    ? `"${completedResult.messageLog.draft}"`
                    : `"${diagnosis ? `Dear ${patientName}, prescribed medicines for ${diagnosis}. Follow up in ${followUpPeriod}.` : 'Drafting message as you fill prescription...'}"`
                  }
                </p>

                {completedResult?.messageLog && (
                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-400">Live Status:</span>
                      <Badge className={
                        completedResult.messageLog.status === 'sent' || completedResult.messageLog.status === 'delivered'
                          ? 'bg-emerald-100 text-emerald-800 font-bold'
                          : completedResult.messageLog.status === 'failed'
                          ? 'bg-rose-100 text-rose-800 font-bold'
                          : 'bg-amber-100 text-amber-800 font-bold animate-pulse'
                      }>
                        {completedResult.messageLog.status.toUpperCase()}
                      </Badge>
                    </div>

                    {completedResult.messageLog.status === 'failed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isResending}
                        onClick={() => handleResendSms(completedResult.messageLog.id)}
                        className="h-7 text-xs gap-1 border-rose-300 text-rose-700 hover:bg-rose-50 cursor-pointer"
                      >
                        <RefreshCw className={`h-3 w-3 ${isResending ? 'animate-spin' : ''}`} />
                        <span>Resend SMS</span>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Card>

          </div>
        </div>
      </div>

      {/* Past Visits Modal / Drawer */}
      {showPastVisits && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[85vh] p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-teal-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-heading">
                  Past Visit History — {patientName} ({mrn})
                </h3>
              </div>
              <button onClick={() => setShowPastVisits(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-4 pr-1">
              {!patientHistoryData?.visits || patientHistoryData.visits.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">No past visit records found for this patient.</div>
              ) : (
                patientHistoryData.visits.map((v: any, idx: number) => (
                  <div key={v.id || idx} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800 pb-2">
                      <span className="font-bold text-teal-700 dark:text-teal-400 font-mono">Date: {new Date(v.date).toLocaleDateString()}</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{v.diagnosis}</span>
                    </div>

                    {v.medicines && v.medicines.length > 0 && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Prescribed Medicines:</span>
                        <ul className="list-disc list-inside space-y-0.5 font-medium text-slate-700 dark:text-slate-300">
                          {v.medicines.map((m: any, mIdx: number) => (
                            <li key={mIdx}>{m.name || m.medicine} - {m.dosage} ({m.frequency})</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {v.messageLog && (
                      <div className="p-2.5 rounded-xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/40 text-[11px] italic text-slate-600 dark:text-slate-400">
                        <strong>SMS Sent:</strong> "{v.messageLog.draft}"
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowPastVisits(false)}>
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
