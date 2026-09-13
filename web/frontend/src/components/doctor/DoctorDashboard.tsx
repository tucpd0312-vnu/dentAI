'use client';

import Link from 'next/link';

import type { AuthUser } from '@/lib/auth';

function value(value: string | number | null | undefined, fallback = 'Chưa cập nhật') {
  return value === null || value === undefined || value === '' ? fallback : value;
}

export default function DoctorDashboard({ user }: { user: AuthUser }) {
  const rows = [
    ['Họ và tên', value(user.full_name)],
    ['Tuổi', user.age == null ? 'Chưa cập nhật' : `${user.age} tuổi`],
    ['Đơn vị công tác', value(user.organization)],
    ['Mã giảng viên', value(user.lecturer_code)],
    ['Số điện thoại', value(user.phone)],
    ['Email', value(user.email)],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary-600 to-teal-700 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <span className="material-symbols-outlined text-[34px]">school</span>
            </span>
            <div>
              <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white/90">
                Hồ sơ Bác sĩ (Giảng viên)
              </span>
              <h1 className="mt-2 font-serif text-2xl font-semibold">
                {user.full_name || user.username}
              </h1>
              <p className="mt-1 text-sm text-white/75">
                {user.organization || 'Chưa cập nhật đơn vị công tác'}
              </p>
            </div>
          </div>
          <Link
            href="/profile/"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-primary shadow-sm transition hover:bg-primary-50"
          >
            <span className="material-symbols-outlined text-[19px]">edit</span>
            Cập nhật hồ sơ
          </Link>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="font-serif text-[15px] font-semibold text-gray-900">
              Thông tin giảng viên
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Thông tin nhận diện và liên hệ trong hệ thống.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
            <span className="material-symbols-outlined text-[15px]">verified</span>
            Đã xác thực
          </span>
        </div>
        <dl className="grid sm:grid-cols-2">
          {rows.map(([label, content]) => (
            <div key={label} className="border-b border-gray-100 px-5 py-4 odd:sm:border-r last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0">
              <dt className="text-xs font-medium text-gray-500">{label}</dt>
              <dd className="mt-1 break-words text-sm font-medium text-gray-900">{content}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary">
              <span className="material-symbols-outlined text-[22px]">badge</span>
            </span>
            <div>
              <p className="text-xs text-gray-500">Tên đăng nhập</p>
              <p className="text-sm font-medium text-gray-900">@{user.username}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">Tài khoản DentAI đã được xác thực.</p>
        </div>
      </section>
    </div>
  );
}
