'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import api, { type CaseListItem } from '@/lib/api';
import { useAuth } from '@/components/providers/AuthProvider';
import { apiErrorMessage } from '@/lib/users';

const PAGE_SIZE = 20;

type CaseStatus = CaseListItem['status'];

const STATUS_LABEL: Record<CaseStatus, string> = {
  processing: 'Đang xử lý',
  done: 'Hoàn thành',
  failed: 'Lỗi',
};

const STATUS_CLASS: Record<CaseStatus, string> = {
  processing: 'bg-blue-50 text-blue-600 border-blue-200',
  done: 'bg-green-50 text-green-700 border-green-200',
  failed: 'bg-red-50 text-red-600 border-red-200',
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputCls =
  'w-full rounded-xl border border-gray-300 px-4 py-3 text-base transition-colors ' +
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

/**
 * Danh sách ca chẩn đoán viêm lợi — điểm vào của luồng viêm lợi 2D.
 *
 * Không dùng `useRequireRole`: mở cho MỌI vai trò như luồng `/analysis`. Bệnh nhân
 * tự tạo được ca viêm lợi nên phải xem lại được ca của chính mình; phạm vi dữ
 * liệu do backend cắt qua `apps.cases.access.scoped_cases`, không phải bằng route.
 */
export default function GingivitisDiagnosisPage() {
  const { isAdmin, loading: authLoading } = useAuth();

  const [rows, setRows] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // GET /cases/ trả MẢNG PHẲNG (không phân trang) và đã gồm cả ca được chia sẻ —
      // nên lọc/phân trang ở client, giống cách /history đang làm. Không debounce ô
      // tìm kiếm vì gõ phím không bắn request nào.
      const res = await api.get<CaseListItem[]>('/cases/');
      setRows(res.data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Không tải được danh sách chẩn đoán viêm lợi.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? rows.filter(
        c =>
          c.patient.name.toLowerCase().includes(needle) ||
          c.patient.patient_code.toLowerCase().includes(needle),
      )
    : rows;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="w-full space-y-4">

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px]">error</span>
          <span className="flex-1">{error}</span>
          <button
            onClick={() => void load()}
            className="shrink-0 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium hover:bg-red-100"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Thanh thao tác chung: bộ lọc và tải lên cùng một hàng. */}
      <div className="-mx-6 flex flex-col gap-3 border-y border-gray-200 bg-white px-6 py-4 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[22px] text-gray-400">
            search
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc mã bệnh nhân…"
            aria-label="Lọc danh sách theo bệnh nhân"
            className={`${inputCls} pl-11`}
          />
        </div>
        <span className="whitespace-nowrap rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium tabular-nums text-gray-600">
          {loading ? 'Đang tải…' : `${filtered.length} ca`}
        </span>
        <Link
          href="/analysis/new/"
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-primary-600"
        >
          <span className="material-symbols-outlined text-[22px]">upload_file</span>
          Tải lên
        </Link>
      </div>

      {/* Bảng */}
      <div className="-mx-6 overflow-hidden border-y border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-sm text-gray-500">
                <th className="px-6 py-4 font-medium">Bệnh nhân</th>
                {isAdmin && <th className="px-6 py-4 font-medium">Người tải lên</th>}
                <th className="px-6 py-4 font-medium">Trạng thái</th>
                <th className="px-6 py-4 font-medium">Số ảnh</th>
                <th className="px-6 py-4 font-medium">Ngày tạo</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-10 text-center">
                    <span className="material-symbols-outlined animate-spin text-3xl text-gray-300">
                      autorenew
                    </span>
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-10 text-center text-sm text-gray-400">
                    {search ? 'Không tìm thấy ca phù hợp.' : 'Chưa có ca chẩn đoán viêm lợi nào.'}
                  </td>
                </tr>
              ) : (
                paged.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="text-base font-semibold leading-tight text-gray-900">
                        {c.patient.name}
                        {c.is_shared_with_me && (
                          <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-normal text-amber-600">
                            Được chia sẻ
                          </span>
                        )}
                      </p>
                      <span className="mt-1 inline-block rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-500">
                        {c.patient.patient_code}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 text-gray-600">
                        {c.owner?.full_name || c.owner?.username || (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[c.status]}`}
                      >
                        {c.status === 'processing' && (
                          <span className="material-symbols-outlined animate-spin text-[11px]">
                            autorenew
                          </span>
                        )}
                        {STATUS_LABEL[c.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 tabular-nums text-gray-600">{c.image_count || '—'}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-gray-500">{fmtDate(c.created_at)}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-1">
                        {/* Ca 'failed' không có gì để mở — trang results sẽ trống. */}
                        {c.status === 'done' ? (
                          <Link
                            href={`/analysis/${c.id}/results/0`}
                            title="Xem kết quả"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary transition-colors hover:bg-primary/10"
                          >
                            <span className="material-symbols-outlined text-[24px]">visibility</span>
                          </Link>
                        ) : c.status === 'processing' ? (
                          <Link
                            href={`/analysis/${c.id}/processing`}
                            title="Theo dõi tiến trình"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100"
                          >
                            <span className="material-symbols-outlined text-[24px]">open_in_new</span>
                          </Link>
                        ) : (
                          <span className="px-1.5 text-gray-300">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5">
            <span className="text-xs text-gray-500">
              Trang {page} / {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                Trước
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
