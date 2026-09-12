'use client';

import Link from 'next/link';

import { useRequireRole } from '@/lib/useRequireRole';

export default function ConsultationsPage() {
  const { allowed, checking } = useRequireRole(['patient']);

  if (checking || !allowed) {
    return <div className="flex h-64 items-center justify-center"><span className="material-symbols-outlined animate-spin text-4xl text-gray-300">autorenew</span></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="font-serif text-xl font-semibold text-gray-900">Lịch sử tư vấn online</h1>
        <p className="mt-1 text-sm text-gray-500">Theo dõi lịch hẹn, bác sĩ phụ trách và kết quả các buổi tư vấn.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['pending_actions', 'Chờ xác nhận', '0', 'bg-amber-50 text-amber-600'],
          ['event_available', 'Đã xác nhận', '0', 'bg-green-50 text-green-600'],
          ['task_alt', 'Đã hoàn tất', '0', 'bg-primary-50 text-primary'],
        ].map(([icon, label, value, tone]) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
              <span className="material-symbols-outlined text-[21px]">{icon}</span>
            </span>
            <div><p className="text-xl font-semibold text-gray-900">{value}</p><p className="text-xs text-gray-500">{label}</p></div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-serif text-[15px] font-semibold text-gray-900">Các buổi tư vấn của bạn</h2>
        </div>
        <div className="flex flex-col items-center px-5 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
            <span className="material-symbols-outlined text-3xl">video_chat</span>
          </span>
          <p className="mt-4 text-sm font-medium text-gray-800">Chưa có lịch sử tư vấn</p>
          <p className="mt-1 max-w-lg text-xs leading-relaxed text-gray-500">
            Trạng thái cuộc hẹn, đường dẫn vào phòng và kết quả tư vấn sẽ xuất hiện tại đây sau khi kết nối Telemedicine.
          </p>
          <Link href="/appointments/" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-600">
            <span className="material-symbols-outlined text-[18px]">calendar_add_on</span>
            Đặt hẹn mới
          </Link>
        </div>
      </section>

      <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <span className="material-symbols-outlined mt-0.5 text-[19px]">info</span>
        <p>Khi Telemedicine sẵn sàng, trang này sẽ nhận ID cuộc hẹn, bác sĩ, thời gian, trạng thái và liên kết tham gia tư vấn.</p>
      </div>
    </div>
  );
}
