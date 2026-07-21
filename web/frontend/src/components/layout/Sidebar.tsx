'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const NAV = [
  { href: '/analysis/new', icon: 'add_circle', label: 'Phân tích mới', prefix: '/analysis' },
  { href: '/history',      icon: 'history',    label: 'Lịch sử',       prefix: '/history'  },
  { href: '/settings',     icon: 'settings',   label: 'Cài đặt',       prefix: '/settings' },
  { href: '/help',         icon: 'help',       label: 'Hướng dẫn',     prefix: '/help'     },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

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
        {NAV.map(({ href, icon, label, prefix }) => {
          const active = pathname.startsWith(prefix);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`
                flex items-center gap-3 px-3 py-2.5 mx-2 rounded-xl text-sm font-medium
                transition-colors duration-150
                ${active
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
              `}
            >
              <span className="material-symbols-outlined text-[20px] shrink-0">{icon}</span>
              {!collapsed && <span className="truncate">{label}</span>}
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
