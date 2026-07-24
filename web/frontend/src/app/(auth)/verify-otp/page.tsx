'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';

export default function VerifyOTPPage() {
  const { verifyOTP, resendOTP } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleChange(index: number, value: string) {
    if (!/^\d?$/.test(value)) return;
    const next = [...code];
    next[index] = value;
    setCode(next);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    if (next.every(c => c)) {
      handleSubmit(next.join(''));
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  async function handleSubmit(otp: string) {
    if (!email || otp.length !== 6 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await verifyOTP(email, otp);
      router.push('/analysis/new/');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data;
      setError(msg?.detail || 'Xác thực thất bại.');
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!email || resending) return;
    setResending(true);
    setResendMsg(null);
    try {
      await resendOTP(email);
      setResendMsg('Mã OTP mới đã được gửi.');
    } catch {
      setResendMsg('Gửi lại thất bại. Vui lòng thử lại.');
    } finally {
      setResending(false);
    }
  }

  if (!email) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
        <span className="material-symbols-outlined text-4xl text-red-300">error</span>
        <p className="text-sm text-gray-600 mt-3">Thiếu thông tin email.</p>
        <Link href="/register/" className="text-sm text-primary hover:underline mt-2 inline-block">
          Quay lại đăng ký
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-6 text-center border-b border-gray-100">
        <span className="material-symbols-outlined text-[36px] text-primary mb-2 block">mark_email_read</span>
        <h1 className="font-serif font-bold text-lg text-gray-900">Xác thực email</h1>
        <p className="text-sm text-gray-500 mt-1">
          Nhập mã 6 chữ số đã gửi đến{' '}
          <span className="font-medium text-gray-700">{email}</span>
        </p>
      </div>

      <div className="p-6 space-y-5">
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
            <span>{error}</span>
          </div>
        )}

        {resendMsg && (
          <div className="px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 text-center">
            {resendMsg}
          </div>
        )}

        <div className="flex justify-center gap-2.5">
          {code.map((digit, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              disabled={submitting}
              className="w-11 h-13 text-center text-xl font-bold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50 transition-colors"
            />
          ))}
        </div>

        {submitting && (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
            <span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span>
            Đang xác thực…
          </div>
        )}

        <div className="text-center text-sm">
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="text-primary hover:underline disabled:opacity-50"
          >
            {resending ? 'Đang gửi lại…' : 'Gửi lại mã OTP'}
          </button>
        </div>

        <div className="text-center text-xs text-gray-400 pt-2 border-t border-gray-100">
          <Link href="/register/" className="hover:underline">Đăng ký với email khác</Link>
          {' · '}
          <Link href="/login/" className="hover:underline">Quay lại đăng nhập</Link>
        </div>
      </div>
    </div>
  );
}