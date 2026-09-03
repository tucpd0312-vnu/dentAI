'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import api, { CaseStatus, ImageResult } from '@/lib/api';
import SaveToLibraryModal from '@/components/library/SaveToLibraryModal';
import ShareModal from '@/components/results/ShareModal';

/* Konva must not SSR */
const ResultsCanvas = dynamic(
  () => import('@/components/results/ResultsCanvas'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full bg-gray-950 rounded-xl flex items-center justify-center" style={{ minHeight: 360 }}>
        <span className="material-symbols-outlined text-4xl text-gray-700 animate-spin">autorenew</span>
      </div>
    ),
  },
);

/* ── Constants ─────────────────────────────────────────────────── */

const MGI_COLORS: Record<number, string> = {
  0: '#9ca3af', 1: '#22c55e', 2: '#eab308', 3: '#f97316', 4: '#ef4444',
};

const MGI_LABELS: Record<number, string> = {
  0: 'Bình thường', 1: 'Viêm nhẹ', 2: 'Viêm vừa', 3: 'Viêm nặng', 4: 'Viêm rất nặng',
};

const FDI_ORDER = ['13', '12', '11', '21', '22', '23', '43', '42', '41', '31', '32', '33'];

function toMediaUrl(fsPath: string): string {
  const m = fsPath.match(/[/\\]media[/\\](.+)/);
  return m ? `/media/${m[1].replace(/\\/g, '/')}` : fsPath;
}

/* ── Page ──────────────────────────────────────────────────────── */

