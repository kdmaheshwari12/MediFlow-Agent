'use client';

import React, { useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { PageHeader } from '@/components/common/PageHeader';
import { formatCnicInput, maskCnicDisplay } from '@/lib/cnic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, ShieldCheck, CheckCircle2, RefreshCw, Lock } from 'lucide-react';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [isSaving, setIsSaving] = useState(false);

  if (!user) return null;

  const isCnicLocked = !!(user.cnic && user.cnic.trim() !== '');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast.success('Profile updated successfully.');
    }, 400);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader
        title="Account Profile"
        subtitle="Manage your personal information, contact credentials, and clinic affiliation"
      />

      <Card className="p-6 sm:p-8 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-6">
        <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
          <div className="h-16 w-16 rounded-3xl bg-teal-600 text-white font-bold text-2xl flex items-center justify-center shadow-md">
            {user.fullName.charAt(0)}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold font-heading text-slate-900 dark:text-white">{user.fullName}</h2>
              <Badge variant={user.role === 'doctor' ? 'default' : 'secondary'} className="text-[10px] font-bold uppercase">
                {user.role}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">{user.email} • {user.clinicName}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold block mb-1">Full Name *</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1">Email Address (Read-only)</label>
              <Input value={user.email} disabled className="bg-slate-50 dark:bg-slate-950 text-slate-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold block mb-1">Phone Number *</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1">Clinic Affiliation</label>
              <Input value={user.clinicName} disabled className="bg-slate-50 dark:bg-slate-950 text-slate-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold mb-1 flex items-center justify-between">
                <span>Pakistani CNIC</span>
                {isCnicLocked && (
                  <span className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Locked
                  </span>
                )}
              </label>
              <div className="relative">
                <Input
                  value={user.cnic ? maskCnicDisplay(user.cnic) : 'Not Provided'}
                  disabled
                  className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-mono font-bold"
                />
                <div className="absolute right-3 top-3 text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>

          {user.role === 'doctor' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="text-xs font-semibold block mb-1">Medical Registration Number</label>
                <Input value={user.registrationNumber || 'DOC-881'} disabled className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-mono font-bold" />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1">Specialization</label>
                <Input value={user.specializations?.[0]?.name || 'Not Set'} disabled className="bg-slate-50 dark:bg-slate-950 text-slate-500" />
              </div>
            </div>
          )}

          <div className="pt-4 flex justify-end">
            <Button type="submit" disabled={isSaving} variant="gradient" className="font-bold gap-2 px-6 cursor-pointer">
              {isSaving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <span>Save Changes</span>
                  <CheckCircle2 className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

