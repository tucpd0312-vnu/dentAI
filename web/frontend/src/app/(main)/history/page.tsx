'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api, { CaseListItem } from '@/lib/api';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  fetchScans,
  fetchScansSharedWithMe,
  SCAN_STATUS_CLASS,
  SCAN_STATUS_LABEL,
  type ScanListItem,
} from '@/lib/scans';

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

const TYPE_LABEL: Record<'gingivitis' | 'canine3d', string> = {
  gingivitis: 'Viêm lợi · 2D',
  canine3d: 'Răng nanh ngầm · 3D',
};

const TYPE_CLASS: Record<'gingivitis' | 'canine3d', string> = {
  gingivitis: 'bg-primary-50 text-primary',
  canine3d: 'bg-indigo-50 text-indigo-600',
};

const PAGE_SIZE = 10;

function fmt(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type StatusFilter = 'all' | 'processing' | 'done' | 'failed';
type NormStatus = 'processing' | 'done' | 'failed';
type TypeFilter = 'all' | 'gingivitis' | 'canine3d';
type Tab = 'mine' | 'shared';

// Gộp hai loại chẩn đoán về một shape chung ở frontend (PLAN_3D_CANINE.md §5.2) —
// KHÔNG đụng backend, tránh rủi ro hồi quy với GET /api/cases/ (mảng phẳng, không
// phân trang) mà trang History hiện có đang phụ thuộc.
type Row =
  | { kind: 'gingivitis'; case: CaseListItem }
  | { kind: 'canine3d'; scan: ScanListItem };

function rowId(r: Row): number {
  return r.kind === 'gingivitis' ? r.case.id : r.scan.id;
}

function rowPatient(r: Row) {
  return r.kind === 'gingivitis' ? r.case.patient : r.scan.patient;
}

function rowCreatedAt(r: Row): string {
  return r.kind === 'gingivitis' ? r.case.created_at : r.scan.created_at;
}

/** Trạng thái quy về 3 nhóm chung để dùng chung một bộ lọc "Trạng thái" —
 * scan 'uploading'/'processing' → 'processing', 'ready' → 'done'. */
function rowNormStatus(r: Row): NormStatus {
  if (r.kind === 'gingivitis') return r.case.status;
  return r.scan.status === 'ready' ? 'done' : r.scan.status === 'failed' ? 'failed' : 'processing';
}

function rowStatusLabel(r: Row): string {
  return r.kind === 'gingivitis' ? STATUS_LABEL[r.case.status] : SCAN_STATUS_LABEL[r.scan.status];
}

function rowStatusClass(r: Row): string {
  return r.kind === 'gingivitis' ? STATUS_CLASS[r.case.status] : SCAN_STATUS_CLASS[r.scan.status];
}

function rowCount(r: Row): { n: number; unit: string } {
  return r.kind === 'gingivitis'
    ? { n: r.case.image_count, unit: 'ảnh' }
    : { n: r.scan.n_slices, unit: 'lát' };
}

export default function HistoryPage() {
  const { loading: authLoading } = useAuth();

  const [cases, setCases]           = useState<CaseListItem[]>([]);
  const [shared, setShared]         = useState<CaseListItem[]>([]);
  const [scans, setScans]           = useState<ScanListItem[]>([]);
  const [sharedScans, setSharedScans] = useState<ScanListItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [search, setSearch]         = useState('');
  const [status, setStatus]         = useState<StatusFilter>('all');
  const [type, setType]             = useState<TypeFilter>('all');
  const [tab, setTab]               = useState<Tab>('mine');
  const [page, setPage]             = useState(1);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    // GET /cases/ đã trả cả ca của mình lẫn ca được chia sẻ; gọi thêm
    // /cases/shared-with-me/ để tách riêng cho tab thứ hai. pageSize:100 để lấy
    // TOÀN BỘ phim (không phân trang thật) — khớp cách /cases/ đang là mảng phẳng.
    Promise.all([
      api.get<CaseListItem[]>('/cases/'),
      api.get<CaseListItem[]>('/cases/shared-with-me/'),
      fetchScans({ pageSize: 100 }),
      fetchScansSharedWithMe(),
    ])
      .then(([all, sh, sc, shared3d]) => {
        setCases(all.data);
        setShared(sh.data);
        setScans(sc.results);
        setSharedScans(shared3d);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [authLoading]);

  /* Reset page on filter change */
  useEffect(() => { setPage(1); }, [search, status, type, tab]);

  const sharedIds = new Set(shared.map(c => c.id));
  const sharedScanIds = new Set(sharedScans.map(scan => scan.id));
  const mineRows: Row[] = [
    ...cases.filter(c => !sharedIds.has(c.id)).map((c): Row => ({ kind: 'gingivitis', case: c })),
    ...scans.filter(scan => !sharedScanIds.has(scan.id)).map((s): Row => ({ kind: 'canine3d', scan: s })),
  ];
  const sharedRows: Row[] = [
    ...shared.map((c): Row => ({ kind: 'gingivitis', case: c })),
    ...sharedScans.map((scan): Row => ({ kind: 'canine3d', scan })),
  ];

  const source = (tab === 'shared' ? sharedRows : mineRows)
    .slice()
    .sort((a, b) => new Date(rowCreatedAt(b)).getTime() - new Date(rowCreatedAt(a)).getTime());

  const filtered = source.filter(r => {
    const q = search.toLowerCase().trim();
    const patient = rowPatient(r);
    const matchQ = !q ||
      patient.name.toLowerCase().includes(q) ||
      patient.patient_code.toLowerCase().includes(q);
    const matchStatus = status === 'all' || rowNormStatus(r) === status;
    const matchType = type === 'all' || r.kind === type;
    return matchQ && matchStatus && matchType;
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
            {loading ? 'Đang tải...' : `${source.length} kết quả`}
          </p>
        </div>
        <Link
          href="/analysis/new"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-white hover:bg-primary/90 shadow-sm transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Chẩn đoán viêm lợi
        </Link>
      </div>

      {/* Tabs: ca của tôi / được chia sẻ với tôi */}
      <div className="flex gap-1.5 border-b border-gray-200">
        {([
          { key: 'mine' as Tab, label: 'Ca của tôi', icon: 'folder', n: mineRows.length },
          { key: 'shared' as Tab, label: 'Được chia sẻ với tôi', icon: 'share', n: sharedRows.length },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
            {t.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
              tab === t.key ? 'bg-primary-50 text-primary' : 'bg-gray-100 text-gray-500'
            }`}>
              {t.n}
            </span>
          </button>
        ))}
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
          {(['all','gingivitis','canine3d'] as const).map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap
                ${type === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t === 'all' ? 'Tất cả loại' : t === 'gingivitis' ? 'Viêm lợi' : 'Răng nanh ngầm'}
            </button>
          ))}
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
              {search || status !== 'all' || type !== 'all'
                ? 'Không tìm thấy kết quả phù hợp'
                : 'Chưa có ca nào. Hãy bắt đầu phân tích đầu tiên!'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {['#','Bệnh nhân','Loại chẩn đoán','Ngày tạo','Trạng thái','Số lượng','Thao tác'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide
                          ${i === 0 ? 'text-left w-12' : i === 5 ? 'text-center' : i === 6 ? 'text-right' : 'text-left'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paged.map(row => {
                    const id = rowId(row);
                    const patient = rowPatient(row);
                    const count = rowCount(row);
                    return (
                      <tr key={`${row.kind}-${id}`} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">{id}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 text-sm leading-tight">{patient.name}</p>
                          <span className="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono mt-0.5 inline-block">
                            {patient.patient_code}
                          </span>
                          {/* Ở tab "Được chia sẻ", cho biết ca đến từ ai và với quyền gì — chỉ ca 2D vì
                              đợt này chưa chia sẻ phim CBCT (PLAN_3D_CANINE.md §5.2). */}
                          {tab === 'shared' && row.kind === 'gingivitis' && row.case.owner && (
                            <p className="mt-0.5 text-[11px] text-gray-500">
                              <span className="material-symbols-outlined align-middle text-[13px]">person</span>{' '}
                              {row.case.owner.full_name || row.case.owner.username}
                              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                row.case.permission === 'edit'
                                  ? 'bg-primary-50 text-primary'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {row.case.permission === 'edit' ? 'Xem và sửa' : 'Chỉ xem'}
                              </span>
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${TYPE_CLASS[row.kind]}`}>
                            {TYPE_LABEL[row.kind]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 tabular-nums whitespace-nowrap">
                          {fmt(rowCreatedAt(row))}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${rowStatusClass(row)}`}>
                            {rowNormStatus(row) === 'processing' && (
                              <span className="material-symbols-outlined text-[11px] animate-spin">autorenew</span>
                            )}
                            {rowStatusLabel(row)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500 tabular-nums whitespace-nowrap">
                          {count.n} <span className="text-gray-400">{count.unit}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {row.kind === 'canine3d' ? (
                              <Link
                                href={`/scans/${row.scan.id}/`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[14px]">visibility</span>
                                Xem kết quả
                              </Link>
                            ) : row.case.status === 'done' ? (
                              <>
                                <button
                                  onClick={() => window.open(`/api/cases/${row.case.id}/export/`, '_blank')}
                                  title="Tải về toàn bộ case (ZIP)"
                                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[14px]">download</span>
                                </button>
                                <Link
                                  href={`/analysis/${row.case.id}/results/0`}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-primary border border-primary/20 hover:bg-primary/5 transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[14px]">visibility</span>
                                  Xem kết quả
                                </Link>
                              </>
                            ) : row.case.status === 'processing' ? (
                              <Link
                                href={`/analysis/${row.case.id}/processing`}
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
                    );
                  })}
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
