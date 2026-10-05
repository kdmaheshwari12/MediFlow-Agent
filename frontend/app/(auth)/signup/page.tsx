'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/components/auth-provider';
import { UserRole } from '@/types/mediflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  Stethoscope,
  ClipboardList,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
  Activity,
  ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{7,15}$/;

const step1Schema = z
  .object({
    role: z.enum(['doctor', 'receptionist']),
    fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.'),
    email: z.string().trim().min(1, 'Email is required.').email('Please enter a valid email address.'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .refine((val) => /[A-Z]/.test(val), { message: 'Password must contain at least one uppercase letter.' })
      .refine((val) => /[a-z]/.test(val), { message: 'Password must contain at least one lowercase letter.' })
      .refine((val) => /[0-9]/.test(val), { message: 'Password must contain at least one number.' })
      .refine((val) => /[^A-Za-z0-9]/.test(val), { message: 'Password must contain at least one special character.' }),
    confirmPassword: z.string().min(1, 'Confirm password is required.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

type Step1Values = z.infer<typeof step1Schema>;

const doctorStep2Schema = z.object({
  phone: z.string().trim().min(1, 'Phone number is required.').regex(phoneRegex, 'Invalid phone number format.'),
  specialization: z.string().trim().min(1, 'Please select a specialization.'),
  licenseNumber: z.string().trim().min(1, 'Medical license number is required.'),
  yearsExperience: z.string().trim().min(1, 'Years of experience is required.'),
  department: z.string().trim().min(1, 'Department is required.'),
});

type DoctorStep2Values = z.infer<typeof doctorStep2Schema>;

const receptionistStep2Schema = z.object({
  phone: z.string().trim().min(1, 'Phone number is required.').regex(phoneRegex, 'Invalid phone number format.'),
  employeeId: z.string().trim().min(1, 'Employee ID is required.'),
  shift: z.enum(['Morning', 'Evening', 'Night'], { message: 'Please select a shift.' }),
  departmentOrDesk: z.string().trim().min(1, 'Department or desk is required.'),
});

type ReceptionistStep2Values = z.infer<typeof receptionistStep2Schema>;

const SPECIALIZATIONS = [
  'General Medicine',
  'Cardiology',
  'Pediatrics',
  'Orthopedics',
  'Dermatology',
  'Neurology',
  'Oncology',
  'Psychiatry',
  'Emergency Medicine',
  'Surgery',
  'Obstetrics & Gynecology',
];

export default function SignUpPage() {
  const router = useRouter();
  const { user, signUp, loading: authLoading } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [selectedRole, setSelectedRole] = useState<'doctor' | 'receptionist'>('doctor');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Redirect signed-in users
  useEffect(() => {
    if (!authLoading && user) {
      const target = user.role === 'doctor' ? '/doctor/dashboard' : '/receptionist/dashboard';
      router.replace(target);
    }
  }, [user, authLoading, router]);

  // Form step 1
  const {
    register: registerStep1,
    handleSubmit: handleSubmitStep1,
    watch: watchStep1,
    setValue: setValueStep1,
    formState: { errors: errorsStep1 },
  } = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      role: 'doctor',
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  // Form step 2 - Doctor
  const {
    register: registerDoctor,
    handleSubmit: handleSubmitDoctor,
    formState: { errors: errorsDoctor },
  } = useForm<DoctorStep2Values>({
    resolver: zodResolver(doctorStep2Schema),
    defaultValues: {
      phone: '',
      specialization: '',
      licenseNumber: '',
      yearsExperience: '',
      department: '',
    },
  });

  // Form step 2 - Receptionist
  const {
    register: registerReceptionist,
    handleSubmit: handleSubmitReceptionist,
    formState: { errors: errorsReceptionist },
  } = useForm<ReceptionistStep2Values>({
    resolver: zodResolver(receptionistStep2Schema),
    defaultValues: {
      phone: '',
      employeeId: '',
      shift: 'Morning',
      departmentOrDesk: '',
    },
  });

  const passwordValue = watchStep1('password') || '';
  const confirmPasswordValue = watchStep1('confirmPassword') || '';

  // Password rule tests
  const rules = [
    { label: 'Password must be at least 8 characters.', pass: passwordValue.length >= 8 },
    { label: 'Password must contain at least one uppercase letter.', pass: /[A-Z]/.test(passwordValue) },
    { label: 'Password must contain at least one lowercase letter.', pass: /[a-z]/.test(passwordValue) },
    { label: 'Password must contain at least one number.', pass: /[0-9]/.test(passwordValue) },
    { label: 'Password must contain at least one special character.', pass: /[^A-Za-z0-9]/.test(passwordValue) },
    { label: 'Passwords do not match.', pass: confirmPasswordValue.length > 0 && passwordValue === confirmPasswordValue },
  ];

  const handleRoleSelect = (role: 'doctor' | 'receptionist') => {
    setSelectedRole(role);
    setValueStep1('role', role);
  };

  const onStep1Submit = (data: Step1Values) => {
    setErrorMessage(null);
    setDirection(1);
    setStep(2);
  };

  const handleCreateAccount = async (step2Data: DoctorStep2Values | ReceptionistStep2Values) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const step1Data = watchStep1();

      await signUp({
        fullName: step1Data.fullName,
        email: step1Data.email,
        password: step1Data.password,
        phone: step2Data.phone,
        role: selectedRole,
        ...(selectedRole === 'doctor'
          ? {
              specialization: (step2Data as DoctorStep2Values).specialization,
              licenseNumber: (step2Data as DoctorStep2Values).licenseNumber,
              yearsExperience: (step2Data as DoctorStep2Values).yearsExperience,
              department: (step2Data as DoctorStep2Values).department,
            }
          : {
              employeeId: (step2Data as ReceptionistStep2Values).employeeId,
              shift: (step2Data as ReceptionistStep2Values).shift,
              departmentOrDesk: (step2Data as ReceptionistStep2Values).departmentOrDesk,
            }),
      });

      toast.success('Account created successfully. Please sign in.');
      router.push('/login?registered=1');
    } catch (err: any) {
      const msg = err.message || 'Failed to create account.';
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
            Clinic Staff Onboarding
          </Badge>
          <h1 className="text-4xl font-heading font-extrabold leading-tight">
            Join Your Clinical Workspace
          </h1>
          <p className="text-teal-100 text-sm leading-relaxed">
            Create your Doctor or Receptionist account in seconds to access patient scheduling, medical records, and clinic workflow management.
          </p>
          <div className="pt-2 flex items-center gap-2 text-xs text-teal-200">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            <span>Fast browser-based mock registration</span>
          </div>
        </div>

        <div className="relative z-10 text-xs text-teal-200">
          © {new Date().getFullYear()} MediFlow Technologies. All rights reserved.
        </div>
      </div>

      {/* Right Form Area */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-xl p-6 sm:p-8 rounded-3xl border border-slate-200/80 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 space-y-6">
          {/* Header & Step Indicator */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-heading font-extrabold text-slate-900 dark:text-white">
                  Create Account
                </h2>
                <p className="text-xs text-slate-500">
                  {step === 1 ? 'Step 1: Account credentials & role selection' : 'Step 2: Additional role profile details'}
                </p>
              </div>
              <Badge variant="secondary" className="text-xs font-bold px-3 py-1 bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                Step {step} of 2
              </Badge>
            </div>

            <Progress value={step === 1 ? 50 : 100} className="h-2 rounded-full bg-slate-100 dark:bg-slate-800" />
          </div>

          {/* Error Message Alert */}
          {errorMessage && (
            <div
              role="alert"
              className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/50 dark:border-red-900 dark:text-red-300 flex items-start gap-3 text-sm font-medium animate-in shake"
            >
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Step 1 or Step 2 Animation Container */}
          <AnimatePresence mode="wait" initial={false}>
            {step === 1 ? (
              <motion.form
                key="step1"
                initial={{ opacity: 0, x: direction * -40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -40 }}
                transition={{ duration: 0.25 }}
                onSubmit={handleSubmitStep1(onStep1Submit)}
                className="space-y-5"
              >
                {/* Role Selector Cards */}
                <div>
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 block">
                    Select Your Role *
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => handleRoleSelect('doctor')}
                      className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all cursor-pointer ${
                        selectedRole === 'doctor'
                          ? 'border-teal-600 bg-teal-50/50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-100 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <div
                        className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                          selectedRole === 'doctor' ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        <Stethoscope className="h-6 w-6" />
                      </div>
                      <span className="text-sm font-bold">Doctor</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRoleSelect('receptionist')}
                      className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all cursor-pointer ${
                        selectedRole === 'receptionist'
                          ? 'border-teal-600 bg-teal-50/50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-100 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <div
                        className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                          selectedRole === 'receptionist' ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        <ClipboardList className="h-6 w-6" />
                      </div>
                      <span className="text-sm font-bold">Receptionist</span>
                    </button>
                  </div>
                </div>

                {/* Full Name */}
                <div>
                  <label htmlFor="fullName" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                    Full Name *
                  </label>
                  <Input
                    id="fullName"
                    placeholder={selectedRole === 'doctor' ? 'Dr. Sarah Connor' : 'Jane Doe'}
                    autoComplete="name"
                    aria-invalid={!!errorsStep1.fullName}
                    aria-describedby={errorsStep1.fullName ? 'fullName-error' : undefined}
                    {...registerStep1('fullName')}
                    className="h-11 rounded-xl"
                  />
                  {errorsStep1.fullName && (
                    <p id="fullName-error" role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {errorsStep1.fullName.message}
                    </p>
                  )}
                </div>

                {/* Email Address */}
                <div>
                  <label htmlFor="email" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                    Email Address *
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    autoComplete="email"
                    aria-invalid={!!errorsStep1.email}
                    aria-describedby={errorsStep1.email ? 'email-error' : undefined}
                    {...registerStep1('email')}
                    className="h-11 rounded-xl"
                  />
                  {errorsStep1.email && (
                    <p id="email-error" role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {errorsStep1.email.message}
                    </p>
                  )}
                </div>

                {/* Passwords grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Password */}
                  <div>
                    <label htmlFor="password" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                      Password *
                    </label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        aria-invalid={!!errorsStep1.password}
                        aria-describedby={errorsStep1.password ? 'password-error' : undefined}
                        {...registerStep1('password')}
                        className="h-11 rounded-xl pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errorsStep1.password && (
                      <p id="password-error" role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {errorsStep1.password.message}
                      </p>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label htmlFor="confirmPassword" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                      Confirm Password *
                    </label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        aria-invalid={!!errorsStep1.confirmPassword}
                        aria-describedby={errorsStep1.confirmPassword ? 'confirmPassword-error' : undefined}
                        {...registerStep1('confirmPassword')}
                        className="h-11 rounded-xl pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errorsStep1.confirmPassword && (
                      <p id="confirmPassword-error" role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {errorsStep1.confirmPassword.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Live Password Checklist */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-2">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Password Requirements:</p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                    {rules.map((rule, idx) => (
                      <li
                        key={idx}
                        className={`flex items-center gap-1.5 transition-colors ${
                          rule.pass ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {rule.pass ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                        <span>{rule.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Continue Button */}
                <Button type="submit" variant="gradient" className="w-full h-11 text-sm font-bold gap-2 cursor-pointer">
                  <span>Continue</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-500">
                  Already have an account?{' '}
                  <Link href="/login" className="font-bold text-teal-600 dark:text-teal-400 hover:underline">
                    Sign in
                  </Link>
                </div>
              </motion.form>
            ) : (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: direction * 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * 40 }}
                transition={{ duration: 0.25 }}
              >
                {selectedRole === 'doctor' ? (
                  <form onSubmit={handleSubmitDoctor(handleCreateAccount)} className="space-y-4">
                    {/* Phone Number */}
                    <div>
                      <label htmlFor="phone" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Phone Number *
                      </label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+1 (555) 019-2834"
                        autoComplete="tel"
                        aria-invalid={!!errorsDoctor.phone}
                        aria-describedby={errorsDoctor.phone ? 'phone-error' : undefined}
                        {...registerDoctor('phone')}
                        className="h-11 rounded-xl"
                      />
                      {errorsDoctor.phone && (
                        <p id="phone-error" role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                          {errorsDoctor.phone.message}
                        </p>
                      )}
                    </div>

                    {/* Specialization Select */}
                    <div>
                      <label htmlFor="specialization" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Specialization *
                      </label>
                      <Select
                        id="specialization"
                        aria-invalid={!!errorsDoctor.specialization}
                        {...registerDoctor('specialization')}
                      >
                        <option value="">Select Specialization</option>
                        {SPECIALIZATIONS.map((spec) => (
                          <option key={spec} value={spec}>
                            {spec}
                          </option>
                        ))}
                      </Select>
                      {errorsDoctor.specialization && (
                        <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                          {errorsDoctor.specialization.message}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Medical License Number */}
                      <div>
                        <label htmlFor="licenseNumber" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                          Medical License Number *
                        </label>
                        <Input
                          id="licenseNumber"
                          placeholder="DOC-99823"
                          aria-invalid={!!errorsDoctor.licenseNumber}
                          {...registerDoctor('licenseNumber')}
                          className="h-11 rounded-xl"
                        />
                        {errorsDoctor.licenseNumber && (
                          <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                            {errorsDoctor.licenseNumber.message}
                          </p>
                        )}
                      </div>

                      {/* Years of Experience */}
                      <div>
                        <label htmlFor="yearsExperience" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                          Years of Experience *
                        </label>
                        <Input
                          id="yearsExperience"
                          type="number"
                          placeholder="e.g. 8"
                          aria-invalid={!!errorsDoctor.yearsExperience}
                          {...registerDoctor('yearsExperience')}
                          className="h-11 rounded-xl"
                        />
                        {errorsDoctor.yearsExperience && (
                          <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                            {errorsDoctor.yearsExperience.message}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Department */}
                    <div>
                      <label htmlFor="department" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Department *
                      </label>
                      <Input
                        id="department"
                        placeholder="Outpatient Cardiology"
                        aria-invalid={!!errorsDoctor.department}
                        {...registerDoctor('department')}
                        className="h-11 rounded-xl"
                      />
                      {errorsDoctor.department && (
                        <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                          {errorsDoctor.department.message}
                        </p>
                      )}
                    </div>

                    {/* Step 2 Actions */}
                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setDirection(-1);
                          setStep(1);
                        }}
                        className="flex-1 h-11 rounded-xl gap-2 cursor-pointer"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        <span>Back</span>
                      </Button>
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        variant="gradient"
                        className="flex-1 h-11 rounded-xl gap-2 font-bold cursor-pointer"
                      >
                        {isSubmitting ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            <span>Creating...</span>
                          </>
                        ) : (
                          <>
                            <span>Create Account</span>
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleSubmitReceptionist(handleCreateAccount)} className="space-y-4">
                    {/* Phone Number */}
                    <div>
                      <label htmlFor="phoneRec" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Phone Number *
                      </label>
                      <Input
                        id="phoneRec"
                        type="tel"
                        placeholder="+1 (555) 019-2834"
                        autoComplete="tel"
                        aria-invalid={!!errorsReceptionist.phone}
                        {...registerReceptionist('phone')}
                        className="h-11 rounded-xl"
                      />
                      {errorsReceptionist.phone && (
                        <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                          {errorsReceptionist.phone.message}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Employee ID */}
                      <div>
                        <label htmlFor="employeeId" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                          Employee ID *
                        </label>
                        <Input
                          id="employeeId"
                          placeholder="EMP-4401"
                          aria-invalid={!!errorsReceptionist.employeeId}
                          {...registerReceptionist('employeeId')}
                          className="h-11 rounded-xl"
                        />
                        {errorsReceptionist.employeeId && (
                          <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                            {errorsReceptionist.employeeId.message}
                          </p>
                        )}
                      </div>

                      {/* Shift Select */}
                      <div>
                        <label htmlFor="shift" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                          Shift *
                        </label>
                        <Select
                          id="shift"
                          aria-invalid={!!errorsReceptionist.shift}
                          {...registerReceptionist('shift')}
                        >
                          <option value="Morning">Morning (8 AM - 4 PM)</option>
                          <option value="Evening">Evening (4 PM - 12 AM)</option>
                          <option value="Night">Night (12 AM - 8 AM)</option>
                        </Select>
                        {errorsReceptionist.shift && (
                          <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                            {errorsReceptionist.shift.message}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Department or Desk */}
                    <div>
                      <label htmlFor="departmentOrDesk" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                        Department or Desk *
                      </label>
                      <Input
                        id="departmentOrDesk"
                        placeholder="Main Reception Desk"
                        aria-invalid={!!errorsReceptionist.departmentOrDesk}
                        {...registerReceptionist('departmentOrDesk')}
                        className="h-11 rounded-xl"
                      />
                      {errorsReceptionist.departmentOrDesk && (
                        <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                          {errorsReceptionist.departmentOrDesk.message}
                        </p>
                      )}
                    </div>

                    {/* Step 2 Actions */}
                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setDirection(-1);
                          setStep(1);
                        }}
                        className="flex-1 h-11 rounded-xl gap-2 cursor-pointer"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        <span>Back</span>
                      </Button>
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        variant="gradient"
                        className="flex-1 h-11 rounded-xl gap-2 font-bold cursor-pointer"
                      >
                        {isSubmitting ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            <span>Creating...</span>
                          </>
                        ) : (
                          <>
                            <span>Create Account</span>
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>
    </div>
  );
}
