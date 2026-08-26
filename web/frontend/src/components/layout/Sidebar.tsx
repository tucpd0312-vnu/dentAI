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
type NavLeaf = { href: string; icon: string; label: string; prefix: string; roles?: Role[] };

/** Nhóm mục con dạng dropdown — không có `href`, bấm vào chỉ đóng/mở danh sách con. */
type NavGroup = { label: string; icon: string; children: NavLeaf[] };

type NavEntry = NavLeaf | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

const NAV: NavEntry[] = [
  { href: '/dashboard', icon: 'dashboard', label: 'Tổng quan', prefix: '/dashboard' },
  {
    label: 'AI chẩn đoán lâm sàng',
    icon: 'auto_awesome',
    children: [
      { href: '/analysis/new', icon: 'oral_disease', label: 'Chẩn đoán viêm lợi',  prefix: '/analysis' },
      { href: '/scans',        icon: 'radiology',    label: 'Răng nanh ngầm 3D',   prefix: '/scans',  roles: ['admin', 'doctor'] },
      { href: '/plaque',       icon: 'dentistry',    label: 'Mảng bám niềng răng', prefix: '/plaque', roles: ['admin', 'doctor'] },
    ],
  },
  { href: '/users',      icon: 'group',        label: 'Quản lý người dùng', prefix: '/users',      roles: ['admin'] },
  { href: '/history',    icon: 'history',      label: 'Lịch sử',            prefix: '/history'   },
  { href: '/system-log', icon: 'receipt_long', label: 'Lịch sử hệ thống',   prefix: '/system-log', roles: ['admin'] },
  { href: '/settings',   icon: 'settings',     label: 'Cài đặt',            prefix: '/settings',   roles: ['admin', 'doctor'] },
  { href: '/help',       icon: 'help',         label: 'Hướng dẫn',          prefix: '/help'      },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  // Ghi đè trạng thái đóng/mở của từng nhóm; nhóm chưa có trong map thì mặc định
  // mở khi người dùng đang đứng ở một mục con của nó.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const { role, user } = useAuth();

  const visible = (item: NavLeaf) => !item.roles || (role && item.roles.includes(role));

  const items = NAV.map(entry => {
    if (!isGroup(entry)) return entry;
    return { ...entry, children: entry.children.filter(visible) };
  }).filter(entry => (isGroup(entry) ? entry.children.length > 0 : visible(entry)));

  // Số yêu cầu vai trò admin xử lý được ngay — đã có sẵn trong /auth/me/,
  // không tốn thêm request nào cho badge này.
  const pendingRequests = user?.pending_role_requests ?? 0;

  function toggleGroup(label: string, defaultOpen: boolean) {
    // Sidebar thu gọn không đủ chỗ hiện mục con → mở rộng lại rồi bung nhóm luôn.
    if (collapsed) {
      setCollapsed(false);
      setOpenGroups(prev => ({ ...prev, [label]: true }));
      return;
    }
    setOpenGroups(prev => ({ ...prev, [label]: !(prev[label] ?? defaultOpen) }));
  }

  function renderLeaf({ href, icon, label, prefix }: NavLeaf, nested: boolean) {
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
          relative flex items-center gap-3 px-3 text-sm font-medium
          transition-colors duration-150
          ${nested ? 'py-2 rounded-lg' : 'mx-2 py-2.5 rounded-xl'}
          ${active
            ? 'bg-primary/10 text-primary'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
        `}
      >
        <span className={`material-symbols-outlined shrink-0 ${nested ? 'text-[18px]' : 'text-[20px]'}`}>
          {icon}
        </span>
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
  }

  function renderGroup(group: NavGroup) {
    const active = group.children.some(child => pathname.startsWith(child.prefix));
    const open = openGroups[group.label] ?? active;
    return (
      <div key={group.label}>
        <button
          type="button"
          onClick={() => toggleGroup(group.label, active)}
          title={collapsed ? group.label : undefined}
          aria-expanded={collapsed ? false : open}
          className={`
            flex w-[calc(100%-1rem)] items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm font-medium
            transition-colors duration-150
            ${active && (collapsed || !open)
              ? 'bg-primary/10 text-primary'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
          `}
        >
          <span className="material-symbols-outlined text-[20px] shrink-0">{group.icon}</span>
          {!collapsed && (
            <>
              <span className="truncate text-left">{group.label}</span>
              <span className="material-symbols-outlined ml-auto text-[18px] text-gray-400">
                {open ? 'expand_less' : 'expand_more'}
              </span>
            </>
          )}
        </button>

        {!collapsed && open && (
          <div className="mt-0.5 ml-6 mr-2 space-y-0.5 border-l border-gray-200 pl-2">
            {group.children.map(child => renderLeaf(child, true))}
          </div>
        )}
      </div>
    );
  }

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
        {items.map(entry => (isGroup(entry) ? renderGroup(entry) : renderLeaf(entry, false)))}
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
