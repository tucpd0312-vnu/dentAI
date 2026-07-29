'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  fetchCurrentUser,
  login as authLogin,
  register as authRegister,
  verifyOTP as authVerifyOTP,
  resendOTP as authResendOTP,
  changePassword as authChangePassword,
  logout as authLogout,
  getStoredUser,
  isAuthenticated,
  getAccessToken,
  type AuthUser,
  type Role,
} from '@/lib/auth';

interface AuthContextValue {
  user: AuthUser | null;
  role: Role | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, confirmPassword: string) => Promise<{ email: string }>;
  verifyOTP: (email: string, code: string) => Promise<void>;
  resendOTP: (email: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    if (!isAuthenticated()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const u = await fetchCurrentUser();
      setUser(u);
    } catch {
      setUser(getStoredUser());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await authLogin(username, password);
    setUser(res.user);
  }, []);

  const register = useCallback(async (username: string, email: string, password: string, confirmPassword: string) => {
    return await authRegister(username, email, password, confirmPassword);
  }, []);

  const verifyOTP = useCallback(async (email: string, code: string) => {
    const res = await authVerifyOTP(email, code);
    setUser(res.user);
  }, []);

  const resendOTP = useCallback(async (email: string) => {
    await authResendOTP(email);
  }, []);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    await authChangePassword(oldPassword, newPassword);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    authLogout();
  }, []);

  const value: AuthContextValue = {
    user,
    role: user?.role ?? null,
    loading,
    login,
    register,
    verifyOTP,
    resendOTP,
    changePassword,
    logout,
    refreshUser: loadUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}