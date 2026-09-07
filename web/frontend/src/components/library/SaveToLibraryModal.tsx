'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  importGingivitisToLibrary,
  importScanToLibrary,
  type DataAssetDetail,
} from '@/lib/library';
import { apiErrorMessage } from '@/lib/users';

type SaveToLibraryModalProps = {
  sourceOwned: boolean;
  originalAvailable?: boolean;
  annotationReason?: string;
  onClose: () => void;
  defaultTitle: string;
  defaultConditionNote?: string;
  patientName?: string;
} & (
  | { kind: 'scan'; scanId: number | string }
  | {
      kind: 'gingivitis';
      caseId: number | string;
      imageIndex: number;
      hasAnnotated: boolean;
    }
);

export default function SaveToLibraryModal(props: SaveToLibraryModalProps) {
  const [mode, setMode] = useState<'copy' | 'linked'>(props.sourceOwned ? 'copy' : 'linked');
  const [title, setTitle] = useState(props.defaultTitle);
  const [conditionNote, setConditionNote] = useState(props.defaultConditionNote ?? '');
  const [variant, setVariant] = useState<'original' | 'annotated'>(
    props.kind === 'gingivitis' && props.hasAnnotated ? 'annotated' : 'original',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asset, setAsset] = useState<DataAssetDetail | null>(null);
  const [created, setCreated] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) props.onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props, saving]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = props.kind === 'scan'
        ? await importScanToLibrary(props.scanId, { title, conditionNote, mode })
        : await importGingivitisToLibrary(props.caseId, props.imageIndex, {
            title,
            conditionNote,
            variant,
            mode,
          });
      setAsset(response.asset);
      setCreated(response.created);
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thể lưu dữ liệu này vào Kho dữ liệu.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="font-serif text-base font-semibold text-gray-900">
              Lưu vào Kho dữ liệu
            </h2>
            {props.patientName && (
              <p className="mt-0.5 text-xs text-gray-500">
                Bệnh nhân: {props.patientName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            disabled={saving}
            aria-label="Đóng"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {asset ? (
          <div className="space-y-4 p-5">
            <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <span className="material-symbols-outlined mt-0.5 text-[20px]">check_circle</span>
              <div>
                <p className="font-semibold">
                  {created ? (asset.provenance.mode === 'linked' ? 'Đã thêm liên kết vào kho' : 'Đã lưu vào kho của bạn') : 'Đã mở phiên bản có trong kho'}
                </p>
                {asset.source_variant && (
                  <p className="mt-0.5 text-xs font-medium">
                    Bản ảnh: {asset.source_variant === 'original' ? 'Ảnh gốc' : 'Ảnh có chú thích'}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-green-700">
                  {created
                    ? (asset.provenance.mode === 'linked'
                      ? 'Tư liệu giữ chủ sở hữu gốc và quyền truy cập theo nguồn được chia sẻ.'
                      : 'Bản sao độc lập nằm trong “Của tôi”, kể cả khi chia sẻ nguồn bị thu hồi.')
                    : 'Đúng bản dữ liệu này đã có trong kho. Hệ thống giữ nguyên tệp và thông tin đã lưu, không tạo trùng hoặc ghi đè.'}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={props.onClose}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Đóng
              </button>
              <Link
                href={`/library/${asset.id}/`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
              >
                <span className="material-symbols-outlined text-[17px]">open_in_new</span>
                Xem trong kho
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 p-5">
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-blue-800">
              {mode === 'linked'
                ? 'Giữ chủ sở hữu gốc. Sinh viên/bệnh nhân thấy tư liệu ở “Được chia sẻ”; admin/bác sĩ thấy ở “Của người khác”. Quyền từ nguồn bị thu hồi thì liên kết cũng hết quyền.'
                : 'Lưu bản sao độc lập vào “Của tôi”. Bạn, quản trị viên và bác sĩ/giảng viên có thể xem bản sao này.'}
            </div>

            {!props.sourceOwned && <label className="block text-xs font-medium text-gray-600">
              Cách lưu
              <select aria-label="Cách lưu vào kho" value={mode} disabled={saving}
                onChange={e => setMode(e.target.value as 'copy' | 'linked')}
                className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="linked">Giữ liên kết với dữ liệu được chia sẻ</option>
                <option value="copy">Lưu bản sao vào Của tôi</option>
              </select>
            </label>}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <span className="material-symbols-outlined mt-0.5 text-[16px]">error</span>
                {error}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">
                Tên dữ liệu
              </label>
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                maxLength={255}
                placeholder="Để trống để dùng tên tự động"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {props.kind === 'gingivitis' && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">
                  Bản ảnh lưu vào kho
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={saving || props.originalAvailable === false}
                    aria-pressed={variant === 'original'}
                    onClick={() => setVariant('original')}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      variant === 'original'
                        ? 'border-primary bg-primary-50 text-primary'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Ảnh gốc
                  </button>
                  <button
                    type="button"
                    disabled={saving || !props.hasAnnotated}
                    aria-pressed={variant === 'annotated'}
                    onClick={() => setVariant('annotated')}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      variant === 'annotated'
                        ? 'border-primary bg-primary-50 text-primary'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    Ảnh có chú thích
                  </button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-gray-500">
                  Ảnh gốc và ảnh chú thích là hai bản riêng. Nội dung không đổi sẽ mở bản đã lưu;
                  chú thích thay đổi sẽ tạo phiên bản mới. Nên dùng ảnh gốc để chẩn đoán lại.
                </p>
                {!props.hasAnnotated && <p className="mt-1 text-xs text-amber-700">{props.annotationReason || 'Chưa có bản chú thích để lưu.'}</p>}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">
                Mô tả tình trạng
              </label>
              <textarea
                value={conditionNote}
                onChange={event => setConditionNote(event.target.value)}
                rows={3}
                placeholder="Mô tả lâm sàng hoặc ghi chú cho dữ liệu"
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={props.onClose}
                disabled={saving}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving || (props.kind === 'gingivitis' && (variant === 'annotated' ? !props.hasAnnotated : props.originalAvailable === false))}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[17px] ${saving ? 'animate-spin' : ''}`}>
                  {saving ? 'autorenew' : 'inventory_2'}
                </span>
                {saving ? 'Đang lưu…' : mode === 'linked' ? 'Thêm liên kết vào kho' : 'Lưu bản sao / phiên bản mới'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
