'use client';

import React, { useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CalendarPickerProps {
  selectedDates: string[];
  onToggleDate: (dateStr: string) => void;
  onSelectDates?: (dates: string[]) => void;
}

export function CalendarPicker({ selectedDates, onToggleDate, onSelectDates }: CalendarPickerProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth(); // 0-indexed

  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const todayStr = new Date().toISOString().split('T')[0];

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const nextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const prevMonth = () => {
    const prev = new Date(year, month - 1, 1);
    const now = new Date();
    if (prev.getFullYear() < now.getFullYear() || (prev.getFullYear() === now.getFullYear() && prev.getMonth() < now.getMonth())) {
      return; // prevent going into past months
    }
    setCurrentMonth(prev);
  };

  const daysGrid: (string | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    daysGrid.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const mStr = String(month + 1).padStart(2, '0');
    const dStr = String(d).padStart(2, '0');
    daysGrid.push(`${year}-${mStr}-${dStr}`);
  }

  // Quick preset handlers
  const handleSelectToday = () => {
    if (!selectedDates.includes(todayStr)) {
      onToggleDate(todayStr);
    }
  };

  const handleSelectNext5Days = () => {
    const dates: string[] = [];
    const now = new Date();
    for (let i = 0; i < 5; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dayStr = String(d.getDate()).padStart(2, '0');
      dates.push(`${d.getFullYear()}-${mStr}-${dayStr}`);
    }
    if (onSelectDates) {
      onSelectDates(Array.from(new Set([...selectedDates, ...dates])).sort());
    } else {
      dates.forEach((d) => {
        if (!selectedDates.includes(d)) onToggleDate(d);
      });
    }
  };

  return (
    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 shadow-xs">
      {/* Month & Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          <h4 className="text-sm font-bold font-heading text-slate-900 dark:text-white">
            {monthNames[month]} {year}
          </h4>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs cursor-pointer"
            title="Previous Month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs cursor-pointer"
            title="Next Month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Weekday Labels */}
      <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] uppercase text-slate-400">
        <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
      </div>

      {/* Calendar Grid Tiles */}
      <div className="grid grid-cols-7 gap-1">
        {daysGrid.map((dateStr, idx) => {
          if (!dateStr) {
            return <div key={`empty-${idx}`} className="h-9" />;
          }

          const isPast = dateStr < todayStr;
          const isToday = dateStr === todayStr;
          const isSelected = selectedDates.includes(dateStr);

          return (
            <button
              key={dateStr}
              type="button"
              disabled={isPast}
              onClick={() => onToggleDate(dateStr)}
              className={`h-9 rounded-xl text-xs font-bold transition-all flex items-center justify-center relative cursor-pointer ${
                isPast
                  ? 'text-slate-300 dark:text-slate-700 bg-slate-50 dark:bg-slate-950/30 cursor-not-allowed border border-transparent'
                  : isSelected
                  ? 'bg-teal-600 text-white shadow-sm ring-2 ring-teal-600 font-extrabold'
                  : isToday
                  ? 'border-2 border-teal-500 text-teal-700 dark:text-teal-300 bg-teal-50/60 dark:bg-teal-950/40'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/50 dark:border-slate-800'
              }`}
            >
              <span>{parseInt(dateStr.split('-')[2], 10)}</span>
              {isSelected && (
                <span className="absolute top-0.5 right-0.5">
                  <Check className="h-3 w-3 stroke-[3]" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Quick Presets */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
        <span className="text-[11px] text-slate-400">Click any date tile to select/deselect</span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSelectToday}
            className="h-7 text-[11px] font-semibold text-teal-700 dark:text-teal-300 px-2 cursor-pointer"
          >
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSelectNext5Days}
            className="h-7 text-[11px] font-semibold text-teal-700 dark:text-teal-300 px-2 cursor-pointer"
          >
            +5 Days
          </Button>
        </div>
      </div>
    </div>
  );
}
