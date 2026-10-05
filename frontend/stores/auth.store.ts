import { create } from 'zustand';
import { User, UserRole } from '@/types/mediflow';
import {
  login as apiLogin,
  logout as apiLogout,
  getSession,
  startOnboarding as apiStartOnboarding,
  saveOnboardingStep as apiSaveOnboardingStep,
} from '@/services/auth.service';

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  login: (credentials: { email: string; password: string }) => Promise<User>;
  setDemoUser: (email: string) => Promise<User>;
  logout: () => Promise<void>;
  initSession: () => Promise<User | null>;
  startOnboarding: (role: UserRole, data: { fullName: string; email: string; phone: string; password?: string }) => Promise<any>;
  saveStep: (stepNumber: number, data: Record<string, any>, isFinalStep: boolean) => Promise<User>;
}

// Multi-tab logout broadcast channel
let logoutChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    logoutChannel = new BroadcastChannel('mediflow_auth_sync');
    logoutChannel.onmessage = (event) => {
      if (event.data?.type === 'LOGOUT') {
        useAuthStore.setState({ user: null, loading: false });
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    };
  } catch {
    // Graceful fallback
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  initialized: false,

  initSession: async () => {
    set({ loading: true });
    try {
      const session = await getSession();
      set({ user: session, loading: false, initialized: true });
      return session;
    } catch {
      set({ user: null, loading: false, initialized: true });
      return null;
    }
  },

  login: async (credentials) => {
    set({ loading: true });
    try {
      const user = await apiLogin(credentials);
      set({ user, loading: false });
      return user;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  setDemoUser: async (email: string) => {
    throw new Error('Demo mode is disabled in production.');
  },

  logout: async () => {
    set({ loading: true });
    await apiLogout();
    set({ user: null, loading: false });
    if (logoutChannel) {
      logoutChannel.postMessage({ type: 'LOGOUT', timestamp: Date.now() });
    }
  },

  startOnboarding: async (role, data) => {
    set({ loading: true });
    try {
      const res = await apiStartOnboarding(role, data);
      set({ loading: false });
      return res;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  saveStep: async (stepNumber, data, isFinalStep) => {
    const current = get().user;
    if (!current) throw new Error('No active user session');
    set({ loading: true });
    try {
      const updated = await apiSaveOnboardingStep(current.id, stepNumber, data, isFinalStep);
      set({ user: updated, loading: false });
      return updated;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },
}));
