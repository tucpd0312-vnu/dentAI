'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationKind,
  type NotificationLevel,
  type UserNotification,
} from '@/lib/notifications';

const KIND_ICON: Record<NotificationKind, string> = {
  share: 'share',
  processing: 'task_alt',
  role: 'badge',
  system: 'notifications',
};

const LEVEL_STYLE: Record<NotificationLevel, string> = {
  info: 'bg-blue-50 text-blue-600',
  success: 'bg-green-50 text-green-600',
  warning: 'bg-amber-50 text-amber-600',
  error: 'bg-red-50 text-red-600',
};

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso));
}

export default function NotificationBell() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const inbox = await fetchNotifications();
      setItems(inbox.results);
      setUnread(inbox.unread_count);
      setError(false);
    } catch {
      setError(true);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => void load(false), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    void load(false);
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, load]);

  async function openItem(item: UserNotification) {
    if (!item.is_read) {
      setItems(current => current.map(n => (
        n.id === item.id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
      )));
      setUnread(current => Math.max(0, current - 1));
      try {
        await markNotificationRead(item.id);
      } catch {
        void load(false);
      }
    }
    setOpen(false);
    if (item.link.startsWith('/')) router.push(item.link);
  }

  async function markAllRead() {
    if (unread === 0) return;
    setUnread(0);
    setItems(current => current.map(item => ({
      ...item,
      is_read: true,
      read_at: item.read_at ?? new Date().toISOString(),
    })));
    try {
      await markAllNotificationsRead();
    } catch {
      void load(false);
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        <span className="material-symbols-outlined text-[22px]">notifications</span>
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Trung tâm thông báo"
          className="absolute right-0 z-50 mt-1.5 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Thông báo</h2>
              <p className="text-[11px] text-gray-400">
                {unread > 0 ? `${unread} thông báo chưa đọc` : 'Bạn đã đọc tất cả thông báo'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unread === 0}
              className="text-xs font-medium text-primary hover:underline disabled:cursor-default disabled:text-gray-300 disabled:no-underline"
            >
              Đánh dấu đã đọc
            </button>
          </div>

          <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
                <span className="material-symbols-outlined animate-spin text-[20px]">autorenew</span>
                Đang tải thông báo…
              </div>
            ) : error && items.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-gray-500">Không tải được thông báo.</p>
                <button type="button" onClick={() => void load(true)} className="mt-2 text-xs text-primary hover:underline">
                  Thử lại
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <span className="material-symbols-outlined text-4xl text-gray-300">notifications_off</span>
                <p className="mt-2 text-sm">Chưa có thông báo nào</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {items.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void openItem(item)}
                    className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                      item.is_read ? 'bg-white' : 'bg-primary-50/50'
                    }`}
                  >
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${LEVEL_STYLE[item.level]}`}>
                      <span className="material-symbols-outlined text-[19px]">
                        {item.level === 'error' ? 'error' : KIND_ICON[item.kind]}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        <span className={`min-w-0 flex-1 text-sm leading-snug ${item.is_read ? 'font-medium text-gray-700' : 'font-semibold text-gray-900'}`}>
                          {item.title}
                        </span>
                        {!item.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      </span>
                      {item.message && (
                        <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
                          {item.message}
                        </span>
                      )}
                      <span className="mt-1 block text-[10px] text-gray-400">
                        {relativeTime(item.created_at)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
