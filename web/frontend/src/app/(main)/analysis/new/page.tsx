'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPTED_ATTR = 'image/jpeg,image/png,image/webp';

interface UploadedFile {
  file: File;
  preview: string;
}

export default function NewAnalysisPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ name: '', patient_code: '', notes: '' });
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback((incoming: File[]) => {
    const valid = incoming.filter(f => ACCEPTED_TYPES.includes(f.type));
    const skipped = incoming.length - valid.length;
    if (skipped > 0) {
      setError(`${skipped} file bị bỏ qua (chỉ chấp nhận JPG, PNG, WebP).`);
    } else {
      setError(null);
    }
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.file.name));
      const toAdd = valid
        .filter(f => !existing.has(f.name))
        .map(f => ({ file: f, preview: URL.createObjectURL(f) }));
      return [...prev, ...toAdd];
    });
  }, []);

  const removeFile = (idx: number) => {
    setFiles(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || files.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('patient_name', form.name.trim());
      if (form.patient_code.trim()) fd.append('patient_code', form.patient_code.trim());
      if (form.notes.trim()) fd.append('notes', form.notes.trim());
      files.forEach(f => fd.append('images', f.file));
      const { data } = await api.post('/cases/', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      files.forEach(f => URL.revokeObjectURL(f.preview));
      router.push(`/analysis/${data.id}/processing`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || 'Gửi yêu cầu thất bại. Vui lòng thử lại.');
      setSubmitting(false);
    }
  };

  const canSubmit = form.name.trim().length > 0 && files.length > 0 && !submitting;

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-5">
      {/* ── Patient info ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <h2 className="font-serif font-semibold text-[15px] text-gray-900">
            Thông tin bệnh nhân
          </h2>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
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
                w-full px-3 py-2 text-sm border border-gray-300 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                disabled:bg-gray-50 disabled:text-gray-400
                transition-colors
              "
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Mã bệnh nhân
            </label>
            <input
              type="text"
              value={form.patient_code}
              onChange={e => setForm(f => ({ ...f, patient_code: e.target.value }))}
              placeholder="BN-001 (tuỳ chọn)"
              disabled={submitting}
              className="
                w-full px-3 py-2 text-sm border border-gray-300 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                disabled:bg-gray-50 disabled:text-gray-400
                transition-colors
              "
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Ghi chú lâm sàng
            </label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Thông tin thêm về ca khám (tuỳ chọn)"
              rows={2}
              disabled={submitting}
              className="
                w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none
                focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                disabled:bg-gray-50 disabled:text-gray-400
                transition-colors
              "
            />
          </div>
        </div>
      </div>

      {/* ── Upload ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-serif font-semibold text-[15px] text-gray-900">
            Ảnh đầu vào
          </h2>
          {files.length > 0 && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full font-medium">
              {files.length} ảnh
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={() => setDragging(false)}
            onClick={() => !submitting && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && !submitting && inputRef.current?.click()}
            className={`
              flex flex-col items-center justify-center gap-2.5
              min-h-[148px] rounded-xl border-2 border-dashed
              cursor-pointer select-none transition-colors duration-150
              ${submitting ? 'opacity-50 cursor-not-allowed' : ''}
              ${dragging
                ? 'border-primary bg-primary/5'
                : 'border-gray-300 hover:border-primary/60 hover:bg-gray-50'}
            `}
          >
            <span
              className={`material-symbols-outlined text-5xl transition-colors ${
                dragging ? 'text-primary' : 'text-gray-300'
              }`}
            >
              cloud_upload
            </span>
            <p className="text-sm text-gray-600">
              Kéo thả ảnh vào đây hoặc{' '}
              <span className="text-primary font-medium underline underline-offset-2">
                chọn từ máy tính
              </span>
            </p>
            <p className="text-xs text-gray-400">JPG · PNG · WebP — nhiều ảnh</p>
          </div>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_ATTR}
            onChange={onInputChange}
            className="hidden"
          />

          {/* Thumbnail grid */}
          {files.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {files.map((f, idx) => (
                <div key={f.file.name} className="relative group aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.preview}
                    alt={f.file.name}
                    className="w-full h-full object-cover rounded-lg border border-gray-200"
                  />
                  {/* filename tooltip on hover */}
                  <div
                    className="
                      absolute inset-x-0 bottom-0 bg-black/55 text-white text-[9px]
                      leading-tight px-1 py-0.5 rounded-b-lg truncate
                      opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none
                    "
                  >
                    {f.file.name}
                  </div>
                  {/* order badge */}
                  <div
                    className="
                      absolute top-1 left-1 w-4 h-4 rounded-full bg-primary
                      text-white text-[9px] font-semibold flex items-center justify-center
                      shadow pointer-events-none
                    "
                  >
                    {idx + 1}
                  </div>
                  {/* remove button */}
                  {!submitting && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        removeFile(idx);
                      }}
                      title="Xoá ảnh này"
                      className="
                        absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full
                        bg-gray-700 text-white flex items-center justify-center shadow
                        opacity-0 group-hover:opacity-100 transition-opacity
                        hover:bg-red-500
                      "
                    >
                      <span className="material-symbols-outlined text-[12px]">close</span>
                    </button>
                  )}
                </div>
              ))}

              {/* Add more tile */}
              {!submitting && (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  title="Thêm ảnh"
                  className="
                    aspect-square rounded-lg border-2 border-dashed border-gray-300
                    flex flex-col items-center justify-center gap-1
                    text-gray-400 hover:text-primary hover:border-primary/60 hover:bg-gray-50
                    transition-colors
                  "
                >
                  <span className="material-symbols-outlined text-[22px]">add</span>
                  <span className="text-[9px] font-medium">Thêm</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* ── Submit ── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {files.length === 0
            ? 'Chưa có ảnh nào được chọn'
            : `${files.length} ảnh sẵn sàng phân tích`}
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="
            flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium
            bg-primary text-white shadow-sm
            hover:bg-primary-600 active:bg-primary-700
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors duration-150
          "
        >
          {submitting ? (
            <>
              <span className="material-symbols-outlined text-[18px] animate-spin">
                autorenew
              </span>
              Đang gửi…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
              Bắt đầu phân tích
            </>
          )}
        </button>
      </div>
    </form>
  );
}
