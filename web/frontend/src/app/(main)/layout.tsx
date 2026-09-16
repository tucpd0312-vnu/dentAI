'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import { useAuth } from '@/components/providers/AuthProvider';
import SessionGuard from '@/components/providers/SessionGuard';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const qaWorkspace = (user?.role === 'doctor' || user?.role === 'student') && pathname.startsWith('/chat');
  const telemedicineWorkspace = pathname.startsWith('/telemedicine');
  const receptionistPaths = ['/dashboard', '/dashboard/', '/library', '/library/', '/reception/data', '/reception/data/', '/reception/appointments', '/reception/appointments/', '/telemedicine', '/telemedicine/'];
  const receptionistOutsideWorkspace = user?.role === 'receptionist' && !receptionistPaths.some(path => pathname === path || pathname.startsWith(`${path}/`));
  const telemedicineBlockedPath = telemedicineWorkspace && user?.role !== 'doctor' && user?.role !== 'receptionist';
  const patientBlockedPath =
    user?.role === 'patient' &&
    ['/library', '/chat', '/help', '/settings', '/users', '/system-log'].some(prefix =>
      pathname.startsWith(prefix),
    );
  const adminBlockedPath =
    user?.role === 'admin' &&
    ['/library', '/chat', '/help', '/history', '/gingivitis', '/plaque', '/scans', '/analysis'].some(prefix =>
      pathname.startsWith(prefix),
    );

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login/');
    } else if (!loading && (receptionistOutsideWorkspace || telemedicineBlockedPath || patientBlockedPath || adminBlockedPath)) {
      router.replace('/dashboard/');
    }
  }, [adminBlockedPath, loading, patientBlockedPath, receptionistOutsideWorkspace, router, telemedicineBlockedPath, user]);

  if (loading || !user || receptionistOutsideWorkspace || telemedicineBlockedPath || patientBlockedPath || adminBlockedPath) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <span className="material-symbols-outlined text-5xl text-gray-300 animate-spin">autorenew</span>
      </div>
    );
  }

  // Telemedicine có thanh điều hướng và role switcher riêng để mô phỏng trọn vẹn
  // quy trình của bác sĩ/lễ tân mà không bị lặp lại khung sidebar của hệ thống.
  if (telemedicineWorkspace) {
    return (
      <div className="h-screen overflow-y-auto bg-[#f5f7fb]">
        <SessionGuard />
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <SessionGuard />
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar />
        <main className={`min-h-0 flex-1 ${qaWorkspace ? 'overflow-hidden' : user.role === 'receptionist' ? 'overflow-y-auto p-0' : 'overflow-y-auto p-6'}`}>{children}</main>
        {!qaWorkspace && user.role !== 'receptionist' && <footer className="shrink-0 border-t border-gray-200 bg-white px-6 py-2.5 text-xs text-gray-400 text-center">
          DentAI © 2026 - Hệ thống AI nha khoa đa chức năng
        </footer>}
      </div>
    </div>
  );
}
