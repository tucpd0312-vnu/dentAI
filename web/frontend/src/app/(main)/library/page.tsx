'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { useAuth } from '@/components/providers/AuthProvider';
import {
  libraryTabs,
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
import { apiErrorMessage } from '@/lib/users';

const PAGE_SIZE = 20;

/** Tab lọc — `all` theo phạm vi kho dữ liệu được backend cấp cho mỗi vai trò. */
type Tab = 'all' | 'mine' | 'shared' | 'others';


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
  const {
    isAdmin,
    isDoctor,
    isStudent,
    isReceptionist,
    canEditLabels,
    canViewAllLibrary,
    loading: authLoading,
  } = useAuth();
  const [editableOnly, setEditableOnly] = useState(false);

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
  const [birthYear, setBirthYear] = useState('');
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
        birth_year: birthYear ? Number(birthYear) : undefined,
        category: category || undefined,
        data_type: dataType || undefined,
        mine: tab === 'mine',
        shared: tab === 'shared',
        others: tab === 'others',
        editable: tab === 'others' && editableOnly,
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
  }, [q, birthYear, category, dataType, tab, page, editableOnly]);

  useEffect(() => {
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => setCategories([]));   // bộ lọc hỏng không nên chặn cả trang
  }, []);

  // Kho của sinh viên ưu tiên tư liệu tự tải lên để ôn tập; các tab còn lại vẫn
  // cho phép xem tư liệu được chia sẻ khi cần.
  useEffect(() => {
    if (isStudent) setTab('mine');
  }, [isStudent]);

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
  const showPatient = canEditLabels || isReceptionist;
  const columns = isReceptionist ? 4 : 5 + Number(showPatient);
  const activeFilterCount =
    Number(Boolean(search.trim())) +
    Number(Boolean(birthYear)) +
    Number(category !== '') +
    Number(dataType !== '') +
    Number(tab !== 'all');

  return (
    <div className="w-full space-y-6 px-5 py-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-gray-900 lg:text-3xl">
            {isReceptionist ? 'Kho phim bệnh nhân' : isStudent ? 'Kho dữ liệu ôn tập của tôi' : 'Kho dữ liệu'}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading ? 'Đang tải…' : `${count} mục dữ liệu`}
            {isReceptionist
              ? ' · danh sách phim toàn hệ thống'
              : canViewAllLibrary
              ? ' · dữ liệu toàn hệ thống'
              : isStudent
                ? ' · tư liệu bạn tải lên để ôn tập'
                : ' · dữ liệu của bạn và dữ liệu được chia sẻ cho bạn'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen(open => !open)}
            aria-expanded={filtersOpen}
            aria-controls="library-filters"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-3 text-base font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <span className="material-symbols-outlined text-[22px]">filter_alt</span>
            Bộ lọc
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                {activeFilterCount}
              </span>
            )}
            <span className="material-symbols-outlined text-[22px] text-gray-400">
              {filtersOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>
          {!isReceptionist && <Link
            href="/library/new/"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-primary-600"
          >
            <span className="material-symbols-outlined text-[22px]">upload</span>
            Tải dữ liệu lên
          </Link>}
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
        <div id="library-filters" className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex shrink-0 gap-1 overflow-x-auto">
              {libraryTabs(canViewAllLibrary).map(t => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={tab === t.value}
                  onClick={() => {
                    setTab(t.value);
                    setPage(1);
                  }}
                  className={`shrink-0 rounded-xl px-4 py-2.5 text-base font-medium transition-colors ${
                    tab === t.value
                      ? 'bg-primary/10 text-primary'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  }`}
                >
                  {t.value === 'all' && canViewAllLibrary ? 'Tất cả hệ thống' : t.label}
                </button>
              ))}
            </div>
            <div className="relative min-w-[240px] flex-1">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">
                search
              </span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Tìm trong kho dữ liệu"
                placeholder={
                  showPatient
                    ? 'Tìm theo tiêu đề, tên file hoặc bệnh nhân…'
                    : 'Tìm theo tiêu đề hoặc tên file…'
                }
                className={`${inputCls} pl-9`}
              />
            </div>
            <input
              value={birthYear}
              onChange={e => { setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4)); setPage(1); }}
              inputMode="numeric"
              aria-label="Lọc theo năm sinh bệnh nhân"
              placeholder="Năm sinh, ví dụ 1990"
              className={`${inputCls} lg:w-48`}
            />
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

          {isDoctor && tab === 'others' && <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={editableOnly} onChange={e => { setEditableOnly(e.target.checked); setPage(1); }} />
            Được cấp quyền sửa
          </label>}
        </div>
      )}

      {/* ── Bảng ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-sm text-gray-500">
                {!isReceptionist && <th className="px-5 py-4 font-medium">Dữ liệu</th>}
                {showPatient && <th className="px-5 py-4 font-medium">Bệnh nhân</th>}
                {isReceptionist && <th className="px-5 py-4 font-medium">Ngày sinh</th>}
                <th className="px-5 py-4 font-medium">Phân loại</th>
                {!isReceptionist && <>
                <th className="px-4 py-3 font-medium">Loại dữ liệu</th>
                <th className="px-4 py-3 font-medium">Ngày tải lên</th>
                </>}
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
                    {!q && !birthYear && !category && !dataType && !isReceptionist && (tab === 'all' || tab === 'mine') && (
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
                  <tr key={a.id} className="border-b border-gray-50 last:border-0 hover:bg-primary/[0.03]">
                    {!isReceptionist && <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <AssetThumb asset={a} />
                        <div className="min-w-0">
                          <Link
                            href={`/library/${a.id}/`}
                            className="block max-w-[320px] truncate font-medium leading-tight text-gray-900 hover:text-primary"
                          >
                            {a.title}
                          </Link>
                          <p className="max-w-[320px] truncate text-xs text-gray-400">
                            {a.original_filename}
                          </p>
                          <span className="text-[11px] text-primary">{a.permission === 'owner' ? 'Của tôi' : a.permission === 'admin' ? 'Quản trị' : a.permission === 'edit' ? 'Được cấp quyền sửa' : 'Chỉ xem'}</span>
                        </div>
                      </div>
                    </td>}
                    {showPatient && (
                      <td className="px-5 py-4">
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
                    {isReceptionist && <td className="px-5 py-4 text-gray-600">{a.patient?.birth_year ?? '—'}</td>}
                    <td className="px-5 py-4 text-gray-700">{a.category_name}</td>
                    {!isReceptionist && <>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-gray-600">
                        <span className="material-symbols-outlined text-[16px] text-gray-400">
                          {DATA_TYPE_ICON[a.data_type]}
                        </span>
                        {a.data_type_display}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {fmtDate(a.created_at)}
                    </td>
                    </>}
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/library/${a.id}/`}
                          title="Xem dữ liệu"
                          className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary transition-colors hover:bg-primary/10"
                        >
                          <span className="material-symbols-outlined text-[24px]">visibility</span>
                        </Link>
                        {a.diagnosis_target && (
                          <Link
                            href={diagnosisUrl(a)!}
                            title={DIAGNOSIS_ROUTES[a.diagnosis_target].label}
                            aria-label={DIAGNOSIS_ROUTES[a.diagnosis_target].label}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-primary transition-colors hover:bg-primary/5"
                          >
                              <span className="material-symbols-outlined text-[24px]">
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
                          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30"
                        >
                          <span
                            className={`material-symbols-outlined text-[24px] ${busyId === a.id ? 'animate-spin' : ''}`}
                          >
                            {busyId === a.id ? 'autorenew' : 'download'}
                          </span>
                        </button>
                        {(a.permission === 'owner' || a.permission === 'admin') && (
                          <button
                            onClick={() => handleDelete(a)}
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
        className="h-14 w-14 shrink-0 rounded-xl border border-gray-200 object-cover"
      />
    );
  }
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
      <span className="material-symbols-outlined text-[28px] text-gray-400">
        {DATA_TYPE_ICON[asset.data_type]}
      </span>
    </span>
  );
}
