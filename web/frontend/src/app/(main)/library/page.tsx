'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { useAuth } from '@/components/providers/AuthProvider';
import {
  ASSET_STATUS_CLASS,
  ASSET_STATUS_LABEL,
  DATA_TYPE_ICON,
  DATA_TYPE_LABEL,
  DIAGNOSIS_ROUTES,
  diagnosisUrl,
  deleteAsset,
  downloadAsset,
  fetchAssets,
  fetchAssetThumbnailBlob,
  fetchCategories,
  type DataAsset,
  type DataCategory,
  type DataType,
} from '@/lib/library';
import { formatFileSize } from '@/lib/scans';
import { apiErrorMessage } from '@/lib/users';

const PAGE_SIZE = 20;

/** Tab lọc — `all` với người không phải admin nghĩa là "mọi thứ tôi truy cập được". */
type Tab = 'all' | 'mine' | 'shared' | 'others';

const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'mine', label: 'Của tôi' },
  { value: 'shared', label: 'Được chia sẻ' },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors ' +
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

export default function LibraryPage() {
  // Không dùng useRequireRole: kho dữ liệu mở cho MỌI vai trò (§B.4) — phạm vi dữ liệu
  // đã bị backend giới hạn theo `scoped_assets`, không cần chặn ở route.
  const { isAdmin, canEditLabels, loading: authLoading } = useAuth();

  const [rows, setRows] = useState<DataAsset[]>([]);
  const [categories, setCategories] = useState<DataCategory[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<number | ''>('');
  const [dataType, setDataType] = useState<DataType | ''>('');
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAssets({
        q,
        category: category || undefined,
        data_type: dataType || undefined,
        mine: tab === 'mine',
        shared: tab === 'shared',
        others: tab === 'others',
        page,
      });
      if (version !== requestVersion.current) return;
      setRows(data.results);
      setCount(data.count);
    } catch (err) {
      if (version !== requestVersion.current) return;
      setRows([]);
      setCount(0);
      setError(apiErrorMessage(err, 'Không tải được kho dữ liệu.'));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [q, category, dataType, tab, page]);

  useEffect(() => {
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => setCategories([]));   // bộ lọc hỏng không nên chặn cả trang
  }, []);

  // Gõ xong 350ms mới gọi API — cùng nhịp /users, /scans.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(prev => (prev === search ? prev : search));
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  async function handleDownload(asset: DataAsset) {
    setBusyId(asset.id);
    setError(null);
    try {
      await downloadAsset(asset);
    } catch (err) {
      setError(apiErrorMessage(err, 'Không tải xuống được tệp này.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(asset: DataAsset) {
    if (
      !window.confirm(
        `Xoá "${asset.title}" khỏi kho dữ liệu? Có thể khôi phục qua Django admin nếu cần.`,
      )
    ) {
      return;
    }
    try {
      await deleteAsset(asset.id);
      setNotice('Đã xoá khỏi kho dữ liệu.');
      setTimeout(() => setNotice(null), 4000);
      void load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Không xoá được mục này.'));
    }
  }

  if (authLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-gray-300">
          autorenew
        </span>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const columns = 6 + (canEditLabels ? 1 : 0) + (isAdmin ? 1 : 0);
  const activeFilterCount =
    Number(Boolean(search.trim())) +
    Number(category !== '') +
    Number(dataType !== '') +
    Number(tab !== 'all');

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl font-semibold text-gray-900">Kho dữ liệu</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading ? 'Đang tải…' : `${count} mục dữ liệu`}
            {isAdmin
              ? ' · quyền quản trị cho phép xem toàn hệ thống'
              : ' · dữ liệu của bạn và dữ liệu được chia sẻ cho bạn'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen(open => !open)}
            aria-expanded={filtersOpen}
            aria-controls="library-filters"
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            <span className="material-symbols-outlined text-[18px]">filter_alt</span>
            Bộ lọc
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                {activeFilterCount}
              </span>
            )}
            <span className="material-symbols-outlined text-[18px] text-gray-400">
              {filtersOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>
          <Link
            href="/library/new/"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-600"
          >
            <span className="material-symbols-outlined text-[18px]">upload</span>
            Tải dữ liệu lên
          </Link>
        </div>
      </div>

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

      {/* ── Bộ lọc ── */}
      {filtersOpen && (
        <div id="library-filters" className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="flex shrink-0 gap-1 overflow-x-auto">
              {(isAdmin ? [...TABS, { value: 'others' as Tab, label: 'Của người khác' }] : TABS).map(t => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={tab === t.value}
                  onClick={() => {
                    setTab(t.value);
                    setPage(1);
                  }}
                  className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    tab === t.value
                      ? 'bg-primary/10 text-primary'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  }`}
                >
                  {t.value === 'all' && isAdmin ? 'Tất cả hệ thống' : t.label}
                </button>
              ))}
            </div>
            <div className="relative min-w-[200px] flex-1">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">
                search
              </span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Tìm trong kho dữ liệu"
                placeholder={
                  canEditLabels
                    ? 'Tìm theo tiêu đề, tên file hoặc bệnh nhân…'
                    : 'Tìm theo tiêu đề hoặc tên file…'
                }
                className={`${inputCls} pl-9`}
              />
            </div>
            <select
              value={category}
              onChange={e => {
                setCategory(e.target.value ? Number(e.target.value) : '');
                setPage(1);
              }}
              aria-label="Lọc theo phân loại"
              className={`${inputCls} lg:w-auto lg:min-w-[150px]`}
            >
              <option value="">Mọi phân loại</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {typeof c.asset_count === 'number' ? ` (${c.asset_count})` : ''}
                </option>
              ))}
            </select>
            <select
              value={dataType}
              onChange={e => {
                setDataType(e.target.value as DataType | '');
                setPage(1);
              }}
              aria-label="Lọc theo loại dữ liệu"
              className={`${inputCls} lg:w-auto lg:min-w-[165px]`}
            >
              <option value="">Mọi loại dữ liệu</option>
              {(Object.keys(DATA_TYPE_LABEL) as DataType[]).map(t => (
                <option key={t} value={t}>
                  {DATA_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          {isAdmin && tab === 'shared' && (
            <p className="text-xs text-gray-500">
              Chỉ gồm tư liệu được chia sẻ trực tiếp cho tài khoản của bạn.
              Tư liệu xem bằng quyền quản trị nằm ở “Của người khác”.
            </p>
          )}
        </div>
      )}

      {/* ── Bảng ── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-4 py-3 font-medium">Dữ liệu</th>
                {canEditLabels && <th className="px-4 py-3 font-medium">Bệnh nhân</th>}
                <th className="px-4 py-3 font-medium">Phân loại</th>
                <th className="px-4 py-3 font-medium">Loại dữ liệu</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Dung lượng</th>
                {isAdmin && <th className="px-4 py-3 font-medium">Người tải lên</th>}
                <th className="px-4 py-3 font-medium">Ngày tải lên</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns} className="px-4 py-10 text-center">
                    <span className="material-symbols-outlined animate-spin text-3xl text-gray-300">
                      autorenew
                    </span>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns} className="px-4 py-12 text-center">
                    <span className="material-symbols-outlined text-4xl text-gray-200">
                      inventory_2
                    </span>
                    <p className="mt-2 text-sm text-gray-400">
                      {q || category || dataType
                        ? 'Không có dữ liệu nào khớp bộ lọc.'
                        : tab === 'shared'
                          ? 'Chưa có ai chia sẻ dữ liệu cho bạn.'
                          : tab === 'others'
                            ? 'Chưa có tư liệu của người dùng khác.'
                            : 'Kho dữ liệu còn trống.'}
                    </p>
                    {!q && !category && !dataType && (tab === 'all' || tab === 'mine') && (
                      <Link
                        href="/library/new/"
                        className="mt-2 inline-block text-sm text-primary underline underline-offset-2"
                      >
                        Tải dữ liệu đầu tiên lên
                      </Link>
                    )}
                  </td>
                </tr>
              ) : (
                rows.map(a => (
                  <tr key={a.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <AssetThumb asset={a} />
                        <div className="min-w-0">
                          <Link
                            href={`/library/${a.id}/`}
                            className="block max-w-[220px] truncate font-medium leading-tight text-gray-900 hover:text-primary"
                          >
                            {a.title}
                          </Link>
                          <p className="max-w-[220px] truncate text-[11px] text-gray-400">
                            {a.original_filename}
                          </p>
                        </div>
                      </div>
                    </td>
                    {canEditLabels && (
                      <td className="px-4 py-3">
                        {a.patient ? (
                          <>
                            <p className="leading-tight text-gray-700">{a.patient.name}</p>
                            <span className="font-mono text-[11px] text-gray-400">
                              {a.patient.patient_code}
                            </span>
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-600">{a.category_name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-gray-600">
                        <span className="material-symbols-outlined text-[16px] text-gray-400">
                          {DATA_TYPE_ICON[a.data_type]}
                        </span>
                        {a.data_type_display}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${ASSET_STATUS_CLASS[a.status]}`}
                      >
                        {(a.status === 'processing' || a.status === 'uploading') && (
                          <span className="material-symbols-outlined animate-spin text-[11px]">
                            autorenew
                          </span>
                        )}
                        {ASSET_STATUS_LABEL[a.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-500">
                      {a.file_size ? formatFileSize(a.file_size) : '—'}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-gray-600">
                        {a.uploaded_by?.full_name || a.uploaded_by?.username || (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {fmtDate(a.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/library/${a.id}/`}
                          title="Xem dữ liệu"
                          className="rounded-lg p-1.5 text-primary transition-colors hover:bg-primary/5"
                        >
                          <span className="material-symbols-outlined text-[18px]">visibility</span>
                        </Link>
                        {a.diagnosis_target && (
                          <Link
                            href={diagnosisUrl(a)!}
                            title={DIAGNOSIS_ROUTES[a.diagnosis_target].label}
                            aria-label={DIAGNOSIS_ROUTES[a.diagnosis_target].label}
                            className="rounded-lg p-1.5 text-primary transition-colors hover:bg-primary/5"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {a.diagnosis_target === 'canine3d' ? 'view_in_ar' : 'oral_disease'}
                            </span>
                          </Link>
                        )}
                        <button
                          onClick={() => handleDownload(a)}
                          disabled={a.status !== 'ready' || busyId === a.id}
                          title={
                            a.status === 'ready'
                              ? 'Tải xuống'
                              : 'Chưa xử lý xong, chưa tải xuống được'
                          }
                          className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30"
                        >
                          <span
                            className={`material-symbols-outlined text-[18px] ${busyId === a.id ? 'animate-spin' : ''}`}
                          >
                            {busyId === a.id ? 'autorenew' : 'download'}
                          </span>
                        </button>
                        {(a.permission === 'owner' || a.permission === 'admin') && (
                          <button
                            onClick={() => handleDelete(a)}
                            title="Xoá"
                            className="rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
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

/**
 * Ảnh nhỏ đầu dòng. Endpoint thumbnail đòi JWT nên phải tải blob qua axios rồi dựng
 * object URL — không gắn thẳng vào `<img src>` được. Mục chưa xử lý xong (hoặc loại
 * dữ liệu không sinh được ảnh, vd. PDF) rơi về icon theo loại dữ liệu.
 */
function AssetThumb({ asset }: { asset: DataAsset }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (asset.status !== 'ready' || asset.preview_count === 0) return;
    let url: string | null = null;
    let cancelled = false;
    fetchAssetThumbnailBlob(asset.id)
      .then(blob => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {
        /* không có thumbnail — giữ nguyên icon mặc định */
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [asset.id, asset.status, asset.preview_count]);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 object-cover"
      />
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
      <span className="material-symbols-outlined text-[20px] text-gray-400">
        {DATA_TYPE_ICON[asset.data_type]}
      </span>
    </span>
  );
}
