'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import {
  useDatedAvailability,
  useAddDatedAvailability,
  useDeleteAvailability,
  useWeeklySchedule,
  useUpdateWeeklySchedule,
  useOverrides,
  useCreateOverride,
  useDeleteOverride,
  useTimeOff,
  useCreateTimeOff,
  useDeleteTimeOff,
  useQuickActionToday,
} from '@/features/availability/hooks';
import { previewImpact } from '@/services/availability.service';
import { PageHeader } from '@/components/common/PageHeader';
import { CalendarPicker } from '@/components/calendar-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Clock,
  Calendar,
  AlertTriangle,
  Check,
  Plus,
  Trash2,
  Zap,
  Coffee,
  CalendarX,
  RefreshCw,
  Info,
  X,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

export default function AvailabilityPage() {
  const { user, initialized, loading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (initialized && !loading) {
      if (!user || user.role !== 'doctor') {
        router.replace('/unauthorized');
      }
    }
  }, [user, initialized, loading, router]);

  const todayStr = new Date().toISOString().split('T')[0];

  // Queries & Mutations
  const { data: datedAvail, isLoading: datedLoading } = useDatedAvailability(user?.id);
  const addDatedMutation = useAddDatedAvailability();
  const deleteAvailMutation = useDeleteAvailability();

  const { data: timeOffList, isLoading: timeOffLoading } = useTimeOff(user?.id);
  const createTimeOffMutation = useCreateTimeOff();
  const deleteTimeOffMutation = useDeleteTimeOff();
  const quickActionMutation = useQuickActionToday();

  // Form State: Simple Row-Based Availability List
  interface AvailabilityRow {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    slot_minutes: number;
  }

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

  // Form State: New Time Off
  const [timeOffStart, setTimeOffStart] = useState('');
  const [timeOffEnd, setTimeOffEnd] = useState('');
  const [timeOffReason, setTimeOffReason] = useState('');

  // Form State: Extend Today Modal
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendTime, setExtendTime] = useState('19:00');

  // Blocked Deletion Dialog State
  const [blockedModalOpen, setBlockedModalOpen] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState('');
  const [affectedAppts, setAffectedAppts] = useState<any[]>([]);

  // Save Availability (Simple Row-Based Flow)
  const handleSaveAvailability = async (e: React.FormEvent) => {
    e.preventDefault();

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

    addDatedMutation.mutate(
      {
        items: rows.map((r) => ({
          date: r.date,
          start_time: r.start_time,
          end_time: r.end_time,
          slot_minutes: Number(r.slot_minutes),
        })),
      },
      {
        onSuccess: () => {
          setRows([{ id: 'row-0', date: todayStr, start_time: '09:00', end_time: '17:00', slot_minutes: 30 }]);
          setRowErrors({});
        },
        onError: (err: any) => {
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
        },
      }
    );
  };

  // Delete Availability Handler with Booking Check
  const handleDeleteAvailability = async (id: string, rowDate: string) => {
    if (rowDate < todayStr) {
      toast.error('Past availability cannot be deleted.');
      return;
    }

    try {
      await deleteAvailMutation.mutateAsync(id);
    } catch (err: any) {
      if (err.status === 409 || err.code === 'AFFECTED_BOOKINGS_EXIST' || err.affectedAppointments) {
        setBlockedMessage(err.message || 'Cannot delete availability because booked appointments exist.');
        setAffectedAppts(err.affectedAppointments || []);
        setBlockedModalOpen(true);
      }
    }
  };

  // Group Availability Rows by Date
  const groupedAvailability = React.useMemo(() => {
    if (!datedAvail || !Array.isArray(datedAvail)) return [];
    const map = new Map<string, any[]>();
    for (const item of datedAvail) {
      const dateKey = item.date;
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(item);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [datedAvail]);

  // Handle Create Time Off
  const handleCreateTimeOff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!timeOffStart || !timeOffEnd) {
      toast.error('Start and End dates are required.');
      return;
    }
    createTimeOffMutation.mutate(
      {
        starts_on: timeOffStart,
        ends_on: timeOffEnd,
        reason: timeOffReason,
      },
      {
        onSuccess: () => {
          setTimeOffStart('');
          setTimeOffEnd('');
          setTimeOffReason('');
        },
      }
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Doctor Availability & Schedule"
        subtitle="Select dates and time ranges to configure your practice availability and manage leaves."
      />

      {/* TODAY QUICK ACTIONS BAR */}
      <Card className="p-6 rounded-3xl border border-teal-200 dark:border-teal-900 bg-gradient-to-r from-teal-50/50 via-white to-emerald-50/50 dark:from-slate-900 dark:to-slate-900 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white font-heading">
            Today Quick Actions
          </h2>
          <Badge variant="outline" className="text-[10px] bg-teal-100 text-teal-800 border-teal-300">
            Realtime Sync
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button
            variant="outline"
            onClick={() => quickActionMutation.mutate({ action: 'unavailable' })}
            disabled={quickActionMutation.isPending}
            className="border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/40 text-xs font-bold gap-2 h-11 cursor-pointer"
          >
            <CalendarX className="h-4 w-4" />
            <span>Mark Unavailable Rest of Today</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => quickActionMutation.mutate({ action: 'end' })}
            disabled={quickActionMutation.isPending}
            className="border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900 dark:hover:bg-amber-950/40 text-xs font-bold gap-2 h-11 cursor-pointer"
          >
            <Clock className="h-4 w-4" />
            <span>End Session Now</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => setExtendModalOpen(true)}
            disabled={quickActionMutation.isPending}
            className="border-teal-200 text-teal-700 hover:bg-teal-50 dark:border-teal-900 dark:hover:bg-teal-950/40 text-xs font-bold gap-2 h-11 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Extend Today&apos;s Session</span>
          </Button>
        </div>
      </Card>

      {/* 1. ADD AVAILABILITY FORM (SIMPLE ROW-BASED LIST) */}
      <Card className="p-6 sm:p-8 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-heading flex items-center gap-2">
              <Calendar className="h-5 w-5 text-teal-600" />
              Add Practice Availability
            </h2>
            <p className="text-xs text-slate-500">
              Each row has its own date, start time, end time, and slot duration.
            </p>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            {rows.length} {rows.length === 1 ? 'Row' : 'Rows'}
          </Badge>
        </div>

        <form onSubmit={handleSaveAvailability} className="space-y-5">
          {/* List of Rows */}
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

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={addDatedMutation.isPending}
              variant="gradient"
              className="font-bold px-8 h-11 rounded-xl cursor-pointer gap-2"
            >
              {addDatedMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span>Save Availability</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* 2. GROUPED AVAILABILITY LIST BY DATE */}
      <Card className="p-6 sm:p-8 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-heading">
              Configured Availability Schedule (Grouped by Date)
            </h2>
            <p className="text-xs text-slate-500">
              Lists all configured shift times and booked appointment counts per date. Edit and delete allowed for today and future dates.
            </p>
          </div>
        </div>

        {datedLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading availability...</div>
        ) : groupedAvailability.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 italic">No availability added yet. Use the form above to add dates.</div>
        ) : (
          <div className="space-y-4">
            {groupedAvailability.map(([dateKey, rows]) => {
              const isPast = dateKey < todayStr;
              const dateFormatted = new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });

              return (
                <div
                  key={dateKey}
                  className={`p-4 rounded-2xl border ${
                    isPast
                      ? 'bg-slate-100/50 border-slate-200/60 opacity-60 dark:bg-slate-950/30 dark:border-slate-800'
                      : 'bg-slate-50/80 border-slate-200/80 dark:bg-slate-950/60 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3 border-b border-slate-200/60 dark:border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-teal-600" />
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{dateFormatted}</span>
                      <span className="text-xs font-mono text-slate-400">({dateKey})</span>
                      {isPast && (
                        <Badge variant="outline" className="text-[9px] bg-slate-200 text-slate-600 border-slate-300">
                          Past Date
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {rows.map((row: any) => (
                      <div
                        key={row.id}
                        className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white font-mono">
                            <Clock className="h-3.5 w-3.5 text-teal-600" />
                            <span>{row.start_time?.slice(0, 5)} - {row.end_time?.slice(0, 5)}</span>
                          </div>

                          <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {row.slot_minutes} min slots
                          </Badge>

                          <div className="flex items-center gap-1 text-slate-500 font-medium">
                            <Users className="h-3.5 w-3.5 text-teal-600" />
                            <span>Booked: <strong>{row.bookedCount || 0}</strong></span>
                          </div>
                        </div>

                        <div>
                          {!isPast ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteAvailability(row.id, row.date)}
                              disabled={deleteAvailMutation.isPending}
                              className="text-red-500 hover:text-red-700 h-8 w-8 p-0 cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Read-only</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* TIME OFF / LEAVE MANAGER */}
      <Card className="p-6 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-6 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white font-heading">
            Time Off & Leave Manager
          </h2>
          <p className="text-xs text-slate-500">Block date ranges for vacation, holidays, or emergency leave.</p>
        </div>

        <form onSubmit={handleCreateTimeOff} className="space-y-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1">From Date *</label>
              <Input type="date" value={timeOffStart} onChange={(e) => setTimeOffStart(e.target.value)} required min={todayStr} />
            </div>
            <div>
              <label className="font-semibold block mb-1">To Date *</label>
              <Input type="date" value={timeOffEnd} onChange={(e) => setTimeOffEnd(e.target.value)} required min={timeOffStart || todayStr} />
            </div>
          </div>

          <div>
            <label className="font-semibold block mb-1">Reason / Description</label>
            <Input value={timeOffReason} onChange={(e) => setTimeOffReason(e.target.value)} placeholder="e.g. Annual Vacation, Medical Leave" />
          </div>

          <Button type="submit" disabled={createTimeOffMutation.isPending} variant="outline" className="w-full text-xs font-bold border-amber-500 text-amber-700 cursor-pointer">
            <Plus className="h-4 w-4 mr-1" /> Add Time Off Range
          </Button>
        </form>

        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase text-slate-400">Scheduled Leaves</h3>
          {timeOffLoading ? (
            <div className="text-xs text-slate-400">Loading leave ranges...</div>
          ) : !timeOffList || timeOffList.length === 0 ? (
            <div className="text-xs text-slate-400 italic">No upcoming leaves scheduled.</div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {timeOffList.map((to: any) => (
                <div key={to.id} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{to.starts_on} to {to.ends_on}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 italic mt-0.5">&quot;{to.reason || 'Personal Leave'}&quot;</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteTimeOffMutation.mutate(to.id)} className="h-8 w-8 text-rose-500 hover:text-rose-700 cursor-pointer">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* EXTEND TODAY MODAL */}
      <Dialog open={extendModalOpen} onOpenChange={setExtendModalOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Extend Today&apos;s Session</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Set a new end time for today to allow additional appointment slots.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold block mb-1">New End Time for Today *</label>
              <Input type="time" value={extendTime} onChange={(e) => setExtendTime(e.target.value)} className="h-10" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendModalOpen(false)}>Cancel</Button>
            <Button
              variant="gradient"
              onClick={() => {
                quickActionMutation.mutate({ action: 'extend', extraData: { new_end_time: extendTime } });
                setExtendModalOpen(false);
              }}
            >
              Extend Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BLOCKED DELETION MODAL (AFFECTED BOOKINGS) */}
      <Dialog open={blockedModalOpen} onOpenChange={setBlockedModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-rose-700 dark:text-rose-400 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Cannot Delete Availability
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {blockedMessage}
            </DialogDescription>
          </DialogHeader>

          {affectedAppts.length > 0 && (
            <div className="space-y-3 py-2 max-h-60 overflow-y-auto">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Affected Booked Appointments ({affectedAppts.length}):
              </span>
              {affectedAppts.map((apt: any) => (
                <div key={apt.id} className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">{apt.patientName || 'Patient'}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{apt.timeSlot} ({apt.date})</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-rose-100 text-rose-800 border-rose-300 font-mono">
                    MRN: {apt.mrn || 'N/A'}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="gradient" onClick={() => setBlockedModalOpen(false)}>
              Understood
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

