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
  type RegisterPayload,
  type Role,
} from '@/lib/auth';

interface AuthContextValue {
  user: AuthUser | null;
  role: Role | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<{ email: string }>;
  verifyOTP: (email: string, code: string) => Promise<void>;
  resendOTP: (email: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  logout: (reason?: 'idle_timeout') => Promise<void>;
  refreshUser: () => Promise<void>;
  isAdmin: boolean;
  isDoctor: boolean;
  isPatient: boolean;
  isReceptionist: boolean;
  /** Bác sĩ và quản trị viên mới được sửa nhãn (nhãn sửa feed vào FALC). */
  canEditLabels: boolean;
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

  const register = useCallback(async (payload: RegisterPayload) => {
    return await authRegister(payload);
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

  const logout = useCallback(async (reason?: 'idle_timeout') => {
    setUser(null);
    // authLogout gọi /auth/logout/ để blacklist refresh token rồi xoá localStorage.
    await authLogout(reason);
  }, []);

  const role = user?.role ?? null;

  const value: AuthContextValue = {
    user,
    role,
    loading,
    login,
    register,
    verifyOTP,
    resendOTP,
    changePassword,
    logout,
    refreshUser: loadUser,
    isAdmin: role === 'admin',
    isDoctor: role === 'doctor',
    isPatient: role === 'patient',
    isReceptionist: role === 'receptionist',
    canEditLabels: role === 'admin' || role === 'doctor',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
