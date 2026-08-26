'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import type { ActivityLog } from '@/lib/activity';
import {
  fetchScan,
  fetchScanLogs,
  fetchScanPreviewBlob,
  fetchScanStatus,
  fetchSegmentations,
  formatFileSize,
  openScanToken,
  scanDownloadUrl,
  segmentationFileUrl,
  SCAN_STATUS_CLASS,
  SCAN_STATUS_LABEL,
  type OpenTokenResponse,
  type ScanDetail,
  type Segmentation,
} from '@/lib/scans';
import { apiErrorMessage } from '@/lib/users';
import { useRequireRole } from '@/lib/useRequireRole';
import ShareModal from '@/components/results/ShareModal';

const POLL_MS = 2000;

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ScanDetailPage() {
  const { allowed, checking } = useRequireRole(['admin', 'doctor']);
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [segs, setSegs] = useState<Segmentation[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  const [openState, setOpenState] = useState<OpenTokenResponse | null>(null);
  const [openBusy, setOpenBusy] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [sharing, setSharing] = useState(false);
  const slicerFallbackTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await fetchScan(id);
      const [sg, lg] = await Promise.all([
        fetchSegmentations(id),
        s.can_manage_shares ? fetchScanLogs(id) : Promise.resolve([]),
      ]);
      setScan(s);
      setSegs(sg);
      setLogs(lg);
    } catch {
      setLoadError(true);
    }
  }, [id]);

  useEffect(() => () => {
    if (slicerFallbackTimer.current !== null) window.clearTimeout(slicerFallbackTimer.current);
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  // Không có route /scans/{id}/processing riêng (khác apps.cases) — trang chi tiết
  // tự poll trạng thái và cập nhật inline, theo đúng PLAN_3D_CANINE.md §5.
  useEffect(() => {
    if (!scan || (scan.status !== 'processing' && scan.status !== 'uploading')) return;
    const t = setInterval(async () => {
      try {
        const st = await fetchScanStatus(id);
        if (st.status !== scan.status) void load();
      } catch {
        /* mạng lỗi tạm thời — thử lại ở lần poll sau */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [scan, id, load]);

  async function handleOpenSlicer() {
    setOpenBusy(true);
    setOpenError(null);
    try {
      const res = await openScanToken(id);
      setOpenState(res);
      let desktopOpened = false;
      const markOpened = () => { desktopOpened = true; };
      window.addEventListener('blur', markOpened, { once: true });
      document.addEventListener('visibilitychange', markOpened, { once: true });
      window.location.href = res.open_url;
      slicerFallbackTimer.current = window.setTimeout(() => {
        window.removeEventListener('blur', markOpened);
        document.removeEventListener('visibilitychange', markOpened);
        if (!desktopOpened && document.visibilityState === 'visible') {
          router.push(`/downloads/3d-slicer/?return=${encodeURIComponent(`/scans/${id}/`)}`);
        }
      }, 2800);
    } catch (err) {
      setOpenError(apiErrorMessage(err, 'Không mở được phim. Vui lòng thử lại.'));
    } finally {
      setOpenBusy(false);
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

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <span className="material-symbols-outlined text-5xl text-red-300">broken_image</span>
        <p className="text-sm text-gray-600">Không thể tải thông tin phim này.</p>
        <Link href="/scans/" className="text-sm text-primary underline underline-offset-2">
          Quay lại kho phim
        </Link>
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-400">
        <span className="material-symbols-outlined animate-spin text-5xl">autorenew</span>
        <p className="text-sm">Đang tải…</p>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/scans/"
            className="mb-1 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Kho phim
          </Link>
          <h1 className="font-serif text-xl font-semibold text-gray-900">{scan.patient.name}</h1>
          <p className="font-mono text-xs text-gray-400">{scan.patient.patient_code}</p>
        </div>
        <div className="flex items-center gap-2">
          {scan.can_manage_shares && (
            <button
              type="button"
              onClick={() => setSharing(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <span className="material-symbols-outlined text-[16px]">person_add</span>
              Chia sẻ
            </button>
          )}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${SCAN_STATUS_CLASS[scan.status]}`}
          >
            {(scan.status === 'processing' || scan.status === 'uploading') && (
              <span className="material-symbols-outlined animate-spin text-[13px]">autorenew</span>
            )}
            {SCAN_STATUS_LABEL[scan.status]}
          </span>
        </div>
      </div>

      {scan.status === 'failed' && scan.error_message && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="material-symbols-outlined mt-0.5 shrink-0 text-[20px] text-red-500">
            error
          </span>
          <div>
            <p className="font-semibold">Xử lý thất bại</p>
            <p className="mt-0.5 text-xs text-red-700">{scan.error_message}</p>
          </div>
        </div>
      )}
      {(scan.status === 'processing' || scan.status === 'uploading') && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span className="material-symbols-outlined animate-spin text-[20px]">autorenew</span>
          Đang xử lý phim trên máy chủ — giải nén, ẩn danh, sinh ảnh xem trước. Trang sẽ
          tự cập nhật khi xong.
        </div>
      )}

      {/* ── Two-column layout ── */}
      <div className="flex flex-wrap items-start gap-5">
        {/* Slice viewer */}
        <div className="min-w-0 flex-1 basis-96">
          <SliceViewer scanId={scan.id} count={scan.preview_count} />
        </div>

        {/* Sidebar */}
        <div className="w-full shrink-0 space-y-4 sm:w-80">
          <Card title="Thông tin phim">
            <InfoRow label="Modality" value={scan.modality || '—'} />
            <InfoRow label="Số lát" value={scan.n_slices ? String(scan.n_slices) : '—'} />
            <InfoRow
              label="Dung lượng"
              value={scan.file_size ? formatFileSize(scan.file_size) : '—'}
            />
            <InfoRow label="Ngày chụp" value={fmtDateTime(scan.acquired_at)} />
            <InfoRow
              label="Người tải lên"
              value={scan.uploaded_by?.full_name || scan.uploaded_by?.username || '—'}
            />
            <InfoRow label="Ngày tải lên" value={fmtDateTime(scan.created_at)} />
            <InfoRow
              label="Ẩn danh"
              value={scan.is_anonymized ? 'Đã khử thông tin cá nhân' : 'Chưa xử lý'}
            />
            {scan.note && (
              <div className="mt-2 border-t border-gray-100 pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Ghi chú
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{scan.note}</p>
              </div>
            )}
          </Card>

          <Card title="Mở trong 3D Slicer">
            <button
              onClick={handleOpenSlicer}
              disabled={scan.status !== 'ready' || openBusy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[18px]">view_in_ar</span>
              {openBusy ? 'Đang gửi lệnh…' : 'Mở phim DICOM'}
            </button>
            {scan.status !== 'ready' && (
              <p className="mt-1.5 text-[11px] text-gray-400">
                Chỉ mở được khi phim đã xử lý xong.
              </p>
            )}
            {openError && <p className="mt-1.5 text-xs text-red-600">{openError}</p>}

            {openState && (
              <div className="mt-3 space-y-1.5 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                <p>Đã gửi lệnh mở 3D Slicer. Chưa thấy gì?</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <a
                    href={scanDownloadUrl(openState.token)}
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    Tải file ZIP về máy
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowHelp(v => !v)}
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    Cài đặt tích hợp / Hướng dẫn
                  </button>
                </div>
                {showHelp && (
                  <p className="rounded-md bg-white p-2 text-[11px] leading-relaxed text-gray-500">
                    Cần cài 3D Slicer và đăng ký DentAI Slicer Bridge một lần trên máy.
                    Xem trang hướng dẫn để tải đúng gói cho hệ điều hành; nếu vẫn không mở
                    được, hãy tải ZIP và mở thủ công trong Slicer.
                  </p>
                )}
                <Link
                  href={`/downloads/3d-slicer/?return=${encodeURIComponent(`/scans/${id}/`)}`}
                  className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
                >
                  Mở trang cài đặt 3D Slicer
                </Link>
                <p className="text-[10px] text-gray-400">
                  Đường dẫn hết hạn lúc {fmtDateTime(openState.expires_at)} — dùng được một
                  lần.
                </p>
              </div>
            )}
          </Card>

          <Card title="Kết quả phân vùng" badge={segs.length ? String(segs.length) : undefined}>
            {segs.length === 0 ? (
              <p className="text-xs text-gray-400">Chưa có kết quả nào được nộp.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {segs.map(s => (
                  <div key={s.id} className="flex items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-700">
                        Phiên bản {s.version}
                        {s.author && (
                          <span className="ml-1.5 font-normal text-gray-400">
                            · {s.author.full_name || s.author.username}
                          </span>
                        )}
                      </p>
                      {s.note && (
                        <p className="mt-0.5 truncate text-[11px] text-gray-500">{s.note}</p>
                      )}
                      <p className="text-[10px] text-gray-400">{fmtDateTime(s.created_at)}</p>
                    </div>
                    <a
                      href={segmentationFileUrl(s.id)}
                      className="shrink-0 rounded-lg p-1 text-primary hover:bg-primary/5"
                      title="Tải về"
                    >
                      <span className="material-symbols-outlined text-[16px]">download</span>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Nhật ký truy cập">
            {logs.length === 0 ? (
              <p className="text-xs text-gray-400">Chưa có hoạt động nào.</p>
            ) : (
              <div className="max-h-64 space-y-2.5 overflow-y-auto">
                {logs.map(l => (
                  <div key={l.id} className="text-xs">
                    <p className="text-gray-700">
                      <span className="font-medium">{l.actor_label || 'Hệ thống'}</span>{' '}
                      {l.action_display.toLowerCase()}
                    </p>
                    <p className="text-[10px] text-gray-400">{fmtDateTime(l.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
    {sharing && (
      <ShareModal
        scanId={scan.id}
        patientName={scan.patient.name}
        onClose={() => setSharing(false)}
      />
    )}
    </>
  );
}

/* ── Slice viewer ──────────────────────────────────────────────── */

function SliceViewer({ scanId, count }: { scanId: number; count: number }) {
  const [index, setIndex] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cache = useRef<Map<number, string>>(new Map());

  // Dọn mọi object URL đã tạo khi rời trang — tránh rò rỉ bộ nhớ.
  useEffect(() => {
    const c = cache.current;
    return () => {
      c.forEach(url => URL.revokeObjectURL(url));
      c.clear();
    };
  }, []);

  useEffect(() => {
    if (count === 0) return;
    const cached = cache.current.get(index);
    if (cached) {
      setSrc(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // Debounce nhẹ khi kéo thanh trượt nhanh — tránh bắn một request mỗi pixel.
    const t = setTimeout(async () => {
      try {
        const blob = await fetchScanPreviewBlob(scanId, index);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        cache.current.set(index, url);
        setSrc(url);
      } catch {
        if (!cancelled) setSrc(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [scanId, index, count]);

  if (count === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl border border-gray-200 bg-gray-950">
        <p className="text-sm text-gray-500">Chưa có ảnh xem trước</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-950">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`Lát cắt ${index + 1}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="material-symbols-outlined animate-spin text-4xl text-gray-700">
            autorenew
          </span>
        )}
        {loading && src && (
          <span className="material-symbols-outlined absolute right-2.5 top-2.5 animate-spin text-lg text-white/70">
            autorenew
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2">
        <button
          type="button"
          onClick={() => setIndex(i => Math.max(0, i - 1))}
          disabled={index === 0}
          className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-[20px]">chevron_left</span>
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0, count - 1)}
          value={index}
          onChange={e => setIndex(Number(e.target.value))}
          className="flex-1 accent-primary"
        />
        <button
          type="button"
          onClick={() => setIndex(i => Math.min(count - 1, i + 1))}
          disabled={index === count - 1}
          className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-[20px]">chevron_right</span>
        </button>
        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-gray-500">
          {index + 1} / {count}
        </span>
      </div>
    </div>
  );
}

/* ── Sidebar building blocks ───────────────────────────────────── */

function Card({
  title, badge, children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="font-serif text-[13px] font-semibold text-gray-900">{title}</h3>
        {badge && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
            {badge}
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-gray-700">{value}</span>
    </div>
  );
}
