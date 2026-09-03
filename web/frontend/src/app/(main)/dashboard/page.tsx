'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ROLE_LABEL, type AuthUser, type Role } from '@/lib/auth';
import {
  CASE_STATUS_LABEL,
  MGI_COLOR,
  MGI_LABEL,
  fetchDashboard,
  type DashboardData,
} from '@/lib/dashboard';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  ASSIGNMENT_WORKBOOK_ACCEPT,
  ASSIGNMENT_WORKBOOK_MAX_SIZE,
  assignmentUploadError,
  fetchLatestAssignmentWorkbook,
  uploadAssignmentWorkbook,
  type AssignmentWorkbook,
} from '@/lib/reception';

const MGI_LEVELS = ['0', '1', '2', '3', '4'];

const LOG_CATEGORY_LABEL: Record<string, string> = {
  admin: 'Quản trị',
  auth: 'Xác thực',
  business: 'Nghiệp vụ',
  error: 'Lỗi',
};

// ── Khối dùng lại ────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: string;
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'default' | 'amber' | 'red' | 'green';
}) {
  const tones = {
    default: 'bg-primary-50 text-primary',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-green-50 text-green-600',
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
          {hint && <p className="mt-0.5 truncate text-[11px] text-gray-400">{hint}</p>}
        </div>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}
        >
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </span>
      </div>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="font-serif text-[15px] font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ModuleCard({
  href,
  icon,
  title,
  description,
  total,
  ready,
  processing,
  shared,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  total: number;
  ready: number;
  processing: number;
  shared: number;
}) {
  const stats: Array<[string, number]> = [
    ['Tổng', total],
    ['Sẵn sàng', ready],
    ['Đang xử lý', processing],
    ['Được chia sẻ', shared],
  ];
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-gray-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
          <span className="material-symbols-outlined text-[23px]">{icon}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-serif text-sm font-semibold text-gray-900">{title}</h3>
            <span className="material-symbols-outlined text-[18px] text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary">
              arrow_forward
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 border-t border-gray-100 pt-3 text-center">
        {stats.map(([label, value]) => (
          <div key={label}>
            <p className="text-base font-semibold tabular-nums text-gray-900">{value}</p>
            <p className="truncate text-[10px] text-gray-400">{label}</p>
          </div>
        ))}
      </div>
    </Link>
  );
}

