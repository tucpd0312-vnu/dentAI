'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import {
  ACTIONS_BY_CATEGORY,
  CATEGORY_ICON,
  CATEGORY_LABEL,
  CATEGORY_STYLE,
  LOG_PAGE_SIZE,
  MODULE_LABEL,
  MODULE_STYLE,
  fetchActivityLogs,
  type ActivityFilters,
  type ActivityLog,
  type LogCategory,
  type LogModule,
} from '@/lib/activity';
import { apiErrorMessage } from '@/lib/users';
import { useRequireRole } from '@/lib/useRequireRole';

const CATEGORIES: LogCategory[] = ['admin', 'auth', 'business', 'error'];
const MODULES: LogModule[] = ['gingivitis', 'canine3d', 'system'];

const inputCls =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors ' +
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Diễn giải `detail` (JSON tự do) thành văn bản đọc được.
 *
 * Các key hay gặp được dịch riêng; phần còn lại đổ ra dạng `khoá: giá trị` để
 * không mất thông tin khi thêm action mới mà quên cập nhật chỗ này.
 */
const DETAIL_KEY_LABEL: Record<string, string> = {
  role: 'vai trò',
  username: 'tài khoản',
  email: 'email',
  permission: 'quyền',
  before: 'trước',
  after: 'sau',
  n_images: 'số ảnh',
  n_failed: 'số ảnh lỗi',
  n_low_confidence: 'số ảnh tin cậy thấp',
  patient_code: 'mã BN',
  image_index: 'ảnh số',
  field: 'trường',
  op: 'thao tác',
  tooth_fdi: 'răng',
  mgi: 'MGI',
  scope: 'phạm vi',
  error: 'lỗi',
  key: 'khoá',
  blacklisted: 'đã thu hồi token',
  created: 'tạo mới',
  shares_downgraded_to_view: 'số chia sẻ hạ về chỉ xem',
};

function renderDetail(detail: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(detail)) {
    if (v === null || v === undefined || v === '') continue;
    const label = DETAIL_KEY_LABEL[k] ?? k;
    const value =
      typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 'có' : 'không') : String(v);
    parts.push(`${label}: ${value}`);
  }
  return parts.join(' · ');
}

