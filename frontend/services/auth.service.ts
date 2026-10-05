import { User, UserRole } from '@/types/mediflow';
import { AppError, fetchApi } from './api-client';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  getSession as mockGetSession,
  signIn as mockSignIn,
  signUp as mockSignUp,
  signOut as mockSignOut,
} from '@/lib/mock-auth';

export function sanitizeNextParam(nextParam?: string | null): string | null {
  if (!nextParam) return null;
  const decoded = decodeURIComponent(nextParam);
  if (decoded.startsWith('/') && !decoded.startsWith('//') && !decoded.includes('\\')) {
    return decoded;
  }
  return null;
}

export function redirectForSession(
  session: User | null,
  currentPath: string,
  nextParam?: string | null
): string {
  const isAuthPage =
    currentPath === '/login' ||
    currentPath.startsWith('/signup') ||
    currentPath === '/verify' ||
    currentPath === '/forgot-password';

  const isOnboardingPage = currentPath.startsWith('/onboarding');
  const isPublicRoot = currentPath === '/';

  // 1. Unauthenticated users
  if (!session) {
    if (isAuthPage || isPublicRoot) {
      return currentPath;
    }
    const safeNext = sanitizeNextParam(currentPath) || currentPath;
    return `/login?next=${encodeURIComponent(safeNext)}`;
  }

  // 2. Authenticated Doctor with incomplete profile
  if (session.role === 'doctor' && session.onboardingStatus !== 'complete') {
    if (isOnboardingPage) {
      return currentPath;
    }
    return '/onboarding/doctor';
  }

  // 3. Authenticated user visiting auth pages
  if (isAuthPage || isOnboardingPage || isPublicRoot) {
    const safeNext = sanitizeNextParam(nextParam);
    const defaultDash = session.role === 'doctor' ? '/doctor/dashboard' : '/receptionist/dashboard';
    return safeNext || defaultDash;
  }

  return currentPath;
}

export async function getSession(): Promise<User | null> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === 'true') {
    return await mockGetSession();
  }

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) return null;

    // Fetch full profile from backend
    const profile = await fetchApi('/auth/me');
    if (!profile) return null;

    return {
      id: profile.id,
      email: session.user.email || profile.email || '',
      fullName: profile.name || profile.fullName || 'User',
      phone: profile.phone || '',
      role: profile.role === 'staff' ? 'receptionist' : profile.role,
      specialization: profile.specialization || (Array.isArray(profile.specializations) ? profile.specializations[0]?.name : undefined),
      licenseNumber: profile.license_number || profile.licenseNumber,
      yearsExperience: profile.experience_years || profile.yearsExperience,
      department: profile.department,
      employeeId: profile.employee_id || profile.employeeId,
      shift: profile.shift,
      departmentOrDesk: profile.department_or_desk || profile.departmentOrDesk,
      onboardingStatus: profile.onboarding_status || (profile.profile_completed ? 'complete' : 'in_progress'),
    } as User;
  } catch (err) {
    console.error('[getSession] error fetching user session:', err);
    return null;
  }
}

export async function login(credentials: { email: string; password: string }): Promise<User> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === 'true') {
    return await mockSignIn(credentials);
  }

  const supabase = getSupabaseClient();
  if (!supabase) throw new AppError('AUTH_CLIENT_ERROR', 'Auth client not initialized');

  const { data, error } = await supabase.auth.signInWithPassword({
    email: credentials.email.trim(),
    password: credentials.password,
  });

  if (error) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const session = await getSession();
  if (!session) {
    throw new AppError('LOGIN_FAILED', 'Could not retrieve user profile.');
  }

  return session;
}

export async function startOnboarding(
  role: UserRole,
  initialData: { fullName: string; email: string; phone: string; password?: string; clinicId?: string; clinicName?: string }
): Promise<{ user_id: string }> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === 'true') {
    const res = await mockSignUp({
      fullName: initialData.fullName,
      email: initialData.email,
      password: initialData.password || '',
      phone: initialData.phone,
      role: role === 'doctor' ? 'doctor' : 'receptionist',
      clinicName: initialData.clinicName,
    });
    return { user_id: res.id };
  }

  const endpoint = role === 'doctor' ? '/auth/signup/doctor' : '/auth/signup/staff';
  const body = role === 'doctor' ? {
    email: initialData.email.trim(),
    password: initialData.password,
    name: initialData.fullName.trim(),
    phone: initialData.phone.trim(),
  } : {
    email: initialData.email.trim(),
    password: initialData.password,
    name: initialData.fullName.trim(),
    phone: initialData.phone.trim(),
    clinic_name: initialData.clinicName?.trim() || 'Main Clinic',
  };

  const res = await fetchApi(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return { user_id: res.user_id };
}

export async function logout(): Promise<void> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === 'true') {
    await mockSignOut();
    return;
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
}

export async function saveOnboardingStep(
  userId: string,
  stepNumber: number,
  stepData: Record<string, any>,
  isFinalStep: boolean
): Promise<User> {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === 'true') {
    const session = await mockGetSession();
    if (!session) throw new AppError('SESSION_LOST', 'Session lost');
    return session;
  }

  if (stepNumber === 1) {
    await fetchApi('/onboarding/doctor/info', {
      method: 'POST',
      body: JSON.stringify({
        qualification: stepData.qualification,
        license_number: stepData.license_number,
        clinic_name: stepData.clinic_name || 'Main Clinic',
        cnic: stepData.cnic,
      }),
    });
  } else if (stepNumber === 2) {
    await fetchApi('/onboarding/doctor/specialization', {
      method: 'POST',
      body: JSON.stringify({
        specializations: stepData.specializations,
      }),
    });
  } else if (stepNumber === 3) {
    await fetchApi('/onboarding/doctor/availability', {
      method: 'POST',
      body: JSON.stringify({
        daily_patient_limit: stepData.daily_patient_limit || stepData.daily_limit || 20,
        daily_limit: stepData.daily_patient_limit || stepData.daily_limit || 20,
        dates: stepData.dates,
        start_time: stepData.start_time,
        end_time: stepData.end_time,
        slot_minutes: stepData.slot_minutes || 15,
        break_start: stepData.break_start || null,
        break_end: stepData.break_end || null,
        availability: stepData.availability,
      }),
    });
  }

  const updatedSession = await getSession();
  if (!updatedSession) throw new AppError('SESSION_LOST', 'Session lost after onboarding');
  return updatedSession;
}
