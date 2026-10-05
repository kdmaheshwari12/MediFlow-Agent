// Demo-only mock auth. Not secure. Replace with a real auth provider before production.

import { User } from '@/types/mediflow';

const USERS_KEY = 'mediflow_mock_users_v2';
const SESSION_KEY = 'mediflow_mock_session_v2';

export interface StoredUser extends User {
  passwordHash: string;
}

// Helper: Web Crypto SHA-256 password hashing
async function hashPassword(password: string): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    // Fallback simple hash for non-crypto browser environments if any
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `simple_${hash}`;
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Helper: simulate network delay (~600ms)
function delay(ms: number = 600): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper: safe localStorage access
function getStoredUsers(): StoredUser[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredUsers(users: StoredUser[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (err) {
    console.error('Failed to save mock users to localStorage', err);
  }
}

export async function getSession(): Promise<User | null> {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as User;
    return session;
  } catch {
    return null;
  }
}

export async function signUp(userData: Omit<User, 'id'> & { password: string }): Promise<User> {
  await delay(600);
  const users = getStoredUsers();
  const emailClean = userData.email.trim().toLowerCase();

  // Check duplicate email
  const existing = users.find((u) => u.email.trim().toLowerCase() === emailClean);
  if (existing) {
    throw new Error('An account with this email already exists.');
  }

  const passwordHash = await hashPassword(userData.password);

  const newUser: User = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    fullName: userData.fullName.trim(),
    email: emailClean,
    phone: userData.phone.trim(),
    role: userData.role,
    specialization: userData.specialization,
    licenseNumber: userData.licenseNumber,
    yearsExperience: userData.yearsExperience,
    department: userData.department,
    employeeId: userData.employeeId,
    shift: userData.shift,
    departmentOrDesk: userData.departmentOrDesk,
  };

  const storedUser: StoredUser = {
    ...newUser,
    passwordHash,
  };

  users.push(storedUser);
  saveStoredUsers(users);

  // NOTE: signUp must NOT create a logged-in session, it only saves the account.
  return newUser;
}

export async function signIn(credentials: { email: string; password: string }): Promise<User> {
  await delay(600);
  const users = getStoredUsers();
  const emailClean = credentials.email.trim().toLowerCase();

  const user = users.find((u) => u.email.trim().toLowerCase() === emailClean);
  if (!user) {
    throw new Error('Invalid email or password.');
  }

  const inputHash = await hashPassword(credentials.password);
  if (inputHash !== user.passwordHash) {
    throw new Error('Invalid email or password.');
  }

  // Create session object (omit sensitive passwordHash)
  const { passwordHash: _, ...sessionUser } = user;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    } catch (err) {
      console.error('Failed to save session to localStorage', err);
    }
  }

  return sessionUser;
}

export async function signOut(): Promise<void> {
  await delay(200);
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (err) {
      console.error('Failed to clear session from localStorage', err);
    }
  }
}
