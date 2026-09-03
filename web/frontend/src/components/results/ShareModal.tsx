'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ROLE_LABEL } from '@/lib/auth';
import {
  PERMISSION_LABEL,
  createScanShare,
  createShare,
  deleteScanShare,
  deleteShare,
  fetchScanShares,
  fetchShares,
  updateScanShare,
  updateShare,
  type CaseShare,
  type ScanShare,
  type SharePermission,
} from '@/lib/shares';
import { apiErrorMessage, searchUsers, type UserSuggestion } from '@/lib/users';

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY = 2;

/**
 * Chia sẻ ca chẩn đoán cho tài khoản khác trên hệ thống.
 *
 * Chỉ chọn được người ĐÃ CÓ tài khoản — không có link công khai, không mời email
 * lạ. Autocomplete trả email đã che một phần (`ngu***@gmail.com`) nên cửa sổ này
 * không dùng để thu thập email nội bộ được.
 */
type ShareModalProps =
  | { caseId: number | string; scanId?: never; patientName?: string; onClose: () => void }
  | { scanId: number | string; caseId?: never; patientName?: string; onClose: () => void };

type ShareRecord = CaseShare | ScanShare;

export default function ShareModal(props: ShareModalProps) {
  const isScan = props.scanId !== undefined;
  const resourceId = isScan ? props.scanId : props.caseId;
  const resourceLabel = isScan ? 'phim' : 'ca';
  const { patientName, onClose } = props;
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<UserSuggestion | null>(null);
  const [permission, setPermission] = useState<SharePermission>('view');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setShares(isScan ? await fetchScanShares(resourceId) : await fetchShares(resourceId));
    } catch (err) {
      setError(apiErrorMessage(err, `Không tải được danh sách chia sẻ ${resourceLabel}.`));
    } finally {
      setLoading(false);
    }
  }, [isScan, resourceId, resourceLabel]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Autocomplete: debounce 300ms, tối thiểu 2 ký tự (backend cũng chặn ở mức này).
  useEffect(() => {
    if (picked) return;
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const users = await searchUsers(q);
        setResults(
          isScan
            ? users.filter(user => user.role === 'admin' || user.role === 'doctor')
            : users.filter(user => user.role !== 'receptionist'),
        );
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, picked, isScan]);

  // Bệnh nhân không nhận được quyền sửa — backend trả 400, nên tự hạ về 'view'
  // ngay khi chọn để người dùng không phải chạm vào lỗi.
  useEffect(() => {
    if (picked && !picked.can_receive_edit && permission === 'edit') setPermission('view');
  }, [picked, permission]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      if (isScan) await createScanShare(resourceId, picked.id, permission, note);
      else await createShare(resourceId, picked.id, permission, note);
      flash(`Đã chia sẻ cho ${picked.full_name || picked.username}.`);
      setPicked(null);
      setQuery('');
      setNote('');
      setPermission('view');
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, `Không chia sẻ được ${resourceLabel} này.`));
    } finally {
      setSaving(false);
    }
  }

  async function changePermission(share: ShareRecord, next: SharePermission) {
    setError(null);
    try {
      if (isScan) await updateScanShare(share.id, next);
      else await updateShare(share.id, next);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Không đổi được quyền chia sẻ.'));
    }
  }

  async function revoke(share: ShareRecord) {
    setError(null);
    try {
      if (isScan) await deleteScanShare(share.id);
      else await deleteShare(share.id);
      flash(`Đã thu hồi chia sẻ với ${share.shared_with_username}.`);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thu hồi được chia sẻ.'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-3.5">
          <div>
            <h2 className="font-serif text-[15px] font-semibold text-gray-900">
              {isScan ? 'Chia sẻ phim RNNHT 3D' : 'Chia sẻ ca chẩn đoán'}
            </h2>
            {patientName && <p className="text-xs text-gray-500">Bệnh nhân: {patientName}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100"
            aria-label="Đóng"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="space-y-4 p-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px]">error</span>
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              {notice}
            </div>
          )}

          {/* Thêm người nhận */}
          <form onSubmit={submit} className="space-y-3">
            <div className="relative" ref={boxRef}>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">
                Chia sẻ với
              </label>

              {picked ? (
                <div className="flex items-center gap-2.5 rounded-lg border border-primary/40 bg-primary-50 px-3 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                    {(picked.full_name || picked.username).charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {picked.full_name || picked.username}
                    </p>
                    <p className="truncate text-[11px] text-gray-500">
                      {picked.username} · {picked.email_masked} · {ROLE_LABEL[picked.role]}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(null);
                      setQuery('');
                    }}
                    className="rounded-lg p-1 text-gray-400 hover:bg-white"
                    aria-label="Bỏ chọn"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">
                      person_search
                    </span>
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Nhập tên, tên đăng nhập hoặc email…"
                      className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {searching && (
                      <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-[16px] text-gray-300">
                        autorenew
                      </span>
                    )}
                  </div>

                  {query.trim().length > 0 && query.trim().length < MIN_QUERY && (
                    <p className="mt-1 text-[11px] text-gray-400">
                      Nhập ít nhất {MIN_QUERY} ký tự để tìm kiếm.
                    </p>
                  )}

                  {results.length > 0 && (
                    <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                      {results.map(u => (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setPicked(u);
                              setResults([]);
                            }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-gray-50"
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[11px] font-semibold text-gray-600">
                              {(u.full_name || u.username).charAt(0).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-gray-900">
                                {u.full_name || u.username}
                              </span>
                              <span className="block truncate text-[11px] text-gray-500">
                                {u.username} · {u.email_masked}
                              </span>
                            </span>
                            <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                              {ROLE_LABEL[u.role]}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {!searching && query.trim().length >= MIN_QUERY && results.length === 0 && (
                    <p className="mt-1 text-[11px] text-amber-600">
                      {isScan
                        ? 'Không tìm thấy bác sĩ hoặc quản trị viên phù hợp.'
                        : 'Không tìm thấy tài khoản nào. Người nhận phải có tài khoản trên hệ thống.'}
                    </p>
                  )}
                </>
              )}
            </div>

            {picked && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-600">Quyền</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['view', 'edit'] as SharePermission[]).map(p => {
                      const disabled = p === 'edit' && !picked.can_receive_edit;
                      return (
                        <button
                          key={p}
                          type="button"
                          disabled={disabled}
                          onClick={() => setPermission(p)}
                          title={
                            disabled
                              ? 'Chỉ cấp được quyền chỉnh sửa cho bác sĩ hoặc quản trị viên'
                              : undefined
                          }
                          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                            permission === p
                              ? 'border-primary bg-primary-50 text-primary'
                              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                          } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
                        >
                          {isScan && p === 'edit' ? 'Xem và nộp phân vùng' : PERMISSION_LABEL[p]}
                        </button>
                      );
                    })}
                  </div>
                  {!picked.can_receive_edit && (
                    <p className="mt-1 text-[11px] text-amber-600">
                      Tài khoản bệnh nhân chỉ nhận được quyền xem — nhãn chẩn đoán do bác sĩ
                      chỉnh sửa sẽ được dùng để huấn luyện lại mô hình.
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-600">
                    Lời nhắn (không bắt buộc)
                  </label>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    rows={2}
                    placeholder="Ví dụ: Nhờ anh xem giúp ca này…"
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                >
                  {saving ? 'Đang chia sẻ…' : 'Chia sẻ'}
                </button>
              </>
            )}
          </form>

          {/* Danh sách đang chia sẻ */}
          <div className="border-t border-gray-100 pt-4">
            <h3 className="mb-2 text-xs font-medium text-gray-600">
              Đang chia sẻ với {shares.length > 0 && `(${shares.length})`}
            </h3>

            {loading ? (
              <div className="py-4 text-center">
                <span className="material-symbols-outlined animate-spin text-2xl text-gray-300">
                  autorenew
                </span>
              </div>
            ) : shares.length === 0 ? (
              <p className="py-3 text-center text-sm text-gray-400">
                {isScan ? 'Phim này chưa được chia sẻ với ai.' : 'Ca này chưa được chia sẻ với ai.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {shares.map(s => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2.5 rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
                      {(s.shared_with_full_name || s.shared_with_username).charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {s.shared_with_full_name || s.shared_with_username}
                      </p>
                      <p className="truncate text-[11px] text-gray-500">
                        {ROLE_LABEL[s.shared_with_role]}
                        {s.note && ` · ${s.note}`}
                      </p>
                    </div>
                    <select
                      value={s.permission}
                      onChange={e => changePermission(s, e.target.value as SharePermission)}
                      className="shrink-0 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
                    >
                      <option value="view">{PERMISSION_LABEL.view}</option>
                      <option
                        value="edit"
                        disabled={
                          isScan
                            ? s.shared_with_role !== 'admin' &&
                              s.shared_with_role !== 'doctor'
                            : s.shared_with_role !== 'admin' &&
                              s.shared_with_role !== 'doctor' &&
                              s.shared_with_role !== 'student'
                        }
                      >
                        {isScan ? 'Xem và nộp phân vùng' : PERMISSION_LABEL.edit}
                      </option>
                    </select>
                    <button
                      onClick={() => revoke(s)}
                      title="Thu hồi chia sẻ"
                      className="shrink-0 rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">person_remove</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