/** Biểu đồ cột MGI — SVG/CSS thuần, không thêm thư viện đồ thị. */
function MgiChart({ data }: { data: Record<string, number> }) {
  const total = MGI_LEVELS.reduce((s, l) => s + (data[l] ?? 0), 0);
  const max = Math.max(1, ...MGI_LEVELS.map(l => data[l] ?? 0));

  if (total === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-400">
        Chưa có dữ liệu chẩn đoán để thống kê.
      </p>
    );
  }

  return (
    <div>
      <div className="flex h-40 items-end gap-3">
        {MGI_LEVELS.map(level => {
          const n = data[level] ?? 0;
          const pct = (n / max) * 100;
          return (
            <div key={level} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-xs font-medium tabular-nums text-gray-600">{n}</span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-lg transition-all duration-500"
                  style={{
                    height: `${Math.max(pct, n > 0 ? 3 : 0)}%`,
                    backgroundColor: MGI_COLOR[level],
                  }}
                  title={`MGI ${level} — ${MGI_LABEL[level]}: ${n}`}
                />
              </div>
              <span className="text-xs font-semibold text-gray-700">MGI {level}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-3">
        {MGI_LEVELS.map(level => (
          <span key={level} className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: MGI_COLOR[level] }}
            />
            {MGI_LABEL[level]}
            <span className="tabular-nums text-gray-400">
              ({total > 0 ? Math.round(((data[level] ?? 0) / total) * 100) : 0}%)
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusBar({ data, total }: { data: Record<string, number>; total: number }) {
  const colors: Record<string, string> = {
    done: '#22c55e',
    processing: '#eab308',
    failed: '#ef4444',
  };
  const entries = Object.entries(data).filter(([, n]) => n > 0);

  if (total === 0) {
    return <p className="py-4 text-center text-sm text-gray-400">Chưa có ca chẩn đoán nào.</p>;
  }

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        {entries.map(([status, n]) => (
          <div
            key={status}
            style={{ width: `${(n / total) * 100}%`, backgroundColor: colors[status] }}
            title={`${CASE_STATUS_LABEL[status]}: ${n}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {Object.entries(data).map(([status, n]) => (
          <span key={status} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: colors[status] ?? '#d1d5db' }}
            />
            {CASE_STATUS_LABEL[status] ?? status}
            <span className="font-semibold tabular-nums text-gray-900">{n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Kết quả yêu cầu cấp vai trò của chính người đang xem.
 *
 * Ẩn khi yêu cầu đã duyệt VÀ vai trò đã đúng — lúc đó banner không còn thông tin
 * gì mới. Trường hợp bị từ chối thì luôn hiện lý do, nếu không người dùng sẽ đi
 * đăng ký tài khoản mới thay vì bổ sung thông tin.
 */
function RoleRequestBanner({
  request,
  currentRole,
}: {
  request: AuthUser['my_role_request'];
  currentRole?: Role;
}) {
  if (!request) return null;
  if (request.status === 'approved' && currentRole === request.requested_role) return null;

  const style = {
    pending: {
      box: 'border-amber-200 bg-amber-50 text-amber-800',
      icon: 'hourglass_top',
      title: 'Yêu cầu cấp vai trò đang chờ duyệt',
    },
    approved: {
      box: 'border-green-200 bg-green-50 text-green-800',
      icon: 'check_circle',
      title: 'Yêu cầu cấp vai trò đã được duyệt',
    },
    rejected: {
      box: 'border-red-200 bg-red-50 text-red-800',
      icon: 'cancel',
      title: 'Yêu cầu cấp vai trò đã bị từ chối',
    },
  }[request.status];

  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${style.box}`}>
      <span className="material-symbols-outlined mt-0.5 shrink-0 text-[20px]">{style.icon}</span>
      <div className="min-w-0">
        <p className="font-medium">{style.title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed">
          {request.status === 'pending' && (
            <>
              Bạn đã yêu cầu vai trò <strong>{ROLE_LABEL[request.requested_role]}</strong>. Trong
              lúc chờ, tài khoản vẫn dùng bình thường với quyền bệnh nhân — bạn tải ảnh và xem
              kết quả được, nhưng chưa chỉnh sửa nhãn chẩn đoán.
            </>
          )}
          {request.status === 'rejected' && (
            <>
              Quản trị viên chưa cấp vai trò{' '}
              <strong>{ROLE_LABEL[request.requested_role]}</strong> cho bạn.
              {request.review_note && (
                <>
                  {' '}
                  Lý do: <em>&ldquo;{request.review_note}&rdquo;</em>
                </>
              )}{' '}
              Bạn có thể liên hệ quản trị viên để bổ sung thông tin.
            </>
          )}
          {request.status === 'approved' && (
            <>
              Bạn đã được cấp vai trò <strong>{ROLE_LABEL[request.requested_role]}</strong>. Hãy
              đăng xuất và đăng nhập lại để áp dụng quyền mới.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function ReceptionistDashboard({ user }: { user: AuthUser | null }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [latestWorkbook, setLatestWorkbook] = useState<AssignmentWorkbook | null>(null);
  const [isLoadingWorkbook, setIsLoadingWorkbook] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchLatestAssignmentWorkbook()
      .then(setLatestWorkbook)
      .catch(error => setUploadError(assignmentUploadError(error)))
      .finally(() => setIsLoadingWorkbook(false));
  }, []);

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploadError(null);
    setUploadSuccess(null);
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.xlsx', '.xls'].includes(extension)) {
      setUploadError('Chỉ chấp nhận file Excel có định dạng .xlsx hoặc .xls.');
      return;
    }
    if (file.size === 0) {
      setUploadError('File tải lên đang trống.');
      return;
    }
    if (file.size > ASSIGNMENT_WORKBOOK_MAX_SIZE) {
      setUploadError('File Excel không được vượt quá 10 MB.');
      return;
    }

    setIsUploading(true);
    try {
      const uploaded = await uploadAssignmentWorkbook(file);
      setLatestWorkbook(uploaded);
      setUploadSuccess(`Đã tải lên “${uploaded.original_filename}” thành công.`);
    } catch (error) {
      setUploadError(assignmentUploadError(error));
    } finally {
      setIsUploading(false);
    }
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 via-primary to-primary-700 px-6 py-7 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white/90">
              <span className="material-symbols-outlined text-[16px]">support_agent</span>
              Không gian làm việc Lễ tân
            </span>
            <h1 className="mt-3 font-serif text-2xl font-semibold">
              Xin chào, {user?.full_name || user?.username}
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-white/80">
              Tài khoản của bạn đã sẵn sàng. Trong giai đoạn hiện tại, vai trò Lễ tân
              chỉ sử dụng trang Tổng quan.
            </p>
          </div>
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
            <span className="material-symbols-outlined text-[34px]">space_dashboard</span>
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon="badge" label="Vai trò hiện tại" value="Lễ tân" tone="green" />
        <StatCard icon="dashboard" label="Khu vực khả dụng" value="Tổng quan" />
        <StatCard icon="notifications" label="Trung tâm thông báo" value="Đang hoạt động" />
      </div>

      <Section title="File Excel phân công">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-dashed border-primary/35 bg-primary-50/40 p-5">
            <input
              ref={fileInputRef}
              type="file"
              accept={ASSIGNMENT_WORKBOOK_ACCEPT}
              className="hidden"
              onChange={handleFileSelected}
            />
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm">
                <span className="material-symbols-outlined text-[27px]">upload_file</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  Tải lịch phân công từ máy tính
                </p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                  Hỗ trợ .xlsx và .xls, tối đa 10 MB. Mỗi lần tải lên được lưu thành một
                  phiên bản mới.
                </p>
              </div>
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span
                  className={`material-symbols-outlined text-[19px] ${
                    isUploading ? 'animate-spin' : ''
                  }`}
                >
                  {isUploading ? 'autorenew' : 'upload'}
                </span>
                {isUploading ? 'Đang tải lên...' : 'Tải file Excel lên'}
              </button>
            </div>

            {uploadError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <span className="material-symbols-outlined mt-0.5 text-[18px]">error</span>
                <span>{uploadError}</span>
              </div>
            )}
            {uploadSuccess && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700">
                <span className="material-symbols-outlined mt-0.5 text-[18px]">
                  check_circle
                </span>
                <span>{uploadSuccess}</span>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <div className="flex items-center gap-2 text-gray-700">
              <span className="material-symbols-outlined text-[20px]">description</span>
              <p className="text-sm font-semibold">File gần nhất</p>
            </div>
            {isLoadingWorkbook ? (
              <div className="mt-5 flex items-center gap-2 text-sm text-gray-400">
                <span className="material-symbols-outlined animate-spin text-[19px]">
                  autorenew
                </span>
                Đang kiểm tra...
              </div>
            ) : latestWorkbook ? (
              <div className="mt-4 min-w-0">
                <p className="truncate text-sm font-medium text-gray-900" title={latestWorkbook.original_filename}>
                  {latestWorkbook.original_filename}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {formatFileSize(latestWorkbook.file_size)} · Tải lúc{' '}
                  {new Date(latestWorkbook.created_at).toLocaleString('vi-VN')}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                  <span className="material-symbols-outlined text-[15px]">cloud_done</span>
                  Đã lưu an toàn
                </span>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-gray-500">
                Bạn chưa tải file phân công nào lên hệ thống.
              </p>
            )}
          </div>
        </div>
      </Section>

      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="material-symbols-outlined mt-0.5 shrink-0 text-[20px]">
          construction
        </span>
        <p>
          Giao diện lịch, bảng làm việc và chức năng chỉnh sửa dữ liệu Excel sẽ được phát
          triển ở giai đoạn tiếp theo. Hiện tại hệ thống chỉ tiếp nhận và lưu phiên bản file.
        </p>
      </div>
    </div>
  );
}

// ── Trang ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .catch(() => setError('Không tải được dữ liệu tổng quan. Vui lòng thử lại.'));
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <span className="material-symbols-outlined text-[18px]">error</span>
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-gray-300">
          autorenew
        </span>
      </div>
    );
  }

  if (data.scope === 'receptionist') {
    return <ReceptionistDashboard user={user} />;
  }

  const { cases, scans, library, mgi, users, activity } = data;
  const canUseScans = Boolean(user);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary-600 to-teal-700 px-5 py-5 text-white shadow-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-white/70">
              Trung tâm điều hành DentAI
            </p>
            <h1 className="mt-1 font-serif text-2xl font-semibold">
              Xin chào, {user?.full_name || user?.username}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-white/75">
              {data.scope === 'all'
                ? 'Theo dõi toàn bộ hoạt động chẩn đoán và lưu trữ của hệ thống.'
                : 'Theo dõi dữ liệu do bạn tạo và những nội dung được chia sẻ với bạn.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/analysis/new/"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-primary shadow-sm hover:bg-primary-50"
            >
              <span className="material-symbols-outlined text-[17px]">add_photo_alternate</span>
              Chẩn đoán mới
            </Link>
            <Link
              href="/library/new/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20"
            >
              <span className="material-symbols-outlined text-[17px]">cloud_upload</span>
              Tải dữ liệu lên
            </Link>
          </div>
        </div>
      </div>

      <RoleRequestBanner request={user?.my_role_request ?? null} currentRole={user?.role} />

      {/* Thẻ số liệu ca */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="folder" label="Tổng số ca" value={cases.total} />
        <StatCard icon="image" label="Tổng số ảnh" value={cases.images_total} />
        <StatCard
          icon="warning"
          label="Ảnh độ tin cậy thấp"
          value={cases.low_confidence}
          hint="Cần chụp lại hoặc khám lâm sàng"
          tone="amber"
        />
        <StatCard
          icon="share"
          label="Được chia sẻ với tôi"
          value={cases.shared_with_me}
          tone="green"
        />
      </div>

      <div className={`grid gap-4 ${canUseScans ? 'lg:grid-cols-2' : ''}`}>
        {canUseScans && (
          <ModuleCard
            href="/scans/"
            icon="view_in_ar"
            title="Răng nanh ngầm 3D"
            description={
              user?.role === 'patient'
                ? 'Tải phim CBCT và xem kết quả phân vùng của bạn'
                : 'Phim CBCT, phân vùng và chia sẻ 3D Slicer'
            }
            total={scans.total}
            ready={scans.by_status.ready}
            processing={(scans.by_status.uploading ?? 0) + (scans.by_status.processing ?? 0)}
            shared={scans.shared_with_me}
          />
        )}
        <ModuleCard
          href="/library/"
          icon="inventory_2"
          title="Kho dữ liệu"
          description="DICOM, ảnh trong miệng, Pano và tài liệu"
          total={library.total}
          ready={library.by_status.ready}
          processing={(library.by_status.uploading ?? 0) + (library.by_status.processing ?? 0)}
          shared={library.shared_with_me}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Trạng thái ca chẩn đoán">
          <StatusBar data={cases.by_status} total={cases.total} />
        </Section>

        <Section title="Phân bố mức độ viêm lợi (MGI)">
          <MgiChart data={mgi} />
        </Section>
      </div>

      {/* Ca gần đây */}
      <Section
        title="Ca gần đây"
        action={
          <Link href="/history/" className="text-xs font-medium text-primary hover:underline">
            Xem tất cả
          </Link>
        }
      >
        {cases.recent.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-400">Chưa có ca chẩn đoán nào.</p>
            <Link
              href="/analysis/new/"
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              Tạo phân tích mới
            </Link>
          </div>
        ) : (
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                  <th className="px-4 py-2.5 font-medium">Bệnh nhân</th>
                  <th className="px-4 py-2.5 font-medium">Mã BN</th>
                  <th className="px-4 py-2.5 font-medium">Ảnh</th>
                  <th className="px-4 py-2.5 font-medium">Trạng thái</th>
                  {isAdmin && <th className="px-4 py-2.5 font-medium">Người tạo</th>}
                  <th className="px-4 py-2.5 font-medium">Ngày tạo</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {cases.recent.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {c.patient.name}
                      {c.is_shared_with_me && (
                        <span className="ml-1.5 rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                          chia sẻ
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{c.patient.patient_code}</td>
                    <td className="px-4 py-2.5 tabular-nums text-gray-600">{c.image_count}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {CASE_STATUS_LABEL[c.status] ?? c.status}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2.5 text-gray-500">
                        {c.owner ? c.owner.full_name || c.owner.username : '—'}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-gray-500">
                      {new Date(c.created_at).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={
                          c.status === 'done'
                            ? `/analysis/${c.id}/results/0/`
                            : `/analysis/${c.id}/processing/`
                        }
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {c.status === 'done' ? 'Xem kết quả' : 'Theo dõi'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Khối quản trị — backend chỉ trả `users` cho admin */}
      {users && (
        <>
          <h2 className="pt-1 font-serif text-[15px] font-semibold text-gray-900">
            Quản trị hệ thống
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon="group"
              label="Tổng người dùng"
              value={users.total}
              hint={`+${users.new_7d} trong 7 ngày qua`}
            />
            <StatCard
              icon="mark_email_unread"
              label="Chưa xác thực email"
              value={users.unverified}
              tone="amber"
            />
            <StatCard icon="lock" label="Đang bị khoá" value={users.locked} tone="red" />
            <Link href="/users/" className="block">
              <StatCard
                icon="how_to_reg"
                label="Yêu cầu chờ duyệt"
                value={users.pending_role_requests}
                hint={users.pending_role_requests > 0 ? 'Bấm để xem và duyệt' : undefined}
                tone={users.pending_role_requests > 0 ? 'amber' : 'default'}
              />
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section
              title="Người dùng theo vai trò"
              action={
                <Link href="/users/" className="text-xs font-medium text-primary hover:underline">
                  Quản lý
                </Link>
              }
            >
              <div className="space-y-2.5">
                {(Object.keys(ROLE_LABEL) as Array<keyof typeof ROLE_LABEL>).map(role => {
                  const n = users.by_role[role] ?? 0;
                  const pct = users.total > 0 ? (n / users.total) * 100 : 0;
                  return (
                    <div key={role}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-gray-600">{ROLE_LABEL[role]}</span>
                        <span className="font-semibold tabular-nums text-gray-900">{n}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            {activity && (
              <Section
                title="Hoạt động 7 ngày qua"
                action={
                  <Link
                    href="/system-log/"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Xem lịch sử
                  </Link>
                }
              >
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(activity.last_7d_by_category).map(([cat, n]) => (
                    <div key={cat} className="rounded-lg bg-gray-50 px-3 py-2.5">
                      <p className="text-xs text-gray-500">{LOG_CATEGORY_LABEL[cat] ?? cat}</p>
                      <p
                        className={`mt-0.5 text-lg font-semibold tabular-nums ${
                          cat === 'error' && n > 0 ? 'text-red-600' : 'text-gray-900'
                        }`}
                      >
                        {n}
                      </p>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
