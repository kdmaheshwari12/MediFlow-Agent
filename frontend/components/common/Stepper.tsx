'use client';

import React from 'react';
import { Check } from 'lucide-react';

interface StepperProps {
  currentStep: number;
  steps: { number: number; title: string; subtitle: string }[];
}

export function Stepper({ currentStep, steps }: StepperProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between relative">
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 dark:bg-slate-800 -translate-y-1/2 z-0" />
        {steps.map((s) => {
          const isCompleted = currentStep > s.number;
          const isCurrent = currentStep === s.number;

          return (
            <div key={s.number} className="relative z-10 flex flex-col items-center group">
              <div
                className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                  isCompleted
                    ? 'bg-teal-600 text-white shadow-sm'
                    : isCurrent
                    ? 'bg-white border-2 border-teal-600 text-teal-700 dark:bg-slate-900 dark:text-teal-400 shadow-md ring-4 ring-teal-500/10'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : <span>{s.number}</span>}
              </div>
              <div className="hidden sm:flex flex-col items-center mt-2 text-center">
                <span
                  className={`text-xs font-bold ${
                    isCurrent ? 'text-teal-700 dark:text-teal-400' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {s.title}
                </span>
                <span className="text-[10px] text-slate-400">{s.subtitle}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
