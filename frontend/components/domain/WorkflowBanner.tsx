'use client';

import React from 'react';
import { UserCheck, FileText, CalendarCheck, Stethoscope, Pill, Sparkles, Send } from 'lucide-react';

const WORKFLOW_STEPS = [
  { icon: UserCheck, label: '1. Patient Arrives' },
  { icon: FileText, label: '2. Register / MRN' },
  { icon: CalendarCheck, label: '3. Book Slot' },
  { icon: Stethoscope, label: '4. Doctor Checkup' },
  { icon: Pill, label: '5. Prescription' },
  { icon: Sparkles, label: '6. AI Follow-up' },
  { icon: Send, label: '7. Auto-sent SMS' },
];

export function WorkflowBanner() {
  return (
    <div className="w-full bg-gradient-to-r from-teal-900 via-emerald-900 to-slate-900 text-white rounded-2xl p-4 shadow-md overflow-x-auto border border-teal-800/60">
      <div className="flex items-center justify-between min-w-[700px] gap-2 text-xs font-semibold">
        {WORKFLOW_STEPS.map((step, idx) => {
          const Icon = step.icon;
          return (
            <React.Fragment key={idx}>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white/10 backdrop-blur-xs border border-white/10 shrink-0">
                <Icon className="h-3.5 w-3.5 text-teal-300" />
                <span className="text-[11px] font-medium text-teal-100">{step.label}</span>
              </div>
              {idx < WORKFLOW_STEPS.length - 1 && (
                <span className="text-teal-400 font-bold text-xs shrink-0">→</span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
