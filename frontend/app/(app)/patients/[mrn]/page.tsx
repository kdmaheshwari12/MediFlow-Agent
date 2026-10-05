'use client';

import React, { useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { usePatientByMrn } from '@/features/patients/hooks';
import { useMedicalHistory } from '@/features/records/hooks';
import { useFollowUps } from '@/features/followups/hooks';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { PrescriptionPreview } from '@/components/domain/PrescriptionPreview';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  UserCheck,
  AlertTriangle,
  History,
  Pill,
  Sparkles,
  Calendar,
  FileText,
  ArrowLeft,
  ShieldCheck,
  Heart,
  Activity,
  CheckCircle2,
} from 'lucide-react';

function PatientMedicalRecordContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mrn = params.mrn as string;
  const currentTab = searchParams.get('tab') || 'overview';

  const { user } = useAuthStore();
  const { data: patient, isLoading: patientLoading } = usePatientByMrn(mrn);
  const { data: visits } = useMedicalHistory(mrn);
  const { data: followUps } = useFollowUps({ search: mrn });

  React.useEffect(() => {
    if (!user || user.role !== 'doctor') {
      router.replace('/unauthorized');
    }
  }, [user, router]);

  if (!user || user.role !== 'doctor') {
    return null;
  }

  if (patientLoading || !patient) {
    return <div className="p-8 text-center text-xs text-slate-400">Loading patient medical record...</div>;
  }

  const latestVisit = visits && visits.length > 0 ? visits[0] : null;

  return (
    <div className="space-y-6">
      {/* Privacy Notice */}
      <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 text-teal-800 dark:text-teal-300 text-xs font-semibold flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-teal-600" />
          <span>Confidential Medical Data — Doctor Scoped Access Only</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push('/patients')} className="text-xs h-7 gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Directory</span>
        </Button>
      </div>

      {/* Patient Header Card */}
      <Card className="p-6 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-3xl bg-teal-600 text-white font-bold text-2xl flex items-center justify-center shadow-md">
              {patient.fullName.charAt(0)}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold font-heading text-slate-900 dark:text-white">
                  {patient.fullName}
                </h1>
                <Badge variant="outline" className="font-mono text-xs font-bold text-teal-700 bg-teal-50 border-teal-300">
                  {patient.mrn}
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                {patient.age} Years • {patient.gender} • Phone: <span className="font-mono font-bold">{patient.phone}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Highlighted Allergies & Critical Flags Alert Chips */}
        {(patient.allergies.length > 0 || patient.criticalFlags.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            {patient.allergies.map((alg) => (
              <Badge key={alg} variant="destructive" className="text-xs font-bold gap-1 px-3 py-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Allergy: {alg}</span>
              </Badge>
            ))}
            {patient.criticalFlags.map((flag) => (
              <Badge key={flag} variant="secondary" className="text-xs font-bold gap-1 px-3 py-1 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-300">
                <Activity className="h-3.5 w-3.5 text-amber-600" />
                <span>Condition: {flag}</span>
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {/* URL Synced Medical Record Tabs */}
      <Tabs
        defaultValue={currentTab}
        onValueChange={(val) => router.push(`/patients/${mrn}?tab=${val}`)}
        className="w-full space-y-6"
      >
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="rounded-xl text-xs font-bold">Overview</TabsTrigger>
          <TabsTrigger value="history" className="rounded-xl text-xs font-bold">Medical History Timeline</TabsTrigger>
          <TabsTrigger value="visits" className="rounded-xl text-xs font-bold">Visits ({visits?.length || 0})</TabsTrigger>
          <TabsTrigger value="prescriptions" className="rounded-xl text-xs font-bold">Prescriptions</TabsTrigger>
          <TabsTrigger value="followups" className="rounded-xl text-xs font-bold">AI Follow-ups</TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <h3 className="text-sm font-bold font-heading text-slate-900 dark:text-white flex items-center gap-2">
                <Heart className="h-4 w-4 text-teal-600" />
                <span>Vitals & Active Conditions</span>
              </h3>
              <div className="space-y-2 text-xs">
                <p className="text-slate-600 dark:text-slate-400"><strong>Emergency Contact:</strong> {patient.emergencyContactName} ({patient.emergencyContactPhone})</p>
                <p className="text-slate-600 dark:text-slate-400"><strong>Registered Since:</strong> {new Date(patient.createdAt).toLocaleDateString()}</p>
              </div>
            </Card>

            <Card className="p-6 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <h3 className="text-sm font-bold font-heading text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="h-4 w-4 text-teal-600" />
                <span>Latest Visit Summary</span>
              </h3>
              {latestVisit ? (
                <div className="space-y-2 text-xs">
                  <p className="font-bold text-slate-900 dark:text-white">{latestVisit.diagnosis}</p>
                  <p className="text-slate-500 italic">&quot;{latestVisit.notes}&quot;</p>
                  <span className="text-[11px] text-teal-600 font-semibold block pt-1">Prescribed {latestVisit.medicines.length} Medicines</span>
                </div>
              ) : (
                <p className="text-xs text-slate-400">No previous visits recorded.</p>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Medical History Timeline */}
        <TabsContent value="history" className="space-y-4">
          <Card className="p-6 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-6">
            <h3 className="text-base font-bold font-heading text-slate-900 dark:text-white flex items-center gap-2">
              <History className="h-5 w-5 text-teal-600" />
              <span>Medical History Timeline</span>
            </h3>

            <div className="space-y-6 border-l-2 border-teal-500/30 pl-6 ml-2">
              {visits?.map((v) => (
                <div key={v.id} className="relative space-y-2">
                  <div className="absolute -left-[31px] top-0 h-4 w-4 rounded-full bg-teal-600 ring-4 ring-white dark:ring-slate-900" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900 dark:text-white font-mono">{v.date}</span>
                    <span className="text-teal-600 font-semibold">{v.doctorName}</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{v.diagnosis}</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-950 p-3 rounded-xl">
                    &quot;{v.notes}&quot;
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* Tab 3: Visits */}
        <TabsContent value="visits">
          <Card className="p-6 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <h3 className="text-sm font-bold font-heading text-slate-900 dark:text-white">Visit Records</h3>
            <div className="space-y-3">
              {visits?.map((v) => (
                <div key={v.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                  <div className="flex justify-between font-bold">
                    <span>{v.date}</span>
                    <span className="text-teal-600">{v.doctorName}</span>
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white">{v.diagnosis}</p>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* Tab 4: Prescriptions */}
        <TabsContent value="prescriptions" className="space-y-6">
          {latestVisit && (
            <PrescriptionPreview
              prescription={{
                id: latestVisit.id || 'visit-rx',
                visit_id: latestVisit.id || 'visit-rx',
                issued_at: latestVisit.date || new Date().toISOString(),
                diagnosis: latestVisit.diagnosis || 'Consultation',
                notes: latestVisit.notes || '',
                follow_up: latestVisit.treatmentPlan || null,
                patient: {
                  id: patient.id || '-',
                  mrn: patient.mrn || '-',
                  name: patient.fullName || '-',
                  age: patient.age || '-',
                  gender: patient.gender || '-',
                  phone: patient.phone || '-',
                },
                doctor: {
                  id: user.id,
                  name: user.fullName || latestVisit.doctorName || 'Dr. Attending Physician',
                  qualification: 'MBBS, FCPS',
                  specialization: 'General Practice',
                  license_number: 'PMC-88123',
                },
                hospital: {
                  name: 'MediFlow Health Clinic',
                  address: 'Main Hospital Boulevard',
                  phone: '+92 42 35789000',
                },
                medicines: (latestVisit.medicines || []).map((m: any, idx: number) => ({
                  id: `m-${idx}`,
                  name: m.name || '-',
                  dosage: m.dosage || '-',
                  frequency: m.frequency || '-',
                  duration: typeof m.duration === 'number' ? `${m.duration} days` : (m.duration || '-'),
                  instructions: m.instructions || '-',
                })),
              }}
            />
          )}
        </TabsContent>

        {/* Tab 5: AI Follow-ups */}
        <TabsContent value="followups" className="space-y-4">
          <Card className="p-6 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <h3 className="text-sm font-bold font-heading text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-600" />
              <span>Automated AI Follow-up History</span>
            </h3>

            <div className="space-y-3">
              {followUps?.map((f) => (
                <div key={f.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900 dark:text-white">Sent on {f.followUpDate}</span>
                    <StatusBadge status={f.status} type="followup" />
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 italic">&quot;{f.generatedMessage}&quot;</p>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PatientMedicalRecordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading medical record...</div>}>
      <PatientMedicalRecordContent />
    </Suspense>
  );
}
