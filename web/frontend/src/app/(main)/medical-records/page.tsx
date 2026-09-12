'use client';

import Link from 'next/link';

import { useRequireRole } from '@/lib/useRequireRole';

export default function MedicalRecordsPage() {
  const { allowed, checking } = useRequireRole(['patient']);

  if (checking || !allowed) {
    return <div className="flex h-64 items-center justify-center"><span className="material-symbols-outlined animate-spin text-4xl text-gray-300">autorenew</span></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="font-serif text-xl font-semibold text-gray-900">Hồ sơ bệnh án</h1>
        <p className="mt-1 text-sm text-gray-500">Dòng thời gian kết quả AI và phiếu tư vấn A4 của bạn.</p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="font-serif text-[15px] font-semibold text-gray-900">Dòng thời gian điều trị</h2>
            <p className="mt-0.5 text-xs text-gray-500">Sắp xếp mới nhất trước</p>
          </div>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">0 hồ sơ</span>
        </div>
        <div className="flex flex-col items-center px-5 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-500">
            <span className="material-symbols-outlined text-3xl">clinical_notes</span>
          </span>
          <p className="mt-4 text-sm font-medium text-gray-800">Chưa có phiếu kết quả tư vấn</p>
          <p className="mt-1 max-w-lg text-xs leading-relaxed text-gray-500">
            Sau khi bác sĩ hoàn tất buổi tư vấn, kết luận, chỉ định, đơn thuốc và phiếu A4 sẽ được đồng bộ về đây.
          </p>
          <Link href="/history/" className="mt-5 inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10">
            <span className="material-symbols-outlined text-[18px]">history</span>
            Xem lịch sử chẩn đoán AI
          </Link>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['link', 'Liên kết chính xác', 'Mỗi phiếu gắn với đúng cuộc hẹn'],
          ['picture_as_pdf', 'Phiếu A4', 'Xem và tải phiếu sau tư vấn'],
          ['lock', 'Bảo mật', 'Chỉ tài khoản của bạn được xem'],
        ].map(([icon, title, description]) => (
          <div key={title} className="rounded-xl border border-gray-200 bg-white p-4">
            <span className="material-symbols-outlined text-[22px] text-primary">{icon}</span>
            <p className="mt-2 text-sm font-medium text-gray-800">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
