'use client';

import React, { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useDoctors } from '@/features/appointments/hooks';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Stethoscope, Clock, Users } from 'lucide-react';

function DoctorsPageContent() {
  const { user, initialized, loading } = useAuthStore();
  const router = useRouter();
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Guard
  React.useEffect(() => {
    if (initialized && !loading) {
      if (!user || (user.role !== 'staff' && user.role !== 'receptionist')) {
        router.replace('/unauthorized');
      }
    }
  }, [user, initialized, loading, router]);

  if (!initialized || loading) {
    return <Card className="p-8 text-center text-xs text-slate-400">Loading directory...</Card>;
  }

  if (!user || (user.role !== 'staff' && user.role !== 'receptionist')) {
    return null;
  }

  const { data: doctors, isLoading } = useDoctors('', '', selectedDate);

  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const filteredDoctors = doctors?.filter((d: any) => {
    const name = d.fullName || d.name || '';
    const specs = d.specializations || [];
    return (
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      specs.some((s: any) => s.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Doctors Directory"
        subtitle="View affiliated physicians, visiting schedules, assigned vs seen counts, and daily limits."
      />

      {/* Date Navigator & Search Controls */}
      <Card className="p-4 rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by doctor name or specialization..."
            className="pl-10 h-11 text-xs sm:text-sm rounded-xl"
          />
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrevDay} className="h-10 px-3 text-xs font-bold">
            &larr; Prev
          </Button>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-10 text-xs font-bold rounded-xl w-36"
          />
          <Button variant="outline" size="sm" onClick={handleNextDay} className="h-10 px-3 text-xs font-bold">
            Next &rarr;
          </Button>
          <Button
            variant={selectedDate === todayStr ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedDate(todayStr)}
            className="h-10 px-3 text-xs font-bold"
          >
            Today
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-8 text-center text-xs text-slate-400">Loading doctors directory...</Card>
      ) : !filteredDoctors || filteredDoctors.length === 0 ? (
        <EmptyState
          title="No Doctors Found"
          description="No doctor records match your search query for the selected date."
          icon={Stethoscope}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDoctors.map((doctor: any) => {
            const name = doctor.fullName || doctor.name || 'Physician';
            const qualification = doctor.qualification ? `(${doctor.qualification})` : '';
            const initial = name.replace(/^Dr\.\s*/i, '').charAt(0).toUpperCase();
            const schedules = doctor.visitingDaysTimes || [];
            const assignedCount = doctor.assignedCount ?? 0;
            const seenCount = doctor.seenCount ?? 0;
            const dailyLimit = doctor.dailyLimit || doctor.daily_patient_limit || 20;
            const isFull = assignedCount >= dailyLimit;

            return (
              <Card key={doctor.id} className="p-5 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-4 shadow-xs flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-teal-600/10 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 flex items-center justify-center font-bold text-lg font-heading shrink-0">
                        {initial}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white font-heading">
                          Dr. {name.replace(/^Dr\.\s*/i, '')} <span className="text-xs text-slate-500 font-normal">{qualification}</span>
                        </h3>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {doctor.specializations?.map((spec: any, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px] text-teal-700 border-teal-200 bg-teal-50 dark:text-teal-300 dark:border-teal-800 dark:bg-teal-900/30">
                              {spec.name} {spec.yearsExperience || spec.experience_years ? `(${spec.yearsExperience || spec.experience_years}y)` : ''}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    {isFull && (
                      <Badge variant="destructive" className="text-[10px] font-bold px-2 py-0.5 uppercase">
                        Full
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                    {/* Assigned vs Seen Count Badge */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Assigned Count</span>
                        <span className="font-bold font-mono text-slate-900 dark:text-white text-sm">{assignedCount} / {dailyLimit}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Seen / Done</span>
                        <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400 text-sm">{seenCount}</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5 text-slate-500 font-bold uppercase text-[10px] mb-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Visiting Days & Schedule</span>
                      </div>
                      <div className="space-y-1">
                        {schedules.length === 0 ? (
                          <div className="text-slate-400 italic text-[11px]">No schedule configured</div>
                        ) : (
                          schedules.slice(0, 5).map((av: any, i: number) => (
                            <div key={i} className="flex justify-between text-slate-700 dark:text-slate-300">
                              <span className="font-medium">{av.date || av.day}</span>
                              <span className="font-mono">{(av.startTime || av.start_time || '').substring(0, 5)} - {(av.endTime || av.end_time || '').substring(0, 5)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* View Schedule & Book Action Button */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    onClick={() => router.push(`/doctors/${doctor.id}/schedule?date=${selectedDate}`)}
                    className="w-full h-10 text-xs font-bold gap-2"
                  >
                    <span>View Schedule & Book</span>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DoctorsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading Doctors Directory...</div>}>
      <DoctorsPageContent />
    </Suspense>
  );
}
