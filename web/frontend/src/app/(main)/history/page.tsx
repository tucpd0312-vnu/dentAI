'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api, { CaseListItem } from '@/lib/api';

const STATUS_LABEL: Record<string, string> = {
  processing: 'Đang xử lý',
  done: 'Hoàn thành',
  failed: 'Lỗi',
};

const STATUS_CLASS: Record<string, string> = {
  processing: 'bg-blue-50 text-blue-600 border-blue-200',
  done:       'bg-green-50 text-green-700 border-green-200',
  failed:     'bg-red-50 text-red-600 border-red-200',
};

const PAGE_SIZE = 10;

function fmt(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type StatusFilter = 'all' | 'processing' | 'done' | 'failed';

export default function HistoryPage() {
  const [cases, setCases]           = useState<CaseListItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [search, setSearch]         = useState('');
  const [status, setStatus]         = useState<StatusFilter>('all');
  const [page, setPage]             = useState(1);

  useEffect(() => {
    setLoading(true);
    api.get<CaseListItem[]>('/cases/')
      .then(r => { setCases(r.data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  /* Reset page on filter change */
  useEffect(() => { setPage(1); }, [search, status]);

  const filtered = cases.filter(c => {
    const q = search.toLowerCase().trim();
    const matchQ = !q ||
      c.patient.name.toLowerCase().includes(q) ||
      c.patient.patient_code.toLowerCase().includes(q);
    return matchQ && (status === 'all' || c.status === status);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* Smart page numbers (up to 5 buttons) */
  function pageNumbers() {
    const n = Math.min(totalPages, 5);
    let start = Math.max(1, page - 2);
    if (start + n - 1 > totalPages) start = totalPages - n + 1;
    return Array.from({ length: n }, (_, i) => start + i);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif font-bold text-xl text-gray-900">Lịch sử chẩn đoán</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? 'Đang tải...' : `${cases.length} ca đã phân tích`}
          </p>
        </div>
        <Link
          href="/analysis/new"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 shadow-sm transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Phân tích mới
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-52">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">
            search
          </span>
          <input
            type="text"
            placeholder="Tìm theo tên hoặc mã bệnh nhân..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5 shrink-0">
          {(['all','processing','done','failed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap
                ${status === s ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {s === 'all' ? 'Tất cả' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
            <span className="material-symbols-outlined animate-spin text-2xl">autorenew</span>
            <span className="text-sm">Đang tải dữ liệu...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <span className="material-symbols-outlined text-4xl text-red-300">cloud_off</span>
            <p className="text-sm text-gray-500">Không thể tải lịch sử</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-primary underline underline-offset-2"
            >
              Thử lại
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
            <span className="material-symbols-outlined text-4xl">search_off</span>
            <p className="text-sm">
              {search || status !== 'all'
                ? 'Không tìm thấy kết quả phù hợp'
                : 'Chưa có ca nào. Hãy bắt đầu phân tích đầu tiên!'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {['#','Bệnh nhân','Ngày tạo','Trạng thái','Ảnh','Thao tác'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide
                          ${i === 0 ? 'text-left w-12' : i === 4 ? 'text-center w-16' : i === 5 ? 'text-right' : 'text-left'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paged.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">{c.id}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 text-sm leading-tight">{c.patient.name}</p>
                        <span className="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono mt-0.5 inline-block">
                          {c.patient.patient_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 tabular-nums whitespace-nowrap">
                        {fmt(c.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${STATUS_CLASS[c.status]}`}>
                          {c.status === 'processing' && (
                            <span className="material-symbols-outlined text-[11px] animate-spin">autorenew</span>
                          )}
                          {STATUS_LABEL[c.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500 tabular-nums">
                        {c.image_count}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {c.status === 'done' ? (
                            <>
                              <button
                                onClick={() => window.open(`/api/cases/${c.id}/export/`, '_blank')}
                                title="Tải về toàn bộ case (ZIP)"
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[14px]">download</span>
                              </button>
                              <Link
                                href={`/analysis/${c.id}/results/0`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-primary border border-primary/20 hover:bg-primary/5 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[14px]">visibility</span>
                                Xem kết quả
                              </Link>
                            </>
                          ) : c.status === 'processing' ? (
                            <Link
                              href={`/analysis/${c.id}/processing`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 transition-colors"
                            >
                              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                              Theo dõi
                            </Link>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, filtered.length)} / {filtered.length} kết quả
                </p>
                <div className="flex items-center gap-1">
                  <NavBtn onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} icon="chevron_left" />
                  {pageNumbers().map(p => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-lg text-xs font-medium border transition-colors
                        ${page===p ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      {p}
                    </button>
                  ))}
                  <NavBtn onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages} icon="chevron_right" />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function NavBtn({ onClick, disabled, icon }: { onClick: () => void; disabled: boolean; icon: string }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
    </button>
  );
}
