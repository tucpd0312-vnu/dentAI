'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import SliceViewer from '@/components/viewer/SliceViewer';
import {
  ASSET_STATUS_CLASS,
  ASSET_STATUS_LABEL,
  DATA_TYPE_ICON,
  DIAGNOSIS_ROUTES,
  diagnosisUrl,
  deleteAsset,
  downloadAsset,
  fetchAsset,
  fetchAssetPreviewBlob,
  fetchAssetStatus,
  fetchCategories,
  updateAsset,
  type DataAssetDetail,
  type DataCategory,
} from '@/lib/library';
import { formatFileSize } from '@/lib/scans';
import { apiErrorMessage } from '@/lib/users';

const POLL_MS = 2000;

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputCls =
  'w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm transition-colors ' +
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [asset, setAsset] = useState<DataAssetDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [editing, setEditing] = useState(false);
  const [categories, setCategories] = useState<DataCategory[]>([]);
  const [draft, setDraft] = useState({ title: '', category: 0, condition_note: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setAsset(await fetchAsset(id));
    } catch {
      // 404 với mục ngoài phạm vi truy cập — cố ý không phân biệt "không tồn tại" và
      // "không có quyền", xem apps/library/views.py.
      setLoadError(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Không có route /library/{id}/processing riêng — trang tự poll và cập nhật inline,
  // cùng khuôn trang chi tiết phim CBCT.
  useEffect(() => {
    if (!asset || (asset.status !== 'processing' && asset.status !== 'uploading')) return;
    const t = setInterval(async () => {
      try {
        const st = await fetchAssetStatus(id);
        if (st.status !== asset.status) void load();
      } catch {
        /* mạng lỗi tạm thời — thử lại ở lần poll sau */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [asset, id, load]);

  async function handleDownload() {
    if (!asset) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadAsset(asset);
    } catch (err) {
      setError(apiErrorMessage(err, 'Không tải xuống được tệp này.'));
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    if (!asset) return;
    if (
      !window.confirm(
        `Xoá "${asset.title}" khỏi kho dữ liệu? Có thể khôi phục qua Django admin nếu cần.`,
      )
    ) {
      return;
    }
    try {
      await deleteAsset(asset.id);
      router.push('/library/');
    } catch (err) {
      setError(apiErrorMessage(err, 'Không xoá được mục này.'));
    }
  }

  function startEditing() {
    if (!asset) return;
    setDraft({
      title: asset.title,
      category: asset.category,
      condition_note: asset.condition_note ?? '',
    });
    if (categories.length === 0) {
      fetchCategories()
        .then(setCategories)
        .catch(() => setCategories([]));
    }
    setEditing(true);
  }

  async function handleSave() {
    if (!asset) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAsset(asset.id, {
        title: draft.title.trim(),
        category: draft.category,
        // Mô tả tình trạng thuộc khối PHI — chỉ gửi khi người này thực sự đọc được nó,
        // để không vô tình ghi đè bằng chuỗi rỗng.
        ...(asset.can_see_patient_info ? { condition_note: draft.condition_note } : {}),
      });
      setAsset(updated);
      setEditing(false);
    } catch (err) {
      setError(apiErrorMessage(err, 'Không lưu được thay đổi.'));
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <span className="material-symbols-outlined text-5xl text-red-300">folder_off</span>
        <p className="text-sm text-gray-600">Không tìm thấy dữ liệu này, hoặc bạn không có quyền xem.</p>
        <Link href="/library/" className="text-sm text-primary underline underline-offset-2">
          Quay lại kho dữ liệu
        </Link>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-400">
        <span className="material-symbols-outlined animate-spin text-5xl">autorenew</span>
        <p className="text-sm">Đang tải…</p>
      </div>
    );
  }

  const isImageLike = asset.preview_count > 0;
  const canDownload = asset.status === 'ready';

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/library/"
            className="mb-1 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Kho dữ liệu
          </Link>
          <h1 className="truncate font-serif text-xl font-semibold text-gray-900">
            {asset.title}
          </h1>
          <p className="truncate font-mono text-xs text-gray-400">{asset.original_filename}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${ASSET_STATUS_CLASS[asset.status]}`}
        >
          {(asset.status === 'processing' || asset.status === 'uploading') && (
            <span className="material-symbols-outlined animate-spin text-[13px]">autorenew</span>
          )}
          {ASSET_STATUS_LABEL[asset.status]}
        </span>
      </div>

      {asset.status === 'failed' && asset.error_message && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="material-symbols-outlined mt-0.5 shrink-0 text-[20px] text-red-500">
            error
          </span>
          <div>
            <p className="font-semibold">Xử lý thất bại</p>
            <p className="mt-0.5 text-xs text-red-700">{asset.error_message}</p>
          </div>
        </div>
      )}
      {(asset.status === 'processing' || asset.status === 'uploading') && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span className="material-symbols-outlined animate-spin text-[20px]">autorenew</span>
          Đang xử lý trên máy chủ — khử thông tin định danh và sinh ảnh xem trước. Trang sẽ
          tự cập nhật khi xong.
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px]">error</span>
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-5">
        {/* ── Cột trái: xem dữ liệu ── */}
        <div className="min-w-0 flex-1 basis-96">
          {isImageLike ? (
            <SliceViewer
              count={asset.preview_count}
              fetchBlob={index => fetchAssetPreviewBlob(asset.id, index)}
              label={asset.preview_count > 1 ? 'Lát cắt' : 'Ảnh'}
            />
          ) : (
            <div className="flex aspect-square flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-gray-50">
              <span className="material-symbols-outlined text-6xl text-gray-300">
                {DATA_TYPE_ICON[asset.data_type]}
              </span>
              <p className="max-w-xs text-center text-sm text-gray-500">
                {asset.status === 'ready'
                  ? 'Loại dữ liệu này không có ảnh xem trước. Tải tệp xuống để mở bằng phần mềm phù hợp.'
                  : 'Chưa có ảnh xem trước.'}
              </p>
              {canDownload && (
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <span
                    className={`material-symbols-outlined text-[18px] ${downloading ? 'animate-spin' : ''}`}
                  >
                    {downloading ? 'autorenew' : 'download'}
                  </span>
                  Tải tệp xuống
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Cột phải ── */}
        <div className="w-full shrink-0 space-y-4 sm:w-80">
          <div className="space-y-2">
            {asset.diagnosis_target && (
              <Link
                href={diagnosisUrl(asset)!}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600"
              >
                <span className="material-symbols-outlined text-[18px]">{asset.diagnosis_target === 'canine3d' ? 'view_in_ar' : 'oral_disease'}</span>
                {DIAGNOSIS_ROUTES[asset.diagnosis_target].label}
              </Link>
            )}
            <button
              onClick={handleDownload}
              disabled={!canDownload || downloading}
              title={canDownload ? undefined : 'Chưa xử lý xong, chưa tải xuống được'}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span
                className={`material-symbols-outlined text-[18px] ${downloading ? 'animate-spin' : ''}`}
              >
                {downloading ? 'autorenew' : 'download'}
              </span>
              {downloading ? 'Đang tải…' : 'Tải dữ liệu xuống'}
            </button>
            {asset.can_edit && !editing && (
              <button
                onClick={startEditing}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
                Sửa thông tin
              </button>
            )}
            {(asset.permission === 'owner' || asset.permission === 'admin') && (
              <button
                onClick={handleDelete}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                Xoá khỏi kho
              </button>
            )}
          </div>

          {/* Thông tin bệnh nhân — vắng mặt hoàn toàn với vai trò không được xem PHI:
              backend cắt field, frontend không có gì để hiện. */}
          {asset.can_see_patient_info && (
            <Card title="Thông tin bệnh nhân">
              {asset.patient ? (
                <>
                  <InfoRow label="Họ tên" value={asset.patient.name} />
                  <InfoRow label="Mã bệnh nhân" value={asset.patient.patient_code} />
                  <InfoRow
                    label="Tuổi"
                    value={
                      asset.patient.age !== null
                        ? `${asset.patient.age} (sinh ${asset.patient.birth_year})`
                        : '—'
                    }
                  />
                  <InfoRow label="Giới tính" value={asset.patient.gender_display || '—'} />
                </>
              ) : (
                <p className="text-xs text-gray-400">
                  Mục dữ liệu này không gắn với bệnh nhân cụ thể nào.
                </p>
              )}

              <div className="mt-2 border-t border-gray-100 pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Mô tả tình trạng
                </p>
                {editing ? (
                  <textarea
                    value={draft.condition_note}
                    onChange={e => setDraft(d => ({ ...d, condition_note: e.target.value }))}
                    rows={4}
                    className={`${inputCls} mt-1 resize-none`}
                  />
                ) : (
                  <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-gray-600">
                    {asset.condition_note || <span className="text-gray-300">Chưa có mô tả.</span>}
                  </p>
                )}
              </div>
            </Card>
          )}

          <Card title="Phân loại & loại dữ liệu">
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-500">
                    Tiêu đề
                  </label>
                  <input
                    value={draft.title}
                    onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-500">
                    Phân loại
                  </label>
                  <select
                    value={draft.category}
                    onChange={e => setDraft(d => ({ ...d, category: Number(e.target.value) }))}
                    className={inputCls}
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSave}
                    disabled={saving || !draft.title.trim()}
                    className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-40"
                  >
                    {saving ? 'Đang lưu…' : 'Lưu'}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Huỷ
                  </button>
                </div>
              </div>
            ) : (
              <>
                <InfoRow label="Phân loại" value={asset.category_name} />
                <InfoRow label="Loại dữ liệu" value={asset.data_type_display} />
                <InfoRow
                  label="Dung lượng"
                  value={asset.file_size ? formatFileSize(asset.file_size) : '—'}
                />
                <InfoRow
                  label="Ẩn danh"
                  value={asset.is_anonymized ? 'Đã khử thông tin cá nhân' : 'Chưa xử lý'}
                />
                <InfoRow
                  label="Người tải lên"
                  value={asset.uploaded_by?.full_name || asset.uploaded_by?.username || '—'}
                />
                <InfoRow label="Ngày tải lên" value={fmtDateTime(asset.created_at)} />
              </>
            )}
          </Card>

          {asset.source && (
            <Card title="Nguồn dữ liệu">
              {asset.source.kind === 'scan' ? (
                <Link
                  href={`/scans/${asset.source.id}/`}
                  className="inline-flex items-center gap-1.5 text-xs text-primary underline underline-offset-2"
                >
                  <span className="material-symbols-outlined text-[16px]">radiology</span>
                  Phim CBCT #{asset.source.id}
                </Link>
              ) : (
                <Link
                  href={`/analysis/${asset.source.id}/results/${asset.source.image_index ?? 0}/`}
                  className="inline-flex items-center gap-1.5 text-xs text-primary underline underline-offset-2"
                >
                  <span className="material-symbols-outlined text-[16px]">oral_disease</span>
                  Ca chẩn đoán #{asset.source.id}
                </Link>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Khối dựng cột phải ────────────────────────────────────────── */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="font-serif text-[13px] font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-xs">
      <span className="shrink-0 text-gray-400">{label}</span>
      <span className="text-right font-medium text-gray-700">{value}</span>
    </div>
  );
}
