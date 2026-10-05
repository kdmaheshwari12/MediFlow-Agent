'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { PageHeader } from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Settings, Bell, Lock, Building, CheckCircle2, Stethoscope, Trash2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { doctorSpecializationSchema } from '@/constants/onboarding';
import { fetchApi } from '@/services/api-client';

function SpecializationsSettings() {
  const { user } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState<{id: string, name: string}[]>([]);
  const [showSuggestionsForIdx, setShowSuggestionsForIdx] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    reset,
    formState: { errors },
  } = useForm<any>({
    resolver: zodResolver(doctorSpecializationSchema as any),
    defaultValues: {
      specializations: user?.specializations || [
        { name: '', experience_years: 0, is_primary: true }
      ]
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "specializations",
  });

  const watchedSpecializations = watch('specializations');

  useEffect(() => {
    if (user?.specializations && user.specializations.length > 0) {
      reset({ specializations: user.specializations });
    }
  }, [user, reset]);

  const onSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      await fetchApi('/onboarding/doctor/specialization', {
        method: 'POST',
        body: JSON.stringify({
          specializations: data.specializations
        }),
      });
      // Optionally we can re-fetch /auth/me and update the store here, but typically a reload or full app state refresh handles it.
      toast.success('Specializations updated successfully.');
    } catch (err: any) {
      toast.error(err.userMessage || 'Failed to update specializations');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSpecializationChange = async (index: number, val: string) => {
    setValue(`specializations.${index}.name`, val);
    if (val.trim().length > 1) {
      try {
        const res = await fetchApi(`/specializations/suggest?q=${encodeURIComponent(val)}`);
        setSuggestions(res || []);
        setShowSuggestionsForIdx(index);
      } catch {
        setSuggestions([]);
      }
    } else {
      setSuggestions([]);
    }
  };

  const selectSuggestion = (index: number, name: string) => {
    setValue(`specializations.${index}.name`, name);
    setShowSuggestionsForIdx(null);
  };

  const setPrimary = (index: number) => {
    const updated = watchedSpecializations.map((s: any, i: number) => ({
      ...s,
      is_primary: i === index
    }));
    setValue('specializations', updated);
  };

  return (
    <Card className="p-6 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-6">
      <div className="space-y-1">
        <h3 className="text-sm font-bold font-heading text-slate-900 dark:text-white">Manage Specializations</h3>
        <p className="text-xs text-slate-500">Update your clinical specializations and experience. The primary specialization is highlighted on your profile.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {fields.map((field, index) => {
          const specErr = (errors.specializations as any)?.[index];
          const isPrimary = watchedSpecializations[index]?.is_primary;

          return (
            <div key={field.id} className={`p-4 border rounded-xl space-y-3 bg-slate-50 dark:bg-slate-800/50 ${isPrimary ? 'ring-2 ring-teal-500' : ''}`}>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm">Specialization {index + 1}</h4>
                  {isPrimary && <Badge className="bg-teal-600 text-white text-[10px]">Primary</Badge>}
                </div>
                <div className="flex items-center gap-3">
                  {!isPrimary && (
                    <button type="button" onClick={() => setPrimary(index)} className="text-xs text-teal-600 font-bold hover:underline">
                      Set as Primary
                    </button>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} disabled={fields.length === 1} className="text-red-500 h-8 px-2 disabled:opacity-50">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 relative">
                <div className="col-span-2 relative">
                  <label className="text-xs font-semibold mb-1 block">Specialization Name *</label>
                  <Input
                    autoComplete="off"
                    placeholder="e.g. Cardiology"
                    {...register(`specializations.${index}.name`)}
                    onChange={(e) => handleSpecializationChange(index, e.target.value)}
                    onFocus={() => setShowSuggestionsForIdx(index)}
                    onBlur={() => setTimeout(() => setShowSuggestionsForIdx(null), 200)}
                  />
                  {specErr?.name && <p className="text-xs text-red-500 mt-1">{specErr.name.message}</p>}
                  
                  {showSuggestionsForIdx === index && suggestions.length > 0 && (
                    <ul className="absolute z-10 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                      {suggestions.map(s => (
                        <li 
                          key={s.id} 
                          className="p-2 px-3 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          onClick={() => selectSuggestion(index, s.name)}
                        >
                          {s.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Years of Exp *</label>
                  <Input type="number" {...register(`specializations.${index}.experience_years`, { valueAsNumber: true })} />
                  {specErr?.experience_years && <p className="text-xs text-red-500 mt-1">{specErr.experience_years.message}</p>}
                </div>
              </div>
            </div>
          )
        })}
        
        {fields.length < 5 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => append({ name: '', experience_years: 0, is_primary: false })}
            className="w-full gap-2 border-dashed"
          >
            <Plus className="h-4 w-4" /> Add Another Specialization
          </Button>
        )}

        <div className="pt-4 flex justify-end">
          <Button type="submit" disabled={isSubmitting} variant="gradient" className="font-bold gap-2">
            {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            <span>Save Specializations</span>
          </Button>
        </div>
      </form>
    </Card>
  );
}


export default function SettingsPage() {
  const { user } = useAuthStore();

  const handleSave = () => {
    toast.success('Settings updated successfully.');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Clinic Settings"
        subtitle="Manage notifications, account security, session options, and clinic operation rules"
      />

      <Tabs defaultValue="notifications" className="space-y-6">
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl w-full justify-start overflow-x-auto">
          <TabsTrigger value="notifications" className="rounded-xl text-xs font-bold gap-2">
            <Bell className="h-3.5 w-3.5" />
            <span>Notifications</span>
          </TabsTrigger>
          {user?.role === 'doctor' && (
            <TabsTrigger value="specializations" className="rounded-xl text-xs font-bold gap-2">
              <Stethoscope className="h-3.5 w-3.5" />
              <span>Specializations</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="security" className="rounded-xl text-xs font-bold gap-2">
            <Lock className="h-3.5 w-3.5" />
            <span>Security & Sessions</span>
          </TabsTrigger>
          <TabsTrigger value="clinic" className="rounded-xl text-xs font-bold gap-2">
            <Building className="h-3.5 w-3.5" />
            <span>Clinic Information</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notifications">
          <Card className="p-6 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">SMS Patient Alerts</h3>
                  <p className="text-xs text-slate-500">Automatically send appointment confirmation and follow-up SMS</p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Live Queue Sound Alerts</h3>
                  <p className="text-xs text-slate-500">Play an audio alert when a new patient enters waiting status</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>

            <Button variant="gradient" onClick={handleSave} className="font-bold gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <span>Save Notification Preferences</span>
            </Button>
          </Card>
        </TabsContent>

        {user?.role === 'doctor' && (
          <TabsContent value="specializations">
            <SpecializationsSettings />
          </TabsContent>
        )}

        <TabsContent value="security">
          <Card className="p-6 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-4 text-xs">
            <h3 className="text-sm font-bold font-heading text-slate-900 dark:text-white">Session & Security Rules</h3>
            <p className="text-slate-500">All patient records and clinical memory caches are cleared upon logout.</p>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 space-y-1">
              <span className="font-bold text-slate-900 dark:text-white block">Active Device Session</span>
              <p className="text-slate-500 font-mono">Current IP: 127.0.0.1 • Browser: Chrome / Next.js Client</p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="clinic">
          <Card className="p-6 rounded-3xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-3 text-xs">
            <h3 className="text-sm font-bold font-heading text-slate-900 dark:text-white">{user?.clinicName}</h3>
            <p className="text-slate-500">Clinic Hours: 08:00 AM - 08:00 PM • Slot Duration: 30 Minutes</p>
            <p className="text-slate-500">Location: Suite 400, Medical Plaza, Main Boulevard, Lahore</p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
