'use client';

import Link from 'next/link';

import type { AuthUser } from '@/lib/auth';
import { CASE_STATUS_LABEL, type OperationalDashboardData } from '@/lib/dashboard';

function formatDate(value: string | null) {
  if (!value) return 'Chưa có';
  return new Date(value).toLocaleDateString('vi-VN');
}

export default function PatientDashboard({
  user,
  data,
}: {
  user: AuthUser;
  data: OperationalDashboardData;
}) {
  const { cases } = data;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary-600 to-blue-700 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white/90">
              <span className="material-symbols-outlined text-[16px]">health_and_safety</span>
              Hồ sơ bệnh nhân
            </span>
            <h1 className="mt-3 font-serif text-2xl font-semibold">
              Xin chào, {user.full_name || user.username}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/80">
              Quản lý kết quả AI, đặt hẹn tư vấn online và theo dõi hồ sơ sức khoẻ
              của bạn tại một nơi.
            </p>
          </div>
          <Link
            href="/appointments/"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-primary shadow-sm transition hover:bg-primary-50"
          >
            <span className="material-symbols-outlined text-[19px]">calendar_add_on</span>
            Đặt hẹn tư vấn
          </Link>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="font-serif text-[15px] font-semibold text-gray-900">Thông tin cá nhân</h2>
            <Link href="/profile/" className="text-xs font-medium text-primary hover:underline">
              Chỉnh sửa
            </Link>
          </div>
          <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 px-5 py-4 text-sm">
            <dt className="text-gray-500">Họ và tên</dt>
            <dd className="font-medium text-gray-900">{user.full_name || '—'}</dd>
            <dt className="text-gray-500">Tài khoản</dt>
            <dd className="text-gray-700">@{user.username}</dd>
            <dt className="text-gray-500">Email</dt>
            <dd className="break-all text-gray-700">{user.email}</dd>
            <dt className="text-gray-500">Số điện thoại</dt>
            <dd className="text-gray-700">{user.phone || 'Chưa cập nhật'}</dd>
            <dt className="text-gray-500">Tham gia</dt>
            <dd className="text-gray-700">{formatDate(user.date_joined)}</dd>
          </dl>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="font-serif text-[15px] font-semibold text-gray-900">Hồ sơ bệnh án</h2>
            <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary">
              0 phiếu A4
            </span>
          </div>
          <div className="flex min-h-[205px] flex-col items-center justify-center p-5 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary">
              <span className="material-symbols-outlined text-[26px]">picture_as_pdf</span>
            </span>
            <p className="mt-3 text-sm font-medium text-gray-800">Chưa có kết quả tư vấn A4</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-gray-500">
              Kết luận, chỉ định, đơn thuốc và phiếu A4 sẽ hiển thị tại đây sau khi buổi tư vấn hoàn tất.
            </p>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="font-serif text-[15px] font-semibold text-gray-900">Chẩn đoán gần đây</h2>
          <Link href="/history/" className="text-xs font-medium text-primary hover:underline">Xem tất cả</Link>
        </div>
        {cases.recent.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">Bạn chưa có kết quả chẩn đoán nào.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {cases.recent.slice(0, 4).map(item => (
              <div key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary">
                  <span className="material-symbols-outlined text-[19px]">image_search</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">Chẩn đoán viêm lợi #{item.id}</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(item.created_at)} · {item.image_count} ảnh · {CASE_STATUS_LABEL[item.status]}
                  </p>
                </div>
                <Link
                  href={item.status === 'done' ? `/analysis/${item.id}/results/0/` : `/analysis/${item.id}/processing/`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Xem chi tiết
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