function LogRow({ log }: { log: ActivityLog }) {
  const [open, setOpen] = useState(false);
  const detailText = renderDetail(log.detail);
  const isError = log.category === 'error';
  const isFailedLogin = log.action === 'login_failed';

  return (
    <>
      <tr
        className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 ${
          isError ? 'bg-red-50/40' : ''
        }`}
      >
        <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-gray-500">
          {fmtDateTime(log.created_at)}
        </td>
        <td className="px-4 py-2.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              CATEGORY_STYLE[log.category]
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">
              {CATEGORY_ICON[log.category]}
            </span>
            {CATEGORY_LABEL[log.category]}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
              MODULE_STYLE[log.module]
            }`}
          >
            {log.module === 'system' ? '—' : MODULE_LABEL[log.module]}
          </span>
        </td>
        <td
          className={`px-4 py-2.5 text-sm ${
            isError || isFailedLogin ? 'font-medium text-red-600' : 'text-gray-800'
          }`}
        >
          {log.action_display}
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-700">
          {log.actor_label === 'system' ? (
            <span className="text-gray-400">hệ thống</span>
          ) : log.actor_label === 'anonymous' ? (
            <span className="text-gray-400">khách</span>
          ) : (
            log.actor_label
          )}
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-600">
          {log.target_user_label && <span>{log.target_user_label}</span>}
          {log.target_case && (
            <Link
              href={`/analysis/${log.target_case}/results/0/`}
              className="text-primary hover:underline"
            >
              {log.target_user_label ? ' · ' : ''}Ca #{log.target_case}
            </Link>
          )}
          {log.target_scan && (
            <Link href={`/scans/${log.target_scan}/`} className="text-indigo-600 hover:underline">
              {log.target_user_label || log.target_case ? ' · ' : ''}Phim #{log.target_scan}
            </Link>
          )}
          {!log.target_user_label && !log.target_case && !log.target_scan && (
            <span className="text-gray-300">—</span>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-400">
          {log.ip_address ?? '—'}
        </td>
        <td className="px-4 py-2.5 text-right">
          {detailText && (
            <button
              onClick={() => setOpen(o => !o)}
              className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100"
              title="Chi tiết"
            >
              <span className="material-symbols-outlined text-[18px]">
                {open ? 'expand_less' : 'expand_more'}
              </span>
            </button>
          )}
        </td>
      </tr>
      {open && detailText && (
        <tr className="border-b border-gray-50 bg-gray-50">
          <td colSpan={8} className="px-4 py-2.5">
            <p className="break-all font-mono text-[11px] leading-relaxed text-gray-600">
              {detailText}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

export default function SystemLogPage() {
  const { allowed, checking } = useRequireRole(['admin']);

  const [rows, setRows] = useState<ActivityLog[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<ActivityFilters>({
    category: '',
    module: '',
    action: '',
    actor: '',
    date_from: '',
    date_to: '',
  });
  const [actorInput, setActorInput] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchActivityLogs({ ...filters, page });
      setRows(data.results);
      setCount(data.count);
    } catch (err) {
      setError(apiErrorMessage(err, 'Không tải được lịch sử hệ thống.'));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters(f => (f.actor === actorInput ? f : { ...f, actor: actorInput }));
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [actorInput]);

  function setCategory(cat: LogCategory | '') {
    // Đổi nhóm thì bỏ action đang lọc — action cũ không thuộc nhóm mới.
    setFilters(f => ({ ...f, category: cat, action: '' }));
    setPage(1);
  }

  function resetFilters() {
    setFilters({ category: '', module: '', action: '', actor: '', date_from: '', date_to: '' });
    setActorInput('');
    setPage(1);
  }

  if (checking || !allowed) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-gray-300">
          autorenew
        </span>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(count / LOG_PAGE_SIZE));
  const availableActions = filters.category ? ACTIONS_BY_CATEGORY[filters.category] : [];
  const hasFilter = Boolean(
    filters.category || filters.module || filters.action || filters.actor
      || filters.date_from || filters.date_to,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl font-semibold text-gray-900">Lịch sử hệ thống</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {count.toLocaleString('vi-VN')} bản ghi
            {hasFilter ? ' khớp bộ lọc' : ''}
          </p>
        </div>
        <Link
          href="/users/"
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          <span className="material-symbols-outlined text-[18px]">group</span>
          Quản lý người dùng
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {error}
        </div>
      )}

      {/* Tab nhóm sự kiện */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setCategory('')}
          className={`rounded-xl px-3.5 py-1.5 text-sm font-medium transition-colors ${
            filters.category === ''
              ? 'bg-primary text-white'
              : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          Tất cả
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filters.category === cat
                ? 'bg-primary text-white'
                : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">{CATEGORY_ICON[cat]}</span>
            {CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>

      {/* Bộ lọc chi tiết */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500">Loại chẩn đoán</label>
          <select
            value={filters.module ?? ''}
            onChange={e => {
              setFilters(f => ({ ...f, module: e.target.value as LogModule | '' }));
              setPage(1);
            }}
            className={inputCls}
          >
            <option value="">Tất cả</option>
            {MODULES.map(m => (
              <option key={m} value={m}>
                {MODULE_LABEL[m]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500">Hành động</label>
          <select
            value={filters.action ?? ''}
            disabled={!filters.category}
            onChange={e => {
              setFilters(f => ({ ...f, action: e.target.value }));
              setPage(1);
            }}
            className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`}
            title={!filters.category ? 'Chọn nhóm sự kiện trước' : undefined}
          >
            <option value="">Mọi hành động</option>
            {availableActions.map(a => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-[11px] font-medium text-gray-500">
            Người thực hiện
          </label>
          <input
            value={actorInput}
            onChange={e => setActorInput(e.target.value)}
            placeholder="Tên đăng nhập…"
            className={`${inputCls} w-full`}
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500">Từ ngày</label>
          <input
            type="date"
            value={filters.date_from ?? ''}
            onChange={e => {
              setFilters(f => ({ ...f, date_from: e.target.value }));
              setPage(1);
            }}
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500">Đến ngày</label>
          <input
            type="date"
            value={filters.date_to ?? ''}
            onChange={e => {
              setFilters(f => ({ ...f, date_to: e.target.value }));
              setPage(1);
            }}
            className={inputCls}
          />
        </div>

        {hasFilter && (
          <button
            onClick={resetFilters}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Xoá bộ lọc
          </button>
        )}
      </div>

      {/* Bảng */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-4 py-3 font-medium">Thời gian</th>
                <th className="px-4 py-3 font-medium">Nhóm</th>
                <th className="px-4 py-3 font-medium">Loại chẩn đoán</th>
                <th className="px-4 py-3 font-medium">Hành động</th>
                <th className="px-4 py-3 font-medium">Người thực hiện</th>
                <th className="px-4 py-3 font-medium">Đối tượng</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center">
                    <span className="material-symbols-outlined animate-spin text-3xl text-gray-300">
                      autorenew
                    </span>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                    Không có bản ghi nào khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                rows.map(log => <LogRow key={log.id} log={log} />)
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

      <p className="text-center text-[11px] text-gray-400">
        Lịch sử hệ thống chỉ đọc, không thể sửa hay xoá qua giao diện.
        Dọn bản ghi cũ bằng <code className="font-mono">manage.py prune_activity_logs --days N</code>.
      </p>
    </div>
  );
}