'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { username, email, password, confirmPassword } = form;
    if (!username.trim() || !email.trim() || !password) return;
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await register(username.trim(), email.trim(), password, confirmPassword);
      router.push(`/verify-otp/?email=${encodeURIComponent(res.email)}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      if (msg) {
        const firstKey = Object.keys(msg)[0];
        setError(msg[firstKey]?.[0] ?? 'Đăng ký thất bại.');
      } else {
        setError('Đăng ký thất bại. Vui lòng thử lại.');
      }
      setSubmitting(false);
    }
  }

  const canSubmit = form.username.trim() && form.email.trim() && form.password && form.confirmPassword && !submitting;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-6 text-center border-b border-gray-100">
        <h1 className="font-serif font-bold text-lg text-gray-900">Tạo tài khoản</h1>
        <p className="text-sm text-gray-500 mt-1">Đăng ký tài khoản DentAI</p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-3.5">
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
            value={form.username}
            onChange={e => update('username', e.target.value)}
            placeholder="Chọn tên đăng nhập"
            required
            disabled={submitting}
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => update('email', e.target.value)}
            placeholder="nhap@email.com"
            required
            disabled={submitting}
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Mật khẩu</label>
          <input
            type="password"
            value={form.password}
            onChange={e => update('password', e.target.value)}
            placeholder="Tối thiểu 8 ký tự"
            required
            disabled={submitting}
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Xác nhận mật khẩu</label>
          <input
            type="password"
            value={form.confirmPassword}
            onChange={e => update('confirmPassword', e.target.value)}
            placeholder="Nhập lại mật khẩu"
            required
            disabled={submitting}
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
          />
        </div>

        <p className="text-xs text-gray-400">
          Mật khẩu tối thiểu 8 ký tự, bao gồm chữ hoa, chữ thường và số.
        </p>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-primary text-white shadow-sm hover:bg-primary-600 active:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? (
            <>
              <span className="material-symbols-outlined text-[18px] animate-spin">autorenew</span>
              Đang đăng ký…
            </>
          ) : (
            'Đăng ký'
          )}
        </button>

        <p className="text-center text-sm text-gray-500">
          Đã có tài khoản?{' '}
          <Link href="/login/" className="text-primary font-medium hover:underline">
            Đăng nhập
          </Link>
        </p>
      </form>
    </div>
  );
}