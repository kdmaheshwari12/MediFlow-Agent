'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import {
  getDoctorPrescriptions,
  NormalizedPrescription,
  formatPrescriptionDate,
} from '@/services/prescriptions.service';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { PrescriptionPreview } from '@/components/domain/PrescriptionPreview';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Pill,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

export default function PrescriptionsPage() {
  const { user } = useAuthStore();
  const router = useRouter();

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'last7' | 'custom'>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [page, setPage] = useState(1);

  // API State
  const [prescriptions, setPrescriptions] = useState<NormalizedPrescription[]>([]);
  const [selectedPrescription, setSelectedPrescription] = useState<NormalizedPrescription | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1); // Reset page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Compute date range parameters based on filter option
  const getDateRange = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    if (dateFilter === 'today') {
      return { from: today, to: today };
    }
    if (dateFilter === 'last7') {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7);
      return { from: pastDate.toISOString().split('T')[0], to: today };
    }
    if (dateFilter === 'custom') {
      return { from: customFrom || undefined, to: customTo || undefined };
    }
    return { from: undefined, to: undefined };
  }, [dateFilter, customFrom, customTo]);

  // Fetch Prescriptions from Backend API
  const fetchPrescriptions = useCallback(async () => {
    if (!user || user.role !== 'doctor') return;
    setLoading(true);
    setError(null);

    const { from, to } = getDateRange();

    try {
      const res = await getDoctorPrescriptions({
        q: debouncedSearch || undefined,
        from,
        to,
        page,
        limit: 20,
      });

      setPrescriptions(res.data);
      setPagination(res.pagination);

      // Auto-select latest prescription on fetch or search match
      if (res.data.length > 0) {
        setSelectedPrescription(res.data[0]);
      } else {
        setSelectedPrescription(null);
      }
    } catch (err: any) {
      console.error('Failed to load prescriptions:', err);
      setError('Failed to load prescriptions. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user, debouncedSearch, getDateRange, page]);

  useEffect(() => {
    if (!user || user.role !== 'doctor') {
      router.replace('/unauthorized');
      return;
    }
    fetchPrescriptions();
  }, [user, router, fetchPrescriptions]);

  if (!user || user.role !== 'doctor') return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Issued Prescriptions"
        subtitle="Doctor-only directory of official clinical prescriptions and printable PDF slips"
      />

      {/* Search & Filter Bar */}
      <Card className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by Patient Name, MRN (e.g. MRN-80022), or Phone Number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-8 text-xs h-10 rounded-xl"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Date Filter Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => {
                setDateFilter('all');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                dateFilter === 'all'
                  ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => {
                setDateFilter('today');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                dateFilter === 'today'
                  ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => {
                setDateFilter('last7');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                dateFilter === 'last7'
                  ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => {
                setDateFilter('custom');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                dateFilter === 'custom'
                  ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Custom</span>
            </button>
          </div>
        </div>

        {/* Custom Date Inputs if 'custom' is active */}
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">From:</span>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  setPage(1);
                }}
                className="h-8 text-xs rounded-lg w-36"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">To:</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  setPage(1);
                }}
                className="h-8 text-xs rounded-lg w-36"
              />
            </div>
          </div>
        )}
      </Card>

      {/* Main Grid View */}
      {loading ? (
        <Card className="p-12 text-center text-xs text-slate-500 space-y-3">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-teal-600" />
          <p>Loading prescription records...</p>
        </Card>
      ) : error ? (
        <Card className="p-8 text-center text-xs text-rose-600 space-y-3 border-rose-200 bg-rose-50/50">
          <AlertCircle className="h-6 w-6 mx-auto text-rose-600" />
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={fetchPrescriptions} className="mt-2 text-xs">
            Retry Loading
          </Button>
        </Card>
      ) : prescriptions.length === 0 ? (
        <EmptyState
          title={debouncedSearch ? `No prescription found for "${debouncedSearch}"` : 'No Prescriptions Issued'}
          description={
            debouncedSearch
              ? 'Try adjusting your MRN, patient name, or date search filter.'
              : 'Prescriptions generated during patient checkups will appear here.'
          }
          icon={Pill}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List of Prescriptions (Left Panel) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
              <span>Prescription Records ({pagination.total})</span>
              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>
            </div>

            <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1">
              {prescriptions.map((rx) => {
                const isSelected = selectedPrescription?.id === rx.id;
                const formattedListDate = formatPrescriptionDate(rx.issued_at);

                return (
                  <Card
                    key={rx.id}
                    onClick={() => setSelectedPrescription(rx)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                      isSelected
                        ? 'border-teal-600 bg-teal-50/40 dark:bg-teal-950/20 shadow-md ring-2 ring-teal-500/10'
                        : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900 dark:text-white truncate max-w-[160px]">
                        {rx.patient.name}
                      </span>
                      <span className="font-mono text-[10px] text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/50 px-2 py-0.5 rounded-full border border-teal-200 dark:border-teal-800 font-bold">
                        {rx.patient.mrn}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                      {rx.diagnosis}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span>{rx.medicines.length} Medicines</span>
                      <span className="font-mono text-[10px] text-slate-400">{formattedListDate}</span>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="gap-1 text-xs"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Previous</span>
                </Button>

                <span className="text-xs text-slate-500 font-medium">
                  {page} / {pagination.totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="gap-1 text-xs"
                >
                  <span>Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Printable Prescription Preview (Right Panel) */}
          <div className="lg:col-span-2">
            {selectedPrescription ? (
              <PrescriptionPreview prescription={selectedPrescription} />
            ) : (
              <Card className="p-8 text-center text-xs text-slate-400">
                Select a prescription from the left list to view printable preview.
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
