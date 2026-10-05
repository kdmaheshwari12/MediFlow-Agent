'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, UserRole } from '@/types/mediflow';
import {
  getSession as apiGetSession,
  login as apiLogin,
  startOnboarding as apiStartOnboarding,
  logout as apiLogout,
} from '@/services/auth.service';

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (credentials: { email: string; password: string }) => Promise<User>;
  signUp: (data: Omit<User, 'id'> & { password: string }) => Promise<{ user_id: string }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const activeUser = await apiGetSession();
      setUser(activeUser);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const signIn = async (credentials: { email: string; password: string }): Promise<User> => {
    setLoading(true);
    try {
      const loggedInUser = await apiLogin(credentials);
      setUser(loggedInUser);
      return loggedInUser;
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (data: Omit<User, 'id'> & { password: string }): Promise<{ user_id: string }> => {
    return await apiStartOnboarding(data.role, {
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      password: data.password,
      clinicName: data.clinicName,
    });
  };

  const signOut = async (): Promise<void> => {
    setLoading(true);
    try {
      await apiLogout();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        loading,
        signIn,
        signUp,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
