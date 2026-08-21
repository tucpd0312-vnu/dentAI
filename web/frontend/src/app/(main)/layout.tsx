'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import { useAuth } from '@/components/providers/AuthProvider';
import SessionGuard from '@/components/providers/SessionGuard';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login/');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <span className="material-symbols-outlined text-5xl text-gray-300 animate-spin">autorenew</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <SessionGuard />
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
        <footer className="shrink-0 border-t border-gray-200 bg-white px-6 py-2.5 text-xs text-gray-400 text-center">
          DentAI © 2026 - Hệ thống AI nha khoa đa chức năng
        </footer>
      </div>
    </div>
  );
}