'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api, { CaseStatus } from '@/lib/api';

const TERMINAL_IMG = new Set(['done', 'low_confidence', 'failed']);
const POLL_MS = 2000;

const IMG_STATUS: Record<string, { icon: string; color: string; label: string; spin?: true }> = {
  queued:         { icon: 'schedule',     color: 'text-gray-400',  label: 'Chờ xử lý' },
  processing:     { icon: 'autorenew',    color: 'text-primary',   label: 'Đang xử lý', spin: true },
  done:           { icon: 'check_circle', color: 'text-green-500', label: 'Hoàn tất' },
  low_confidence: { icon: 'warning',      color: 'text-amber-500', label: 'Độ tin cậy thấp' },
  failed:         { icon: 'cancel',       color: 'text-red-500',   label: 'Lỗi' },
};

export default function ProcessingPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const router = useRouter();

  const [caseData, setCaseData] = useState<CaseStatus | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const { data } = await api.get<CaseStatus>(`/cases/${caseId}/status/`);
        if (!mounted) return;
        setCaseData(data);
        setFetchError(false);

        if (data.status === 'done') {
          setRedirecting(true);
          timerRef.current = setTimeout(
            () => router.push(`/analysis/${caseId}/results/0`),
            700,
          );
          return;
        }
        if (data.status !== 'failed') {
          timerRef.current = setTimeout(poll, POLL_MS);
        }
      } catch {
        if (!mounted) return;
        setFetchError(true);
        timerRef.current = setTimeout(poll, POLL_MS);
      }
    };

    poll();
    return () => {
      mounted = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [caseId, router]);

  const total = caseData?.images.length ?? 0;
  const doneCount = caseData?.images.filter(img => TERMINAL_IMG.has(img.status)).length ?? 0;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const isFailed = caseData?.status === 'failed';

  /* ── Initial loading ────────────────────────────────────────── */
  if (!caseData && !fetchError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <span className="material-symbols-outlined text-5xl text-gray-300 animate-spin">
          autorenew
        </span>
        <p className="text-sm text-gray-400">Đang kết nối…</p>
      </div>
    );
  }

  /* ── Cannot reach server (no data yet) ─────────────────────── */
  if (!caseData && fetchError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
        <span className="material-symbols-outlined text-5xl text-red-300">cloud_off</span>
        <p className="text-sm text-gray-600">Không thể kết nối tới máy chủ.</p>
        <p className="text-xs text-gray-400">Đang thử lại…</p>
      </div>
    );
  }

  const barPct = redirecting ? 100 : pct;
  const barColor = redirecting ? 'bg-green-500' : isFailed ? 'bg-red-400' : 'bg-primary';

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* ── Status card ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-7 flex flex-col items-center gap-5 text-center">
          {/* Icon */}
          <span
            className={`material-symbols-outlined text-[56px] ${
              isFailed
                ? 'text-red-400'
                : redirecting
                ? 'text-green-500'
                : 'text-primary animate-spin'
            }`}
          >
            {isFailed ? 'cancel' : redirecting ? 'check_circle' : 'autorenew'}
          </span>

          {/* Title + subtitle */}
          <div className="space-y-1">
            <h2 className="font-serif font-semibold text-[17px] text-gray-900">
              {isFailed
                ? 'Phân tích thất bại'
                : redirecting
                ? 'Phân tích hoàn tất!'
                : `Đang phân tích ${total} ảnh…`}
            </h2>
            <p className="text-sm text-gray-500">
              {isFailed
                ? 'Đã xảy ra lỗi trong quá trình xử lý.'
                : redirecting
                ? 'Đang chuyển sang màn hình kết quả…'
                : `Hoàn thành ${doneCount} / ${total} ảnh`}
            </p>
          </div>

          {/* Progress bar */}
          {!isFailed && (
            <div className="w-full space-y-1.5">
              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>
                  {redirecting
                    ? 'Hoàn tất — đang chuyển hướng…'
                    : 'Vui lòng giữ trang này mở'}
                </span>
                <span className="font-medium">{barPct}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Per-image status grid ── */}
      {total > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-serif font-semibold text-[14px] text-gray-900">
              Trạng thái từng ảnh
            </h3>
            <span className="text-xs text-gray-500">
              {doneCount}/{total} xong
            </span>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {caseData!.images
              .slice()
              .sort((a, b) => a.order_index - b.order_index)
              .map(img => {
                const cfg = IMG_STATUS[img.status] ?? IMG_STATUS.queued;
                return (
                  <div
                    key={img.id}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100"
                  >
                    <span
                      className={`material-symbols-outlined text-[20px] shrink-0 ${cfg.color} ${
                        cfg.spin ? 'animate-spin' : ''
                      }`}
                    >
                      {cfg.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">
                        Ảnh {img.order_index + 1}
                      </p>
                      <p className={`text-[11px] leading-tight ${cfg.color}`}>{cfg.label}</p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Failed: action buttons ── */}
      {isFailed && (
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/analysis/new"
            className="
              flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
              bg-primary text-white hover:bg-primary-600 transition-colors shadow-sm
            "
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            Phân tích mới
          </Link>
          <Link
            href="/history"
            className="
              flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
              border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors
            "
          >
            <span className="material-symbols-outlined text-[18px]">history</span>
            Xem lịch sử
          </Link>
        </div>
      )}

      {/* ── Network warning (has data, still retrying) ── */}
      {fetchError && !isFailed && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <span className="material-symbols-outlined text-[18px] shrink-0">wifi_off</span>
          <span>Mất kết nối — đang thử lại…</span>
        </div>
      )}
    </div>
  );
}
