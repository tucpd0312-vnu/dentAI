'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CHECK_INTERVAL_MS,
  WARN_BEFORE_MS,
  formatCountdown,
  markActivity,
  msUntilExpiry,
  slideSessionIfNeeded,
  watchActivity,
} from '@/lib/session';
import { useAuth } from './AuthProvider';

/**
 * Theo dõi thời gian không tương tác và đăng xuất sau 1 giờ.
 *
 * Đặt trong `(main)/layout.tsx` nên chỉ chạy ở khu vực đã đăng nhập.
 * Modal cảnh báo hiện trước 2 phút; mọi tab dùng chung mốc thời gian trong
 * localStorage nên làm việc ở tab này không làm tab kia hết phiên.
 */
export default function SessionGuard() {
  const { user, logout } = useAuth();
  const [remaining, setRemaining] = useState<number | null>(null);
  const expiringRef = useRef(false);

  const endSession = useCallback(() => {
    if (expiringRef.current) return;
    expiringRef.current = true;
    setRemaining(null);
    // logout() tự gọi /auth/logout/ để blacklist token rồi xoá session.
    void logout('idle_timeout').finally(() => {
      window.location.href = '/login/?reason=timeout';
    });
  }, [logout]);

  const stayLoggedIn = useCallback(() => {
    markActivity();
    setRemaining(null);
    void slideSessionIfNeeded(true);
  }, []);

  useEffect(() => {
    if (!user) return;

    const tick = () => {
      const left = msUntilExpiry();
      if (left <= 0) endSession();
      else setRemaining(left <= WARN_BEFORE_MS ? left : null);
    };

    // Tương tác vừa xảy ra → ẩn cảnh báo và gia hạn token nếu đã đủ cũ.
    const stopWatching = watchActivity(() => {
      setRemaining(null);
      void slideSessionIfNeeded();
    });

    tick();
    // Nhịp 1s cố định: đủ mượt cho đồng hồ đếm ngược, và giữ `remaining` KHÔNG nằm
    // trong deps — nếu để nó ở đó thì interval và listener bị dựng lại mỗi giây.
    // Mỗi tick chỉ là một phép so sánh + một lần đọc localStorage.
    const id = window.setInterval(tick, 1000);

    return () => {
      stopWatching();
      window.clearInterval(id);
    };
  }, [user, endSession]);

  if (!user || remaining === null) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-warning-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex flex-col items-center px-6 pt-6 text-center">
          <span className="material-symbols-outlined mb-2 text-[40px] text-amber-500">
            schedule
          </span>
          <h2 id="session-warning-title" className="font-serif text-lg font-semibold text-gray-900">
            Phiên đăng nhập sắp hết hạn
          </h2>
          <p className="mt-1.5 text-sm text-gray-500">
            Bạn sẽ được đăng xuất tự động sau
          </p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-primary">
            {formatCountdown(remaining)}
          </p>
          <p className="mt-2 text-xs text-gray-400">
            do không có thao tác nào trong 1 giờ qua
          </p>
        </div>

        <div className="mt-5 flex gap-2 border-t border-gray-100 p-4">
          <button
            onClick={endSession}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            Đăng xuất
          </button>
          <button
            onClick={stayLoggedIn}
            autoFocus
            className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
          >
            Tiếp tục làm việc
          </button>
        </div>
      </div>
    </div>
  );
}