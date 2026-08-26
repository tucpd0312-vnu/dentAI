'use client';

import { useState } from 'react';
import Link from 'next/link';

import { requestPasswordReset, resetPassword } from '@/lib/auth';
import { apiErrorMessage } from '@/lib/users';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await requestPasswordReset(email.trim());
      setNotice(result.detail);
      setStep('reset');
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thể gửi mã lúc này. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email.trim(), code.trim(), password, confirmPassword);
      setStep('done');
      setNotice(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thể đặt lại mật khẩu. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-6 text-center">
        <span className="material-symbols-outlined mb-2 block text-[34px] text-primary">
          lock_reset
        </span>
        <h1 className="font-serif text-xl font-bold text-gray-900">Quên mật khẩu</h1>
        <p className="mt-1 text-sm text-gray-500">
          {step === 'email' && 'Nhận mã OTP qua email đã đăng ký'}
          {step === 'reset' && 'Nhập mã OTP và tạo mật khẩu mới'}
          {step === 'done' && 'Mật khẩu của bạn đã được cập nhật'}
        </p>
      </div>

      <div className="space-y-4 p-6">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <span className="material-symbols-outlined mt-0.5 text-[16px]">error</span>
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-700">
            <span className="material-symbols-outlined mt-0.5 text-[16px]">info</span>
            <span>{notice}</span>
          </div>
        )}

        {step === 'email' && (
          <form onSubmit={requestCode} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Nhập email đã đăng ký"
                required
                autoFocus
                disabled={busy}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-50"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Đang gửi…' : 'Gửi mã đặt lại mật khẩu'}
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={submitReset} className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <span className="truncate">{email}</span>
              <button
                type="button"
                onClick={() => { setStep('email'); setCode(''); setError(null); }}
                className="ml-2 shrink-0 font-medium text-primary hover:underline"
              >
                Đổi email
              </button>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Mã OTP</label>
              <input
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 chữ số"
                required
                autoFocus
                disabled={busy}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center font-mono text-lg tracking-[0.35em] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            {[
              { label: 'Mật khẩu mới', value: password, set: setPassword },
              { label: 'Xác nhận mật khẩu', value: confirmPassword, set: setConfirmPassword },
            ].map(field => (
              <div key={field.label}>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">{field.label}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={field.value}
                    onChange={e => field.set(e.target.value)}
                    required
                    minLength={8}
                    disabled={busy}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-10 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100"
                  >
                    <span className="material-symbols-outlined block text-[18px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>
            ))}
            <p className="text-[11px] leading-relaxed text-gray-400">
              Ít nhất 8 ký tự, gồm chữ hoa, chữ thường và chữ số.
            </p>
            <button
              type="submit"
              disabled={busy || code.length !== 6 || !password || !confirmPassword}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Đang cập nhật…' : 'Đặt lại mật khẩu'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="space-y-4 text-center">
            <span className="material-symbols-outlined text-5xl text-green-500">check_circle</span>
            <p className="text-sm text-gray-600">Hãy đăng nhập bằng mật khẩu mới.</p>
            <Link
              href="/login/"
              className="inline-flex w-full items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary-600"
            >
              Về trang đăng nhập
            </Link>
          </div>
        )}

        {step !== 'done' && (
          <p className="text-center text-sm text-gray-500">
            <Link href="/login/" className="font-medium text-primary hover:underline">
              Quay lại đăng nhập
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
