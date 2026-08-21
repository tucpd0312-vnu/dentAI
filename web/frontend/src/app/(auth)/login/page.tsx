'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // SessionGuard chuyển hướng về đây kèm ?reason=timeout khi phiên hết hạn do
  // không hoạt động. Đọc từ window thay vì useSearchParams để không phải bọc
  // Suspense (Next 14 yêu cầu khi prerender).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTimedOut(params.get('reason') === 'timeout');
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    setTimedOut(false);
    try {
      await login(username.trim(), password);
      window.location.href = '/dashboard/';
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { non_field_errors?: string[]; detail?: string } } })?.response?.data;
      if (msg?.non_field_errors?.length) {
        setError(msg.non_field_errors[0]);
      } else if (msg?.detail) {
        setError(msg.detail);
      } else {
        setError('Đăng nhập thất bại. Vui lòng thử lại.');
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-7 text-center border-b border-gray-100">
        <span className="material-symbols-outlined text-primary text-[36px] mb-2 block">health_and_safety</span>
        <h1 className="font-serif font-bold text-xl text-gray-900">DentAI</h1>
        <p className="text-sm text-gray-500 mt-1">Đăng nhập để tiếp tục</p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {timedOut && !error && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">schedule</span>
            <span>
              Phiên đăng nhập đã hết hạn do không hoạt động trong 1 giờ.
              Vui lòng đăng nhập lại.
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Tên đăng nhập</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Nhập tên đăng nhập"
            required
            disabled={submitting}
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Mật khẩu</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Nhập mật khẩu"
            required
            disabled={submitting}
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !username.trim() || !password}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-primary text-white shadow-sm hover:bg-primary-600 active:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? (
            <>
              <span className="material-symbols-outlined text-[18px] animate-spin">autorenew</span>
              Đang đăng nhập…
            </>
          ) : (
            'Đăng nhập'
          )}
        </button>

        <p className="text-center text-sm text-gray-500">
          Chưa có tài khoản?{' '}
          <Link href="/register/" className="text-primary font-medium hover:underline">
            Đăng ký
          </Link>
        </p>
      </form>
    </div>
  );
}