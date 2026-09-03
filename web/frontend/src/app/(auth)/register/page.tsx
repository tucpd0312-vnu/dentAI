'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';

type RequestedRole = 'patient' | 'student' | 'doctor';

const inputCls =
  'w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none ' +
  'focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 ' +
  'disabled:text-gray-400 transition-colors';

/** Ô chọn vai trò, có mô tả quyền và yêu cầu phê duyệt của từng lựa chọn. */
function RoleCard({
  value,
  active,
  icon,
  title,
  desc,
  onClick,
  disabled,
}: {
  value: RequestedRole;
  active: boolean;
  icon: string;
  title: string;
  desc: string;
  onClick: (v: RequestedRole) => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(value)}
      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${
        active
          ? 'border-primary bg-primary-50 ring-2 ring-primary/20'
          : 'border-gray-300 hover:bg-gray-50'
      }`}
    >
      <span
        className={`material-symbols-outlined text-[22px] ${active ? 'text-primary' : 'text-gray-400'}`}
      >
        {icon}
      </span>
      <span className={`text-sm font-medium ${active ? 'text-primary' : 'text-gray-800'}`}>
        {title}
      </span>
      <span className="text-[11px] leading-snug text-gray-500">{desc}</span>
    </button>
  );
}

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();

  const [role, setRole] = useState<RequestedRole>('patient');
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    lastName: '',
    firstName: '',
    phone: '',
    organization: '',
    note: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(key: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [key]: value }));
  }

  const isDoctor = role === 'doctor';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.username.trim() || !form.email.trim() || !form.password) return;
    if (form.password !== form.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await register({
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        requestedRole: role,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        organization: form.organization.trim(),
        note: form.note.trim(),
      });
      router.push(`/verify-otp/?email=${encodeURIComponent(res.email)}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: Record<string, string[] | string> } })?.response?.data;
      if (msg) {
        const firstKey = Object.keys(msg)[0];
        const v = msg[firstKey];
        setError((Array.isArray(v) ? v[0] : v) ?? 'Đăng ký thất bại.');
      } else {
        setError('Đăng ký thất bại. Vui lòng thử lại.');
      }
      setSubmitting(false);
    }
  }

  const canSubmit =
    form.username.trim() &&
    form.email.trim() &&
    form.password &&
    form.confirmPassword &&
    (!isDoctor || (form.lastName.trim() && form.firstName.trim() && form.organization.trim())) &&
    !submitting;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-6 text-center">
        <h1 className="font-serif text-lg font-bold text-gray-900">Tạo tài khoản</h1>
        <p className="mt-1 text-sm text-gray-500">Đăng ký tài khoản DentAI</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5 p-6">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px]">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Vai trò mong muốn */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">
            Bạn đăng ký với vai trò
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <RoleCard
              value="patient"
              active={role === 'patient'}
              icon="person"
              title="Bệnh nhân"
              desc="Tải ảnh và xem kết quả chẩn đoán của mình. Dùng được ngay."
              onClick={setRole}
              disabled={submitting}
            />
            <RoleCard
              value="student"
              active={role === 'student'}
              icon="school"
              title="Sinh viên"
              desc="Xem và chỉnh sửa kết quả viêm lợi. Không cần admin duyệt."
              onClick={setRole}
              disabled={submitting}
            />
            <RoleCard
              value="doctor"
              active={role === 'doctor'}
              icon="stethoscope"
              title="Bác sĩ"
              desc="Thêm quyền chỉnh sửa nhãn chẩn đoán. Cần quản trị viên duyệt."
              onClick={setRole}
              disabled={submitting}
            />
          </div>
        </div>

        {isDoctor && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px]">info</span>
            <span>
              Tài khoản của bạn sẽ hoạt động ngay với quyền bệnh nhân. Quyền chỉnh sửa
              nhãn chẩn đoán được cấp sau khi quản trị viên duyệt — vì dữ liệu chỉnh sửa
              được dùng để huấn luyện lại mô hình AI.
            </span>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">Tên đăng nhập</label>
          <input
            type="text"
            value={form.username}
            onChange={e => update('username', e.target.value)}
            placeholder="Chọn tên đăng nhập"
            required
            disabled={submitting}
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => update('email', e.target.value)}
            placeholder="nhap@email.com"
            required
            disabled={submitting}
            className={inputCls}
          />
        </div>

        {/* Thông tin bổ sung — chỉ khi xin làm bác sĩ */}
        {isDoctor && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Họ *</label>
                <input
                  type="text"
                  value={form.lastName}
                  onChange={e => update('lastName', e.target.value)}
                  placeholder="Nguyễn Văn"
                  required
                  disabled={submitting}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Tên *</label>
                <input
                  type="text"
                  value={form.firstName}
                  onChange={e => update('firstName', e.target.value)}
                  placeholder="An"
                  required
                  disabled={submitting}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">
                Đơn vị công tác *
              </label>
              <input
                type="text"
                value={form.organization}
                onChange={e => update('organization', e.target.value)}
                placeholder="VD: Khoa Răng Hàm Mặt — Bệnh viện Bạch Mai"
                required
                disabled={submitting}
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">
                Số điện thoại
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => update('phone', e.target.value)}
                placeholder="Để quản trị viên liên hệ xác minh"
                disabled={submitting}
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">
                Ghi chú gửi quản trị viên
              </label>
              <textarea
                value={form.note}
                onChange={e => update('note', e.target.value)}
                rows={2}
                placeholder="VD: Bác sĩ nội trú năm 2, số chứng chỉ hành nghề…"
                disabled={submitting}
                className={`${inputCls} resize-none`}
              />
            </div>
          </>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">Mật khẩu</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={e => update('password', e.target.value)}
              placeholder="Tối thiểu 8 ký tự"
              required
              minLength={8}
              disabled={submitting}
              className={`${inputCls} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(value => !value)}
              disabled={submitting}
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
            >
              <span className="material-symbols-outlined block text-[19px]">
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">
            Xác nhận mật khẩu
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={form.confirmPassword}
              onChange={e => update('confirmPassword', e.target.value)}
              placeholder="Nhập lại mật khẩu"
              required
              minLength={8}
              disabled={submitting}
              className={`${inputCls} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(value => !value)}
              disabled={submitting}
              aria-label={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'}
              title={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
            >
              <span className="material-symbols-outlined block text-[19px]">
                {showConfirmPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-400">
          Mật khẩu tối thiểu 8 ký tự, bao gồm chữ hoa, chữ thường và số.
        </p>

        <button
          type="submit"
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 active:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[18px]">autorenew</span>
              Đang đăng ký…
            </>
          ) : (
            'Đăng ký'
          )}
        </button>

        <p className="text-center text-sm text-gray-500">
          Đã có tài khoản?{' '}
          <Link href="/login/" className="font-medium text-primary hover:underline">
            Đăng nhập
          </Link>
        </p>
      </form>
    </div>
  );
}
