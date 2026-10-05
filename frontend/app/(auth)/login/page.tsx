'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Activity,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required.').email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registeredParam = searchParams.get('registered');

  const { user, signIn, loading: authLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRegisteredAlert, setShowRegisteredAlert] = useState(false);

  useEffect(() => {
    if (registeredParam === '1') {
      setShowRegisteredAlert(true);
    }
  }, [registeredParam]);

  // Redirect signed in users to their dashboard
  useEffect(() => {
    if (!authLoading && user) {
      const target = user.role === 'doctor' ? '/doctor/dashboard' : '/receptionist/dashboard';
      router.replace(target);
    }
  }, [user, authLoading, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const loggedInUser = await signIn(data);
      toast.success(`Welcome back, ${loggedInUser.fullName}!`);
      const target = loggedInUser.role === 'doctor' ? '/doctor/dashboard' : '/receptionist/dashboard';
      router.replace(target);
    } catch (err: any) {
      const msg = 'Invalid email or password.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) return null;

  return (
    <div className="min-h-[100dvh] w-full flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Left Split Brand Panel (Desktop) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-tr from-teal-900 via-emerald-800 to-teal-700 text-white p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white text-teal-800 flex items-center justify-center font-bold">
              <Activity className="h-6 w-6" />
            </div>
            <span className="font-heading font-extrabold text-2xl tracking-tight">MediFlow</span>
          </Link>
        </div>

        <div className="relative z-10 max-w-md space-y-4">
          <Badge variant="outline" className="text-white border-white/40 text-xs px-3 py-1">
            Clinical Operating System
          </Badge>
          <h1 className="text-4xl font-heading font-extrabold leading-tight">
            Production-Grade Clinic Management
          </h1>
          <p className="text-teal-100 text-sm leading-relaxed">
            Manage patient records, schedule appointments, generate print-ready prescriptions, and automatically send AI follow-up messages.
          </p>
          <div className="pt-2 flex items-center gap-2 text-xs text-teal-200">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            <span>Encrypted memory-only clinical caching</span>
          </div>
        </div>

        <div className="relative z-10 text-xs text-teal-200">
          © {new Date().getFullYear()} MediFlow Technologies. All rights reserved.
        </div>
      </div>

      {/* Right Form Area */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <Card className="w-full max-w-md p-6 sm:p-8 rounded-3xl border border-slate-200/80 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 space-y-6">
          <div className="space-y-2 text-center lg:text-left">
            <div className="lg:hidden inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-teal-600 text-white mb-2">
              <Lock className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-heading font-extrabold text-slate-900 dark:text-white">
              Clinic Workspace Login
            </h2>
            <p className="text-sm text-slate-500">
              Sign in with your Doctor or Receptionist credentials.
            </p>
          </div>

          {/* Dismissible Registration Success Alert */}
          {showRegisteredAlert && (
            <Alert className="bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-200 relative rounded-2xl">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <AlertTitle className="font-bold text-xs">Account Created</AlertTitle>
              <AlertDescription className="text-xs">
                Account created successfully. Please sign in below.
              </AlertDescription>
              <button
                type="button"
                onClick={() => setShowRegisteredAlert(false)}
                className="absolute top-3 right-3 text-emerald-600 dark:text-emerald-400 hover:text-emerald-900 p-1 cursor-pointer"
                aria-label="Dismiss alert"
              >
                <X className="h-4 w-4" />
              </button>
            </Alert>
          )}

          {/* Error Alert */}
          {errorMessage && (
            <div
              role="alert"
              className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/50 dark:border-red-900 dark:text-red-300 flex items-start gap-3 text-sm font-medium animate-in shake"
            >
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="email" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                Email Address *
              </label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                autoComplete="email"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...register('email')}
                className="h-11 rounded-xl"
              />
              {errors.email && (
                <p id="email-error" role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                Password *
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  {...register('password')}
                  className="h-11 rounded-xl pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              variant="gradient"
              className="w-full h-11 text-sm font-bold gap-2 mt-2 rounded-xl cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center text-sm text-slate-500">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-bold text-teal-600 dark:text-teal-400 hover:underline">
              Create an account
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-400">Loading Login...</div>}>
      <LoginContent />
    </Suspense>
  );
}