export default function ResultsPage() {
  const params = useParams();
  const caseId = params.caseId as string;
  const imageIndex = params.imageIndex as string;
  const idx = parseInt(imageIndex, 10) || 0;
  const router = useRouter();

  const [imgData, setImgData] = useState<ImageResult | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [showBoxes, setShowBoxes] = useState(true);
  const [showMasks, setShowMasks] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [savingToLibrary, setSavingToLibrary] = useState(false);

  // Chỉ chủ sở hữu và admin được chia sẻ — người ĐƯỢC chia sẻ không share tiếp.
  const canShare =
    imgData?.case_permission === 'owner' || imgData?.case_permission === 'admin';
  // Lưu vào kho tạo một bản sao riêng, không cấp quyền trên ca nguồn và không
  // chia sẻ tiếp. Vì vậy mọi người đang xem hợp lệ (owner/admin/edit/view) đều
  // được lưu, kể cả người nhận ca được chia sẻ.
  const canSaveToLibrary =
    imgData !== null && imgData.case_permission !== 'none';

  useEffect(() => {
    let mounted = true;
    setImgData(null);
    setError(false);
    Promise.all([
      api.get<ImageResult>(`/cases/${caseId}/images/${idx}/`),
      api.get<CaseStatus>(`/cases/${caseId}/status/`),
    ])
      .then(([imgRes, caseRes]) => {
        if (!mounted) return;
        setImgData(imgRes.data);
        setTotal(caseRes.data.images.length);
      })
      .catch(() => { if (mounted) setError(true); });
    return () => { mounted = false; };
  }, [caseId, idx]);

  /* Keyboard ← → navigation */
  const navRef = useRef({ idx, total, caseId });
  useEffect(() => { navRef.current = { idx, total, caseId }; });
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const { idx, total, caseId } = navRef.current;
      if (e.key === 'ArrowLeft' && idx > 0)
        router.push(`/analysis/${caseId}/results/${idx - 1}/`);
      if (e.key === 'ArrowRight' && total !== null && idx < total - 1)
        router.push(`/analysis/${caseId}/results/${idx + 1}/`);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [router]);

  const hasPrev = idx > 0;
  const hasNext = total !== null && idx < total - 1;

  /* ── Loading ── */
  if (!imgData && !error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
        <span className="material-symbols-outlined text-5xl animate-spin">autorenew</span>
        <p className="text-sm">Đang tải kết quả…</p>
      </div>
    );
  }

  /* ── Error ── */
  if (error || !imgData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <span className="material-symbols-outlined text-5xl text-red-300">broken_image</span>
        <p className="text-sm text-gray-600">Không thể tải kết quả ảnh này.</p>
        <Link
          href={`/analysis/${caseId}/results/0`}
          className="text-sm text-primary underline underline-offset-2"
        >
          Quay lại ảnh đầu tiên
        </Link>
      </div>
    );
  }

  const activeDetections = imgData.detections.filter(d => !d.is_deleted);
  const caption = imgData.caption;
  const captionText = caption
    ? (caption.is_edited ? caption.edited_text : caption.ai_text) || ''
    : '';
  const imageUrl = toMediaUrl(imgData.original_path || imgData.annotated_path);

  const sharedReadOnly = imgData.case_permission === 'view';
  const resultReadOnly = !imgData.can_edit;

  return (
    <div className="space-y-4">
      {sharing && <ShareModal caseId={caseId} onClose={() => setSharing(false)} />}
      {savingToLibrary && (
        <SaveToLibraryModal
          kind="gingivitis"
          caseId={caseId}
          imageIndex={idx}
          hasAnnotated={Boolean(imgData.annotated_path)}
          defaultTitle={`Kết quả viêm lợi · Ca #${caseId} · Ảnh ${idx + 1}`}
          defaultConditionNote={captionText}
          onClose={() => setSavingToLibrary(false)}
        />
      )}

      {/* Backend là nguồn chân lý; banner giải thích rõ trạng thái chỉ xem cho patient. */}
      {resultReadOnly && (
        <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
          <span className="material-symbols-outlined text-[18px] shrink-0">visibility</span>
          {sharedReadOnly ? (
            <span>
              Ca này được chia sẻ với bạn ở chế độ <strong>chỉ xem</strong> — bạn không
              thể chỉnh sửa nhãn chẩn đoán.
            </span>
          ) : (
            <span>
              Kết quả của bạn đang ở chế độ <strong>chỉ xem</strong> — tài khoản bệnh
              nhân không thể sửa hộp phát hiện, điểm MGI hoặc mô tả.
            </span>
          )}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-2 flex items-center gap-2 flex-wrap">
        {/* Prev / counter / Next */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => router.push(`/analysis/${caseId}/results/${idx - 1}/`)}
            disabled={!hasPrev}
            title="Ảnh trước (←)"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
          <span className="text-sm font-medium text-gray-700 px-2 tabular-nums whitespace-nowrap">
            Ảnh {idx + 1}{total !== null ? ` / ${total}` : ''}
          </span>
          <button
            onClick={() => router.push(`/analysis/${caseId}/results/${idx + 1}/`)}
            disabled={!hasNext}
            title="Ảnh tiếp theo (→)"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
          </button>
        </div>

        <div className="h-5 w-px bg-gray-200 mx-1 shrink-0" />

        {/* Overlay toggles */}
        <div className="flex items-center gap-1.5">
          <ToggleBtn
            active={showBoxes}
            onClick={() => setShowBoxes(v => !v)}
            icon="crop_square"
            label="Hộp phát hiện"
          />
          <ToggleBtn
            active={showMasks}
            onClick={() => setShowMasks(v => !v)}
            icon="draw"
            label="Vùng răng"
          />
        </div>

        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Chỉ chủ sở hữu/admin được chia sẻ tiếp; mọi người đang xem hợp lệ có
              thể tạo một bản sao độc lập trong Kho dữ liệu của chính mình. */}
          {canShare && (
            <button
              onClick={() => setSharing(true)}
              className="
                flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors
              "
            >
              <span className="material-symbols-outlined text-[16px]">person_add</span>
              Chia sẻ cá nhân
            </button>
          )}
          {canSaveToLibrary && (
            <button
              onClick={() => setSavingToLibrary(true)}
              className="
                flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                border border-primary/30 bg-primary-50 text-primary hover:bg-primary/10 transition-colors
              "
            >
              <span className="material-symbols-outlined text-[16px]">inventory_2</span>
              Lưu vào Kho dữ liệu
            </button>
          )}
          {/* can_edit do backend tính (vai trò + quyền trên ca) — bệnh nhân và
              người được chia sẻ 'view' không thấy nút này. */}
          {imgData.can_edit && (
            <Link
              href={`/analysis/${caseId}/results/${idx}/edit`}
              className="
                flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors
              "
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
              Chỉnh sửa
            </Link>
          )}
          <button
            onClick={() =>
              window.open(`/api/cases/${caseId}/images/${idx}/export/`, '_blank')
            }
            className="
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
              bg-primary text-white hover:bg-primary-600 transition-colors shadow-sm
            "
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            Tải về
          </button>
        </div>
      </div>

      {/* ── Low-confidence warning ── */}
      {imgData.is_low_confidence && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <span className="material-symbols-outlined text-[20px] shrink-0 text-amber-500 mt-0.5">
            warning
          </span>
          <div>
            <p className="font-semibold">Độ tin cậy thấp</p>
            <p className="text-xs mt-0.5 text-amber-700">
              Hệ thống không đủ tin cậy để xác định vùng viêm trên ảnh này. Vui lòng
              chụp lại hoặc thực hiện khám lâm sàng trực tiếp.
            </p>
          </div>
        </div>
      )}

      {/* ── Two-column layout ── */}
      <div className="flex gap-5 items-start">
        {/* Canvas */}
        <div className="flex-1 min-w-0">
          <ResultsCanvas
            imageUrl={imageUrl}
            imgW={imgData.width || 1024}
            imgH={imgData.height || 768}
            detections={activeDetections}
            masks={imgData.masks}
            showBoxes={showBoxes}
            showMasks={showMasks}
            isLowConfidence={imgData.is_low_confidence}
          />
        </div>

        {/* Sidebar */}
        <div className="w-72 shrink-0 space-y-4">
          {/* Caption */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-serif font-semibold text-[13px] text-gray-900">
                Mô tả lâm sàng
              </h3>
              {caption?.is_edited && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                  Đã sửa
                </span>
              )}
            </div>
            <div className="p-4">
              {caption ? (
                <>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {caption.is_edited ? caption.edited_text : caption.ai_text}
                  </p>
                  {!caption.is_edited && (
                    <p className="text-[10px] text-gray-400 mt-2.5 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">smart_toy</span>
                      Tạo tự động bởi AI
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400 italic">
                  {imgData.is_low_confidence
                    ? 'Không có mô tả do độ tin cậy thấp.'
                    : 'Chưa có mô tả.'}
                </p>
              )}
            </div>
          </div>

          {/* Detection list */}
          {activeDetections.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-serif font-semibold text-[13px] text-gray-900">
                  Phát hiện viêm lợi
                </h3>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                  {activeDetections.length}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {activeDetections
                  .slice()
                  .sort(
                    (a, b) =>
                      FDI_ORDER.indexOf(a.tooth_fdi) - FDI_ORDER.indexOf(b.tooth_fdi),
                  )
                  .map(det => (
                    <div key={det.id} className="flex items-center gap-2.5 px-4 py-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: MGI_COLORS[det.mgi_level] }}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-gray-700">
                          Răng {det.tooth_fdi}
                        </span>
                        <span className="text-[11px] text-gray-500 ml-1.5">
                          MGI {det.mgi_level} · {MGI_LABELS[det.mgi_level]}
                        </span>
                      </div>
                      {det.source === 'doctor' && (
                        <span className="text-[9px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded font-semibold shrink-0">
                          BS
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            !imgData.is_low_confidence && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
                <span className="material-symbols-outlined text-3xl text-gray-300">
                  sentiment_very_satisfied
                </span>
                <p className="text-xs text-gray-500 mt-1.5">Không phát hiện viêm lợi</p>
              </div>
            )
          )}

          {/* MGI legend */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-serif font-semibold text-[13px] text-gray-900">
                Thang MGI
              </h3>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              {([0, 1, 2, 3, 4] as const).map(level => (
                <div key={level} className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: MGI_COLORS[level] }}
                  />
                  <span className="text-[11px] text-gray-600">
                    <span className="font-semibold">{level}</span> — {MGI_LABELS[level]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Toggle button ─────────────────────────────────────────────── */

function ToggleBtn({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
        border transition-colors duration-100
        ${active
          ? 'bg-primary/10 border-primary/30 text-primary'
          : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}
      `}
    >
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      {label}
    </button>
  );
}
