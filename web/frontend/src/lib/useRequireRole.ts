'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import type { Role } from './auth';
import { useAuth } from '@/components/providers/AuthProvider';

/**
 * Chặn truy cập trang theo vai trò, chuyển hướng về `/dashboard` nếu không đủ quyền.
 *
 * Đây CHỈ là trải nghiệm — mọi endpoint tương ứng đều đã có permission ở backend,
 * nên gõ thẳng URL cũng không lấy được dữ liệu.
 *
 * Trả về `allowed` để trang hiển thị màn chờ thay vì nháy nội dung rồi mới chuyển.
 */
export function useRequireRole(roles: Role[]): { allowed: boolean; checking: boolean } {
  const { role, loading } = useAuth();
  const router = useRouter();

  const allowed = !!role && roles.includes(role);

  useEffect(() => {
    if (loading) return;
    if (!allowed) router.replace('/dashboard/');
  }, [loading, allowed, router]);

  return { allowed, checking: loading };
}