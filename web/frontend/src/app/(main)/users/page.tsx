'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { ROLE_LABEL, type Role } from '@/lib/auth';
import {
  apiErrorMessage,
  createUser,
  deleteUser,
  fetchUsers,
  restoreUser,
  updateUser,
  type AdminUser,
  type UserFilters,
} from '@/lib/users';
import { useRequireRole } from '@/lib/useRequireRole';
import { useAuth } from '@/components/providers/AuthProvider';
import RoleRequestPanel from '@/components/users/RoleRequestPanel';

const PAGE_SIZE = 20;
const ROLES: Role[] = ['admin', 'doctor', 'patient'];

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-purple-50 text-purple-700',
  doctor: 'bg-primary-50 text-primary',
  patient: 'bg-gray-100 text-gray-600',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ── Modal khung ──────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <h2 className="font-serif text-[15px] font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100"
            aria-label="Đóng"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors ' +
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 ' +
  'disabled:bg-gray-50 disabled:text-gray-400';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px]">error</span>
      <span>{message}</span>
    </div>
  );
}

// ── Modal tạo user ───────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'doctor' as Role,
    first_name: '',
    last_name: '',
    phone: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createUser(form);
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, 'Không tạo được tài khoản.'));
      setSaving(false);
    }
  }

  return (
    <Modal title="Tạo tài khoản mới" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5 p-5">
        {error && <ErrorBox message={error} />}

        <Field label="Tên đăng nhập *">
          <input required value={form.username} onChange={set('username')} className={inputCls} />
        </Field>
        <Field label="Email *">
          <input required type="email" value={form.email} onChange={set('email')} className={inputCls} />
        </Field>
        <Field label="Mật khẩu *">
          <input
            required
            type="password"
            value={form.password}
            onChange={set('password')}
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và chữ số.
          </p>
        </Field>
        <Field label="Vai trò *">
          <select value={form.role} onChange={set('role')} className={inputCls}>
            {ROLES.map(r => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Họ">
            <input value={form.last_name} onChange={set('last_name')} className={inputCls} />
          </Field>
          <Field label="Tên">
            <input value={form.first_name} onChange={set('first_name')} className={inputCls} />
          </Field>
        </div>
        <Field label="Số điện thoại">
          <input value={form.phone} onChange={set('phone')} className={inputCls} />
        </Field>

        <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
          Tài khoản do quản trị viên tạo được kích hoạt ngay, không cần xác thực OTP qua email.
        </p>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {saving ? 'Đang tạo…' : 'Tạo tài khoản'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Modal sửa user ───────────────────────────────────────────────────────────

function EditUserModal({
  user,
  isSelf,
  onClose,
  onDone,
}: {
  user: AdminUser;
  isSelf: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    phone: user.phone,
    role: user.role,
    is_active: user.is_active,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateUser(user.id, form);
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, 'Không cập nhật được tài khoản.'));
      setSaving(false);
    }
  }

  return (
    <Modal title={`Sửa: ${user.username}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5 p-5">
        {error && <ErrorBox message={error} />}

        <Field label="Email">
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Họ">
            <input
              value={form.last_name}
              onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Tên">
            <input
              value={form.first_name}
              onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Số điện thoại">
          <input
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            className={inputCls}
          />
        </Field>

        <Field label="Vai trò">
          <select
            value={form.role}
            disabled={isSelf}
            onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))}
            className={inputCls}
          >
            {ROLES.map(r => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          {isSelf && (
            <p className="mt-1 text-[11px] text-amber-600">
              Bạn không thể tự thay đổi vai trò của chính mình.
            </p>
          )}
          {form.role === 'patient' && user.role !== 'patient' && (
            <p className="mt-1 text-[11px] text-amber-600">
              Hạ xuống Bệnh nhân sẽ tự động chuyển mọi quyền chia sẻ &ldquo;Xem và sửa&rdquo;
              của tài khoản này về &ldquo;Chỉ xem&rdquo;.
            </p>
          )}
        </Field>

        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-gray-700">Trạng thái hoạt động</p>
            <p className="text-[11px] text-gray-500">
              {form.is_active ? 'Đang hoạt động' : 'Bị khoá — không đăng nhập được'}
            </p>
          </div>
          <button
            type="button"
            disabled={isSelf}
            onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
              form.is_active ? 'bg-green-500' : 'bg-gray-300'
            }`}
            aria-label="Bật/tắt hoạt động"
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                form.is_active ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Modal xác nhận xoá ───────────────────────────────────────────────────────

function DeleteUserModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteUser(user.id);
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, 'Không xoá được tài khoản.'));
      setBusy(false);
    }
  }

  return (
    <Modal title="Xác nhận xoá tài khoản" onClose={onClose}>
      <div className="space-y-3.5 p-5">
        {error && <ErrorBox message={error} />}

        <p className="text-sm text-gray-600">
          Xoá tài khoản <strong className="text-gray-900">{user.username}</strong> (
          {ROLE_LABEL[user.role]})?
        </p>

        <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          Đây là <strong>xoá mềm</strong>: tài khoản không đăng nhập được nữa nhưng
          {user.case_count > 0 && <> {user.case_count} ca chẩn đoán và </>} toàn bộ lịch sử
          hoạt động vẫn được giữ nguyên. Bạn có thể khôi phục bất cứ lúc nào ở bộ lọc
          &ldquo;Đã xoá&rdquo;.
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Huỷ
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? 'Đang xoá…' : 'Xoá tài khoản'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Trang ────────────────────────────────────────────────────────────────────

type MainTab = 'accounts' | 'requests';

export default function UsersPage() {
  const { allowed, checking } = useRequireRole(['admin']);
  const { user: me, refreshUser } = useAuth();
  const [mainTab, setMainTab] = useState<MainTab>('accounts');

  const [rows, setRows] = useState<AdminUser[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [filters, setFilters] = useState<UserFilters>({ q: '', role: '', is_active: '', is_deleted: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUsers({ ...filters, page });
      setRows(data.results);
      setCount(data.count);
    } catch (err) {
      setError(apiErrorMessage(err, 'Không tải được danh sách người dùng.'));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    // Chỉ nạp danh sách tài khoản khi đang ở tab đó.
    if (allowed && mainTab === 'accounts') void load();
  }, [allowed, load, mainTab]);

  // Gõ xong 350ms mới gọi API, tránh bắn request mỗi ký tự.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters(f => (f.q === search ? f : { ...f, q: search }));
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  }

  async function handleRestore(u: AdminUser) {
    try {
      await restoreUser(u.id);
      flash(`Đã khôi phục tài khoản ${u.username}.`);
      void load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Không khôi phục được tài khoản.'));
    }
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

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const viewingTrash = filters.is_deleted === 'true';
  // Lấy từ /auth/me/ — không cần request riêng cho badge.
  const pendingCount = me?.pending_role_requests ?? 0;
  const activeFilterCount =
    Number(Boolean(search.trim())) +
    Number(Boolean(filters.role)) +
    Number(Boolean(filters.is_active)) +
    Number(Boolean(filters.is_deleted));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl font-semibold text-gray-900">Quản lý người dùng</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {mainTab === 'accounts'
              ? `${count} tài khoản${viewingTrash ? ' đã xoá' : ''}`
              : 'Duyệt yêu cầu cấp vai trò từ người tự đăng ký'}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {mainTab === 'accounts' && (
            <button
              type="button"
              onClick={() => setFiltersOpen(open => !open)}
              aria-expanded={filtersOpen}
              aria-controls="user-filters"
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
          )}
          <Link
            href="/system-log/"
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <span className="material-symbols-outlined text-[18px]">receipt_long</span>
            Lịch sử hệ thống
          </Link>
          {mainTab === 'accounts' && (
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-600"
            >
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              Tạo tài khoản
            </button>
          )}
        </div>
      </div>

      {/* Tab chính: danh sách tài khoản / hàng chờ duyệt vai trò */}
      <div className="flex gap-1.5 border-b border-gray-200">
        {([
          { key: 'accounts' as MainTab, label: 'Tài khoản', icon: 'group' },
          { key: 'requests' as MainTab, label: 'Yêu cầu đăng ký', icon: 'how_to_reg' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              mainTab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
            {t.label}
            {t.key === 'requests' && pendingCount > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {mainTab === 'requests' ? (
        // Duyệt xong thì refreshUser() để badge sidebar tụt theo.
        <RoleRequestPanel onReviewed={() => void refreshUser()} />
      ) : (
      <>
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          {notice}
        </div>
      )}
      {error && <ErrorBox message={error} />}

      {/* Bộ lọc */}
      {filtersOpen && (
        <div
          id="user-filters"
          className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 lg:flex-row lg:items-center"
        >
          <div className="relative min-w-[220px] flex-1">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">
              search
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Tìm người dùng"
              placeholder="Tìm theo tên đăng nhập, email, họ tên…"
              className={`${inputCls} pl-9`}
            />
          </div>

          <select
            value={filters.role ?? ''}
            onChange={e => {
              setFilters(f => ({ ...f, role: e.target.value as Role | '' }));
              setPage(1);
            }}
            aria-label="Lọc theo vai trò"
            className={`${inputCls} lg:w-auto lg:min-w-[145px]`}
          >
            <option value="">Mọi vai trò</option>
            {ROLES.map(r => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>

          <select
            value={filters.is_active ?? ''}
            onChange={e => {
              setFilters(f => ({ ...f, is_active: e.target.value as 'true' | 'false' | '' }));
              setPage(1);
            }}
            aria-label="Lọc theo trạng thái hoạt động"
            className={`${inputCls} lg:w-auto lg:min-w-[155px]`}
          >
            <option value="">Mọi trạng thái</option>
            <option value="true">Đang hoạt động</option>
            <option value="false">Bị khoá</option>
          </select>

          <select
            value={filters.is_deleted ?? ''}
            onChange={e => {
              setFilters(f => ({ ...f, is_deleted: e.target.value as 'true' | 'all' | '' }));
              setPage(1);
            }}
            aria-label="Lọc theo trạng thái xoá"
            className={`${inputCls} lg:w-auto lg:min-w-[125px]`}
          >
            <option value="">Chưa xoá</option>
            <option value="true">Đã xoá</option>
            <option value="all">Tất cả</option>
          </select>
        </div>
      )}

      {/* Bảng */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-4 py-3 font-medium">Người dùng</th>
                <th className="px-4 py-3 font-medium">Vai trò</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Số ca</th>
                <th className="px-4 py-3 font-medium">Ngày tạo</th>
                <th className="px-4 py-3 font-medium">Đăng nhập cuối</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <span className="material-symbols-outlined animate-spin text-3xl text-gray-300">
                      autorenew
                    </span>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                    Không có tài khoản nào khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                rows.map(u => {
                  const isSelf = u.id === me?.id;
                  return (
                    <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{u.username}</span>
                          {isSelf && (
                            <span className="rounded-full bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              bạn
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {u.full_name !== u.username && `${u.full_name} · `}
                          {u.email}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_BADGE[u.role]}`}
                        >
                          {ROLE_LABEL[u.role]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.is_deleted ? (
                          <span className="text-xs font-medium text-red-600">Đã xoá</span>
                        ) : u.is_active ? (
                          <span className="text-xs text-green-600">Hoạt động</span>
                        ) : (
                          <span className="text-xs text-amber-600">Bị khoá</span>
                        )}
                        {!u.email_verified && !u.is_deleted && (
                          <div className="text-[11px] text-gray-400">chưa xác thực email</div>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-gray-600">{u.case_count}</td>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(u.date_joined)}</td>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(u.last_login)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {u.is_deleted ? (
                            <button
                              onClick={() => handleRestore(u)}
                              title="Khôi phục"
                              className="rounded-lg p-1.5 text-green-600 transition-colors hover:bg-green-50"
                            >
                              <span className="material-symbols-outlined text-[18px]">restore</span>
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => setEditing(u)}
                                title="Sửa"
                                className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100"
                              >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                              </button>
                              <button
                                onClick={() => setDeleting(u)}
                                disabled={isSelf}
                                title={isSelf ? 'Không thể tự xoá tài khoản của mình' : 'Xoá'}
                                className="rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
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
      </>
      )}

      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            flash('Đã tạo tài khoản mới.');
            void load();
          }}
        />
      )}
      {editing && (
        <EditUserModal
          user={editing}
          isSelf={editing.id === me?.id}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            flash('Đã cập nhật tài khoản.');
            void load();
          }}
        />
      )}
      {deleting && (
        <DeleteUserModal
          user={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => {
            setDeleting(null);
            flash('Đã xoá tài khoản.');
            void load();
          }}
        />
      )}
    </div>
  );
}
