'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.push('/analysis/new/');
    } else {
      router.push('/login/');
    }
  }, [loading, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <span className="material-symbols-outlined text-5xl text-gray-300 animate-spin">autorenew</span>
    </div>
  );
}