'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import api, { type CaseListItem, type ImageResult } from '@/lib/api';
import { useRequireRole } from '@/lib/useRequireRole';

type AppointmentSource = { caseItem: CaseListItem; image: ImageResult | null };

const MGI_LABEL: Record<number, string> = {
  0: 'Bình thường',
  1: 'Viêm nhẹ',
  2: 'Viêm trung bình',
  3: 'Viêm nặng',
  4: 'Viêm rất nặng',
};

function toMediaUrl(path: string) {
  const match = path.match(/[/\\]media[/\\](.+)/);
  return match ? `/media/${match[1].replace(/\\/g, '/')}` : path;
}

function conclusion(image: ImageResult | null) {
  if (!image) return 'Kết quả AI đã hoàn thành';
  const caption = image.caption?.is_edited ? image.caption.edited_text : image.caption?.ai_text;
  if (caption) return caption;
  const levels = image.detections.filter(item => !item.is_deleted).map(item => item.mgi_level);
  const highest = levels.length ? Math.max(...levels) : 0;
  return levels.length ? `${MGI_LABEL[highest] ?? 'Có phát hiện'} · ${levels.length} vùng` : 'Không phát hiện viêm lợi';
}

export default function AppointmentsPage() {
  const { allowed, checking } = useRequireRole(['patient']);
  const [rows, setRows] = useState<AppointmentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    api.get<CaseListItem[]>('/cases/')
      .then(async response => {
        const cases = response.data
          .filter(item => item.permission === 'owner' && item.status === 'done')
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const loaded = await Promise.all(cases.map(async caseItem => {
          try {
            const image = await api.get<ImageResult>(`/cases/${caseItem.id}/images/0/`);
            return { caseItem, image: image.data };
          } catch {
            return { caseItem, image: null };
          }
        }));
        if (active) setRows(loaded);
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed]);

  if (checking || !allowed) {
    return <div className="flex h-64 items-center justify-center"><span className="material-symbols-outlined animate-spin text-4xl text-gray-300">autorenew</span></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="rounded-2xl border border-blue-200 bg-gradient-to-r from-primary-50 to-blue-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              <span className="material-symbols-outlined">calendar_add_on</span>
            </span>
            <div>
              <h1 className="font-serif text-xl font-semibold text-gray-900">Đặt hẹn tư vấn online</h1>
              <p className="mt-1 max-w-2xl text-sm text-gray-600">
                Bạn có thể đặt lịch trực tiếp hoặc chọn một kết quả AI để bác sĩ tham khảo.
              </p>
            </div>
          </div>
          <Link href="/telemedicine/" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-600">
            <span className="material-symbols-outlined text-[19px]">open_in_new</span>
            Đặt lịch
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-serif text-[15px] font-semibold text-gray-900">Chọn kết quả AI đính kèm</h2>
          <p className="mt-0.5 text-xs text-gray-500">Chỉ hiển thị kết quả do chính bạn tạo và đã hoàn thành.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
            <span className="material-symbols-outlined animate-spin">autorenew</span> Đang tải kết quả…
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-500">Không thể tải lịch sử chẩn đoán.</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-14 text-center">
            <span className="material-symbols-outlined text-5xl text-gray-300">image_search</span>
            <p className="mt-3 text-sm font-medium text-gray-700">Chưa có kết quả AI hoàn thành</p>
            <p className="mt-1 text-xs text-gray-500">Bạn vẫn có thể đặt lịch không đính kèm kết quả.</p>
            <Link href="/analysis/new/" className="mt-4 text-sm font-medium text-primary hover:underline">Bắt đầu chẩn đoán AI</Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.map(({ caseItem, image }) => {
              const imagePath = image && (image.annotated_path || image.original_path);
              return (
                <div key={caseItem.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100">
                    {imagePath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={toMediaUrl(imagePath)} alt="Kết quả chẩn đoán" className="h-full w-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-2xl text-gray-300">dentistry</span>
                    )}
                  </div>
                  <div className="min-w-[220px] flex-1">
                    <p className="text-sm font-semibold text-gray-900">Kết quả viêm lợi #{caseItem.id}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-600">{conclusion(image)}</p>
                    <p className="mt-1.5 text-[11px] text-gray-400">
                      {new Date(caseItem.created_at).toLocaleString('vi-VN')} · {caseItem.image_count} ảnh
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/analysis/${caseItem.id}/results/0/`} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">Xem</Link>
                    <Link href="/telemedicine/" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-600">
                      <span className="material-symbols-outlined text-[16px]">calendar_month</span>
                      Đặt hẹn
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
