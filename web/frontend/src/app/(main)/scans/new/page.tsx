'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useRequireRole } from '@/lib/useRequireRole';
import { formatFileSize, uploadScan } from '@/lib/scans';

export default function NewScanPage() {
  const { allowed, checking } = useRequireRole(['admin', 'doctor']);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  // Phiên chunked upload dở từ lần submit lỗi trước — CÙNG file thì thử lại chỉ gửi
  // nốt chunk còn thiếu (uploadScan.resumeScanId), không tạo Scan mới mỗi lần bấm lại.
  const resumeScanIdRef = useRef<number | undefined>(undefined);

  const [form, setForm] = useState({ name: '', patient_code: '', note: '' });
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pickFile = useCallback((incoming: File[]) => {
    const picked = incoming[0];
    if (!picked) return;
    if (!picked.name.toLowerCase().endsWith('.zip')) {
      setError('Chỉ chấp nhận file .zip chứa DICOM.');
      return;
    }
    setError(null);
    resumeScanIdRef.current = undefined;
    setFile(picked);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      pickFile(Array.from(e.dataTransfer.files));
    },
    [pickFile],
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) pickFile(Array.from(e.target.files));
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !file || submitting) return;
    setSubmitting(true);
    setProgress(0);
    setError(null);
    try {
      const data = await uploadScan(
        {
          patientName: form.name.trim(),
          patientCode: form.patient_code.trim() || undefined,
          note: form.note.trim() || undefined,
          file,
        },
        setProgress,
        resumeScanIdRef.current,
      );
      router.push(`/scans/${data.id}/`);
    } catch (err: unknown) {
      const scanId = (err as { scanId?: number })?.scanId;
      if (scanId) resumeScanIdRef.current = scanId;
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(
        msg ||
          (scanId
            ? 'Tải phim thất bại. Bấm "Tải phim lên" để thử lại — sẽ tiếp tục từ chỗ dang dở, không tải lại từ đầu.'
            : 'Tải phim thất bại. Vui lòng thử lại.'),
      );
      setSubmitting(false);
    }
  };

  if (checking || !allowed) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-gray-300">
          autorenew
        </span>
      </div>
    );
  }

  const canSubmit = form.name.trim().length > 0 && !!file && !submitting;

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-5">
      {/* ── Patient info ── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3.5">
          <h2 className="font-serif text-[15px] font-semibold text-gray-900">
            Thông tin bệnh nhân
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              Tên bệnh nhân <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nguyễn Văn A"
              required
              disabled={submitting}
              className="
                w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30
                disabled:bg-gray-50 disabled:text-gray-400
              "
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Mã bệnh nhân</label>
            <input
              type="text"
              value={form.patient_code}
              onChange={e => setForm(f => ({ ...f, patient_code: e.target.value }))}
              placeholder="BN-001 (tuỳ chọn — trùng mã ca viêm lợi sẽ gộp chung bệnh nhân)"
              disabled={submitting}
              className="
                w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30
                disabled:bg-gray-50 disabled:text-gray-400
              "
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Ghi chú</label>
            <textarea
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Ghi chú về lần chụp này (tuỳ chọn)"
              rows={2}
              disabled={submitting}
              className="
                w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm
                transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30
                disabled:bg-gray-50 disabled:text-gray-400
              "
            />
          </div>
        </div>
      </div>

      {/* ── Upload ── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3.5">
          <h2 className="font-serif text-[15px] font-semibold text-gray-900">Phim CBCT (DICOM)</h2>
        </div>
        <div className="space-y-4 p-5">
          {!file ? (
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={() => setDragging(false)}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
              className={`
                flex min-h-[148px] cursor-pointer select-none flex-col items-center justify-center
                gap-2.5 rounded-xl border-2 border-dashed transition-colors duration-150
                ${dragging ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary/60 hover:bg-gray-50'}
              `}
            >
              <span
                className={`material-symbols-outlined text-5xl transition-colors ${dragging ? 'text-primary' : 'text-gray-300'}`}
              >
                folder_zip
              </span>
              <p className="text-sm text-gray-600">
                Kéo thả file .zip vào đây hoặc{' '}
                <span className="font-medium text-primary underline underline-offset-2">
                  chọn từ máy tính
                </span>
              </p>
              <p className="text-xs text-gray-400">
                Một file .zip chứa toàn bộ lát cắt DICOM của một lần chụp
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <span className="material-symbols-outlined shrink-0 text-3xl text-primary">
                folder_zip
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">{file.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
              </div>
              {!submitting && (
                <button
                  type="button"
                  onClick={() => {
                    resumeScanIdRef.current = undefined;
                    setFile(null);
                  }}
                  title="Chọn file khác"
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              )}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            onChange={onInputChange}
            className="hidden"
          />

          {/* Thanh tiến trình upload — quan trọng với CBCT thật ~500MB */}
          {submitting && (
            <div className="space-y-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-right text-xs text-gray-500 tabular-nums">
                {progress < 100 ? `Đang tải lên… ${progress}%` : 'Đang xử lý trên máy chủ…'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="material-symbols-outlined shrink-0 text-[18px]">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* ── Submit ── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {file ? 'Sẵn sàng tải lên' : 'Chưa chọn file'}
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="
            flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white
            shadow-sm transition-colors duration-150 hover:bg-primary-600 active:bg-primary-700
            disabled:cursor-not-allowed disabled:opacity-40
          "
        >
          {submitting ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[18px]">autorenew</span>
              Đang gửi…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              Tải phim lên
            </>
          )}
        </button>
      </div>
    </form>
  );
}
