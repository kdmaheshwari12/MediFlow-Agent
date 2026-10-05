'use client';

import React from 'react';
import { NormalizedPrescription, formatPrescriptionDate } from '@/services/prescriptions.service';
import { Button } from '@/components/ui/button';
import { Printer, Download, Activity, ShieldCheck } from 'lucide-react';

interface PrescriptionPreviewProps {
  prescription: NormalizedPrescription;
}

export function PrescriptionPreview({ prescription }: PrescriptionPreviewProps) {
  const formattedDate = formatPrescriptionDate(prescription.issued_at);
  const dateOnly = prescription.issued_at ? prescription.issued_at.split('T')[0] : new Date().toISOString().split('T')[0];
  const safeName = (prescription.patient.name || 'Patient').replace(/[^a-zA-Z0-9]/g, '_');
  const pdfFilename = `${prescription.patient.mrn || 'MRN'}_${safeName}_${dateOnly}.pdf`;

  const handlePrintOrPdf = () => {
    const originalTitle = document.title;
    document.title = pdfFilename.replace('.pdf', '');
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  return (
    <div className="space-y-4">
      {/* Action Bar (Hidden on Print) */}
      <div className="flex items-center justify-between print:hidden p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
            Print-Ready Official Prescription
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrintOrPdf} className="gap-1.5 text-xs font-bold">
            <Printer className="h-4 w-4" />
            <span>Print Prescription</span>
          </Button>
          <Button variant="gradient" size="sm" onClick={handlePrintOrPdf} className="gap-1.5 text-xs font-bold">
            <Download className="h-4 w-4" />
            <span>Download PDF</span>
          </Button>
        </div>
      </div>

      {/* A4 Sheet Container */}
      <div className="print:m-0 print:p-6 print:shadow-none print:max-w-none print:border-none bg-white text-slate-900 p-8 sm:p-12 rounded-3xl border border-slate-300 shadow-xl max-w-3xl mx-auto space-y-6 font-sans">
        {/* Hospital & Doctor Header */}
        <div className="flex items-start justify-between border-b-2 border-teal-700 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-teal-700 text-white flex items-center justify-center font-bold">
                <Activity className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-extrabold text-teal-800 font-heading tracking-tight">
                {prescription.hospital.name}
              </h2>
            </div>
            <p className="text-xs text-slate-600 font-medium">{prescription.hospital.address}</p>
            <p className="text-xs text-slate-600 font-medium">Contact: {prescription.hospital.phone}</p>
          </div>

          <div className="text-right space-y-0.5">
            <h3 className="text-base font-bold text-slate-900">{prescription.doctor.name}</h3>
            <p className="text-xs text-teal-700 font-semibold">{prescription.doctor.specialization}</p>
            {prescription.doctor.qualification !== '-' && (
              <p className="text-[11px] text-slate-500 font-medium">{prescription.doctor.qualification}</p>
            )}
            <p className="text-[11px] text-slate-500 font-mono">PMC License: {prescription.doctor.license_number}</p>
          </div>
        </div>

        {/* Patient Information Strip (Avoid split across PDF pages) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs print:break-inside-avoid">
          <div className="sm:col-span-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Patient Name</span>
            <span className="font-bold text-slate-900">{prescription.patient.name}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">MRN</span>
            <span className="font-mono font-bold text-teal-800">{prescription.patient.mrn}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Age / Gender</span>
            <span className="font-bold text-slate-900">
              {prescription.patient.age !== '-' ? `${prescription.patient.age} Y` : '-'}
              {prescription.patient.gender !== '-' ? ` / ${prescription.patient.gender}` : ''}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Date & Time</span>
            <span className="font-bold text-slate-900">{formattedDate}</span>
          </div>
        </div>

        {/* Diagnosis & Rx Symbol */}
        <div className="space-y-2">
          <div className="text-xs text-slate-700">
            <span className="font-bold uppercase text-slate-500 text-[11px] block">Diagnosis:</span>
            <span className="font-extrabold text-sm text-slate-900">{prescription.diagnosis}</span>
          </div>

          <div className="text-3xl font-serif font-extrabold text-teal-800 pt-1">Rx</div>
        </div>

        {/* Medicines Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
              <tr>
                <th className="p-3 w-8">#</th>
                <th className="p-3">Medicine Name</th>
                <th className="p-3">Dosage</th>
                <th className="p-3">Frequency</th>
                <th className="p-3">Duration</th>
                <th className="p-3">Instructions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {prescription.medicines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-400 text-xs italic">
                    No specific medicines recorded.
                  </td>
                </tr>
              ) : (
                prescription.medicines.map((med, idx) => (
                  <tr key={med.id || idx} className="hover:bg-slate-50/50">
                    <td className="p-3 font-bold text-slate-400">{idx + 1}</td>
                    <td className="p-3 font-bold text-slate-900">{med.name}</td>
                    <td className="p-3 text-slate-700 font-medium">{med.dosage}</td>
                    <td className="p-3 text-slate-700">{med.frequency}</td>
                    <td className="p-3 text-slate-700">{med.duration}</td>
                    <td className="p-3 text-slate-600 italic">{med.instructions}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Follow-up Note / Treatment Advice */}
        {(prescription.follow_up || prescription.notes) && (
          <div className="p-4 rounded-xl bg-teal-50/50 border border-teal-100 space-y-1 text-xs">
            <span className="font-bold text-teal-900 block text-[11px] uppercase">Treatment Plan & Follow-up Advice:</span>
            <p className="text-teal-950 font-medium">{prescription.follow_up || prescription.notes}</p>
          </div>
        )}

        {/* AUTHORIZED SIGNATURE Section (Avoid page split across PDF pages) */}
        <div className="pt-8 border-t border-slate-200 flex items-end justify-between print:break-inside-avoid">
          <div className="space-y-1 text-[11px] text-slate-500">
            <div className="flex items-center gap-1 font-semibold text-teal-800">
              <ShieldCheck className="h-4 w-4" />
              <span>Official Verified Prescription</span>
            </div>
            <p>Digitally issued on {formattedDate}</p>
            <p className="text-[10px] text-slate-400">Generated by MediFlow Healthcare SaaS Platform</p>
          </div>

          <div className="text-center space-y-1">
            <div className="h-12 w-44 border-b-2 border-slate-700 mx-auto mb-1 flex items-end justify-center">
              <span className="text-[10px] font-serif italic text-slate-400 select-none pb-1">
                Authorized Signature
              </span>
            </div>
            <span className="text-xs font-bold text-slate-900 block">{prescription.doctor.name}</span>
            <span className="text-[10px] text-slate-500 block">
              {prescription.doctor.qualification !== '-' ? prescription.doctor.qualification : ''}
              {prescription.doctor.license_number !== '-' ? ` (License: ${prescription.doctor.license_number})` : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
