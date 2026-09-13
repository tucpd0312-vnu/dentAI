'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ROLE_LABEL, type Role } from '@/lib/auth';
import { useAuth } from '@/components/providers/AuthProvider';
import NotificationBell from '@/components/layout/NotificationBell';

function getTitle(pathname: string, role?: Role): string {
  if (pathname.startsWith('/dashboard')) {
    if (role === 'patient') return 'Hồ sơ bệnh nhân';
    if (role === 'doctor') return 'Hồ sơ bác sĩ';
    return 'Tổng quan';
  }
  if (pathname === '/analysis/new') return 'Chẩn đoán viêm lợi';
  if (/^\/analysis\/[^/]+\/processing/.test(pathname)) return 'Đang xử lý…';
  if (/^\/analysis\/[^/]+\/results\/[^/]+\/edit/.test(pathname)) return 'Chỉnh sửa kết quả';
  if (/^\/analysis\/[^/]+\/results/.test(pathname)) return 'Kết quả chẩn đoán';
  if (pathname.startsWith('/history')) return role === 'patient' || role === 'doctor' ? 'Lịch sử' : 'Lịch sử chẩn đoán';
  if (pathname.startsWith('/appointments')) return 'Đặt hẹn tư vấn';
  if (pathname.startsWith('/telemedicine')) return role === 'doctor' ? 'Lịch hẹn của tôi' : 'Telemedicine';
  if (pathname.startsWith('/profile')) return 'Hồ sơ cá nhân';
  if (pathname === '/scans/new') return 'Tải phim CBCT';
  if (/^\/scans\/[^/]+/.test(pathname)) return 'Chi tiết phim CBCT';
  if (pathname.startsWith('/scans')) return 'Phim răng nanh ngầm 3D';
  if (pathname.startsWith('/plaque')) return 'Chẩn đoán mảng bám răng';
  if (pathname.startsWith('/gingivitis')) return 'Chẩn đoán viêm lợi';
  if (pathname === '/library/new') return 'Tải dữ liệu lên';
  if (/^\/library\/[^/]+/.test(pathname)) return 'Chi tiết dữ liệu';
  if (pathname.startsWith('/library')) return 'Kho dữ liệu';
  if (pathname.startsWith('/chat')) return role === 'doctor' ? 'Hỏi đáp với sinh viên' : 'Hỏi đáp & Trao đổi';
  if (pathname.startsWith('/users')) return 'Quản lý người dùng';
  if (pathname.startsWith('/system-log')) return 'Lịch sử hệ thống';
  if (pathname.startsWith('/settings')) return 'Cài đặt';
  if (pathname.startsWith('/help')) return 'Hướng dẫn sử dụng';
  return 'AI nha khoa đa chức năng';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Topbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Đóng menu khi click ra ngoài hoặc nhấn Esc.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    window.location.href = '/login/';
  }

  const displayName = user?.full_name || user?.username || '';
  const showConsultationSummary =
    (user?.role === 'patient' || user?.role === 'doctor') && pathname.startsWith('/history');

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex min-w-0 items-center gap-4">
        <h1 className="shrink-0 font-serif text-[18px] font-semibold text-gray-900">
          {getTitle(pathname, user?.role)}
        </h1>
        {showConsultationSummary && (
          <nav className="hidden items-center gap-1.5 lg:flex" aria-label="Tổng quan trạng thái lịch tư vấn">
            {[
              ['Chờ xác nhận', '0'],
              ['Đã xác nhận', '0'],
              ['Đã hoàn tất', '0'],
            ].map(([label, value]) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-primary-50 px-2 py-1 text-[11px] font-medium text-primary">
                {label}
                <span className="rounded-full bg-white px-1.5 py-0.5 font-semibold tabular-nums">{value}</span>
              </span>
            ))}
          </nav>
        )}
      </div>

      {user && (
        <div className="flex items-center gap-1">
          <NotificationBell />
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-2 transition-colors hover:bg-gray-100"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                {initials(displayName)}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block max-w-[150px] truncate text-sm font-medium leading-tight text-gray-800">
                  {displayName}
                </span>
                <span className="block text-[11px] leading-tight text-gray-400">
                  {ROLE_LABEL[user.role]}
                </span>
              </span>
              <span className="material-symbols-outlined text-[18px] text-gray-400">
                {open ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {open && (
              <div
                role="menu"
                className="absolute right-0 z-40 mt-1.5 w-60 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
              >
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
                  <p className="truncate text-xs text-gray-500">{user.email}</p>
                  <span className="mt-1.5 inline-block rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {ROLE_LABEL[user.role]}
                  </span>
                </div>

                {user.role !== 'receptionist' && (
                  <a
                    href={user.role === 'patient' || user.role === 'doctor' ? '/profile/' : '/settings/'}
                    role="menuitem"
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <span className="material-symbols-outlined text-[18px] text-gray-400">person</span>
                    Hồ sơ &amp; đổi mật khẩu
                  </a>
                )}

                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 border-t border-gray-100 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {loggingOut ? 'autorenew' : 'logout'}
                  </span>
                  {loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
