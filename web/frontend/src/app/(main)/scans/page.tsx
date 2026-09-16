'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { useAuth } from '@/components/providers/AuthProvider';
import { apiErrorMessage } from '@/lib/users';
import {
  deleteScan,
  fetchScans,
  formatFileSize,
  SCAN_STATUS_CLASS,
  SCAN_STATUS_LABEL,
  type ScanListItem,
} from '@/lib/scans';

const PAGE_SIZE = 20;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputCls =
  'w-full rounded-xl border border-gray-300 px-4 py-3 text-base transition-colors ' +
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

export default function ScansPage() {
  const { isAdmin } = useAuth();

  const [rows, setRows] = useState<ScanListItem[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchScans({ q, page });
      setRows(data.results);
      setCount(data.count);
    } catch (err) {
      setError(apiErrorMessage(err, 'Không tải được danh sách phim.'));
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Gõ xong 350ms mới gọi API, tránh bắn request mỗi ký tự — cùng nhịp /users.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(prev => (prev === search ? prev : search));
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  async function handleDelete(scan: ScanListItem) {
    if (!window.confirm(`Xoá phim của bệnh nhân "${scan.patient.name}"? Có thể khôi phục qua Django admin nếu cần.`)) {
      return;
    }
    try {
      await deleteScan(scan.id);
      setNotice('Đã xoá phim.');
      setTimeout(() => setNotice(null), 4000);
      void load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Không xoá được phim này.'));
    }
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="w-full space-y-4">

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          {notice}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px]">error</span>
          <span>{error}</span>
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
          {loading ? 'Đang tải…' : `${count} phim`}
        </span>
        <Link
          href="/scans/new/"
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
                <th className="px-6 py-4 font-medium">Số lát</th>
                <th className="px-6 py-4 font-medium">Dung lượng</th>
                <th className="px-6 py-4 font-medium">Ngày tạo</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-4 py-10 text-center">
                    <span className="material-symbols-outlined animate-spin text-3xl text-gray-300">
                      autorenew
                    </span>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-4 py-10 text-center text-sm text-gray-400">
                    {search ? 'Không tìm thấy phim phù hợp.' : 'Chưa có phim nào được tải lên.'}
                  </td>
                </tr>
              ) : (
                rows.map(s => (
                  <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="text-base font-semibold leading-tight text-gray-900">{s.patient.name}</p>
                      <span className="mt-1 inline-block rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-500">
                        {s.patient.patient_code}
                      </span>
                      {(s.access_level === 'view' || s.access_level === 'edit') && (
                        <span className="ml-1.5 inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                          Được chia sẻ · {s.access_level === 'edit' ? 'có thể nộp phân vùng' : 'chỉ xem'}
                        </span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 text-gray-600">
                        {s.uploaded_by?.full_name || s.uploaded_by?.username || (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${SCAN_STATUS_CLASS[s.status]}`}
                      >
                        {s.status === 'processing' && (
                          <span className="material-symbols-outlined animate-spin text-[11px]">
                            autorenew
                          </span>
                        )}
                        {SCAN_STATUS_LABEL[s.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 tabular-nums text-gray-600">{s.n_slices || '—'}</td>
                    <td className="px-6 py-4 tabular-nums text-gray-500">
                      {s.file_size ? formatFileSize(s.file_size) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-gray-500">{fmtDate(s.created_at)}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/scans/${s.id}/`}
                          title="Xem chi tiết"
                          className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary transition-colors hover:bg-primary/10"
                        >
                          <span className="material-symbols-outlined text-[24px]">visibility</span>
                        </Link>
                        {s.can_manage_shares && (
                          <button
                            onClick={() => handleDelete(s)}
                            title="Xoá"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-red-500 transition-colors hover:bg-red-50"
                          >
                            <span className="material-symbols-outlined text-[24px]">delete</span>
                          </button>
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
