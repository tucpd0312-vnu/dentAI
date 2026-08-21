'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import type { Role } from '@/lib/auth';
import { useAuth } from '@/components/providers/AuthProvider';

/**
 * `roles` bỏ trống = mọi vai trò thấy được.
 *
 * Ẩn mục ở đây chỉ là trải nghiệm — backend chặn độc lập ở permission_classes,
 * nên gõ thẳng URL cũng không vào được.
 */
const NAV: { href: string; icon: string; label: string; prefix: string; roles?: Role[] }[] = [
  { href: '/dashboard',    icon: 'dashboard',    label: 'Tổng quan',          prefix: '/dashboard' },
  { href: '/analysis/new', icon: 'add_circle',   label: 'Chẩn đoán viêm lợi',      prefix: '/analysis'  },
  { href: '/scans',        icon: 'view_in_ar',   label: 'Răng nanh ngầm 3D',  prefix: '/scans',      roles: ['admin', 'doctor'] },
  { href: '/users',        icon: 'group',        label: 'Quản lý người dùng', prefix: '/users',      roles: ['admin'] },
  { href: '/history',      icon: 'history',      label: 'Lịch sử',            prefix: '/history'   },
  { href: '/system-log',   icon: 'receipt_long', label: 'Lịch sử hệ thống',   prefix: '/system-log', roles: ['admin'] },
  { href: '/settings',     icon: 'settings',     label: 'Cài đặt',            prefix: '/settings',   roles: ['admin', 'doctor'] },
  { href: '/help',         icon: 'help',         label: 'Hướng dẫn',          prefix: '/help'      },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { role, user } = useAuth();

  const items = NAV.filter(item => !item.roles || (role && item.roles.includes(role)));
  // Số yêu cầu vai trò admin xử lý được ngay — đã có sẵn trong /auth/me/,
  // không tốn thêm request nào cho badge này.
  const pendingRequests = user?.pending_role_requests ?? 0;

  return (
    <aside
      className={`
        flex flex-col h-screen bg-white border-r border-gray-200 shrink-0
        transition-all duration-200 ease-in-out
        ${collapsed ? 'w-16' : 'w-60'}
      `}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 h-14 px-4 border-b border-gray-200 overflow-hidden">
        <span className="material-symbols-outlined text-primary text-[22px] shrink-0">
          health_and_safety
        </span>
        {!collapsed && (
          <span className="font-serif font-bold text-primary text-[17px] whitespace-nowrap">
            DentAI
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto">
        {items.map(({ href, icon, label, prefix }) => {
          const active = pathname.startsWith(prefix);
          const badge = href === '/users' ? pendingRequests : 0;
          return (
            <Link
              key={href}
              href={href}
              title={
                collapsed
                  ? badge > 0
                    ? `${label} — ${badge} yêu cầu chờ duyệt`
                    : label
                  : undefined
              }
              className={`
                relative flex items-center gap-3 px-3 py-2.5 mx-2 rounded-xl text-sm font-medium
                transition-colors duration-150
                ${active
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
              `}
            >
              <span className="material-symbols-outlined text-[20px] shrink-0">{icon}</span>
              {!collapsed && <span className="truncate">{label}</span>}
              {badge > 0 && (
                collapsed ? (
                  // Sidebar thu gọn: chấm đỏ ở góc icon, không đủ chỗ cho con số.
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
                ) : (
                  <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                    {badge}
                  </span>
                )
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-gray-200 p-2">
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          className="
            flex items-center justify-center w-full h-9 rounded-xl
            text-gray-400 hover:bg-gray-100 hover:text-gray-600
            transition-colors duration-150
          "
        >
          <span className="material-symbols-outlined text-[20px]">
            {collapsed ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>
      </div>
    </aside>
  );
}
