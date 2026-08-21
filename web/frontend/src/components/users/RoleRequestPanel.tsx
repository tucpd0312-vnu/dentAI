'use client';

import { useCallback, useEffect, useState } from 'react';

import { ROLE_LABEL } from '@/lib/auth';
import {
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_STYLE,
  approveRoleRequest,
  fetchRoleRequests,
  rejectRoleRequest,
  type RoleRequest,
  type RoleRequestStatus,
} from '@/lib/roleRequests';
import { apiErrorMessage } from '@/lib/users';

const PAGE_SIZE = 20;
const TABS: { key: RoleRequestStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'approved', label: 'Đã duyệt' },
  { key: 'rejected', label: 'Đã từ chối' },
  { key: 'all', label: 'Tất cả' },
];

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Hộp thoại nhập lý do từ chối — backend bắt buộc phải có. */
function RejectDialog({
  req,
  onClose,
  onDone,
}: {
  req: RoleRequest;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!note.trim()) {
      setError('Vui lòng nhập lý do từ chối.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await rejectRoleRequest(req.id, note.trim());
      onDone(`Đã từ chối yêu cầu của ${req.username}.`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Không từ chối được yêu cầu.'));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="border-b border-gray-100 px-5 py-3.5">
          <h3 className="font-serif text-[15px] font-semibold text-gray-900">
            Từ chối yêu cầu của {req.username}
          </h3>
        </div>
        <div className="space-y-3 p-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              Lý do từ chối *
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              autoFocus
              placeholder="VD: Đơn vị công tác chưa rõ, vui lòng ghi rõ khoa/phòng."
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Người đăng ký sẽ đọc được lý do này và có thể gửi lại yêu cầu sau khi bổ sung.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Huỷ
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? 'Đang xử lý…' : 'Từ chối'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RoleRequestPanel({ onReviewed }: { onReviewed?: () => void }) {
  const [tab, setTab] = useState<RoleRequestStatus | 'all'>('pending');
  const [rows, setRows] = useState<RoleRequest[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<RoleRequest | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRoleRequests(tab, page);
      setRows(data.results);
      setCount(data.count);
    } catch (err) {
      setError(apiErrorMessage(err, 'Không tải được danh sách yêu cầu.'));
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  }

  async function handleApprove(req: RoleRequest) {
    setApprovingId(req.id);
    setError(null);
    try {
      await approveRoleRequest(req.id);
      flash(`Đã cấp vai trò ${ROLE_LABEL[req.requested_role]} cho ${req.username}.`);
      await load();
      onReviewed?.();
    } catch (err) {
      setError(apiErrorMessage(err, 'Không duyệt được yêu cầu.'));
    } finally {
      setApprovingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="space-y-3">
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          {notice}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <span className="material-symbols-outlined mt-0.5 text-[18px]">error</span>
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setPage(1);
            }}
            className={`rounded-xl px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-primary text-white'
                : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-gray-200 bg-white">
          <span className="material-symbols-outlined animate-spin text-3xl text-gray-300">
            autorenew
          </span>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center">
          <span className="material-symbols-outlined text-4xl text-gray-200">inbox</span>
          <p className="mt-2 text-sm text-gray-400">
            {tab === 'pending'
              ? 'Không có yêu cầu nào đang chờ duyệt.'
              : 'Không có yêu cầu nào trong mục này.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {rows.map(req => (
            <li key={req.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {req.full_name || req.username}
                    </span>
                    <span className="text-xs text-gray-400">@{req.username}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        REQUEST_STATUS_STYLE[req.status]
                      }`}
                    >
                      {REQUEST_STATUS_LABEL[req.status]}
                    </span>
                    {req.previous_rejections > 0 && (
                      <span
                        className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700"
                        title="Số lần tài khoản này từng bị từ chối trước đó"
                      >
                        đã bị từ chối {req.previous_rejections} lần
                      </span>
                    )}
                    {!req.email_verified && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                        chưa xác thực email
                      </span>
                    )}
                  </div>

                  <p className="mt-1.5 text-sm text-gray-700">
                    Xin cấp vai trò{' '}
                    <strong className="text-primary">{ROLE_LABEL[req.requested_role]}</strong>
                    <span className="text-gray-400">
                      {' '}
                      (hiện tại: {ROLE_LABEL[req.current_role]})
                    </span>
                  </p>

                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                    <div className="flex gap-1.5">
                      <dt className="shrink-0 text-gray-400">Đơn vị:</dt>
                      <dd className="text-gray-700">{req.organization || '—'}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="shrink-0 text-gray-400">Email:</dt>
                      <dd className="truncate text-gray-700">{req.email}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="shrink-0 text-gray-400">Điện thoại:</dt>
                      <dd className="text-gray-700">{req.phone || '—'}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="shrink-0 text-gray-400">Gửi lúc:</dt>
                      <dd className="text-gray-700">{fmt(req.created_at)}</dd>
                    </div>
                  </dl>

                  {req.note && (
                    <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs italic text-gray-600">
                      &ldquo;{req.note}&rdquo;
                    </p>
                  )}

                  {req.status !== 'pending' && (
                    <p className="mt-2 text-xs text-gray-500">
                      {REQUEST_STATUS_LABEL[req.status]} bởi{' '}
                      <strong>{req.reviewed_by_username ?? '—'}</strong> lúc{' '}
                      {fmt(req.reviewed_at)}
                      {req.review_note && (
                        <>
                          {' — '}
                          <span className="italic">{req.review_note}</span>
                        </>
                      )}
                    </p>
                  )}
                </div>

                {req.status === 'pending' && (
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRejecting(req)}
                        className="rounded-xl border border-gray-300 px-3.5 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                      >
                        Từ chối
                      </button>
                      <button
                        onClick={() => handleApprove(req)}
                        disabled={!!req.blocking_reason || approvingId === req.id}
                        title={req.blocking_reason ?? undefined}
                        className="rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {approvingId === req.id ? 'Đang duyệt…' : 'Duyệt'}
                      </button>
                    </div>
                    {/* Nói rõ vì sao nút Duyệt bị khoá, thay vì để admin bấm rồi nhận lỗi */}
                    {req.blocking_reason && (
                      <p className="max-w-[260px] text-right text-[11px] leading-snug text-amber-600">
                        {req.blocking_reason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5">
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

      {rejecting && (
        <RejectDialog
          req={rejecting}
          onClose={() => setRejecting(null)}
          onDone={msg => {
            setRejecting(null);
            flash(msg);
            void load();
            onReviewed?.();
          }}
        />
      )}
    </div>
  );
}
