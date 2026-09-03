'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useAuth } from '@/components/providers/AuthProvider';
import {
  createCategory,
  DATA_TYPE_EXTENSIONS,
  DATA_TYPE_LABEL,
  fetchCategories,
  fileExtension,
  GENDER_LABEL,
  MAX_ASSET_SIZE,
  uploadAsset,
  type DataCategory,
  type DataType,
  type Gender,
} from '@/lib/library';
import { formatFileSize } from '@/lib/scans';
import { apiErrorMessage } from '@/lib/users';

/** Giá trị đặc biệt của ô Phân loại — chọn nó thì hiện ô nhập tên mới. */
const NEW_CATEGORY = 'new';

const CURRENT_YEAR = new Date().getFullYear();

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors ' +
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 ' +
  'disabled:bg-gray-50 disabled:text-gray-400';

/** Bỏ dấu + hạ chữ thường + gộp khoảng trắng — dùng để dò danh mục trùng ý nghĩa. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

export default function NewAssetPage() {
  const router = useRouter();
  const { hasPatientScope, loading: authLoading } = useAuth();

  const inputRef = useRef<HTMLInputElement>(null);
  // Phiên upload dở từ lần submit lỗi trước — bấm lại chỉ gửi nốt chunk còn thiếu,
  // không tạo mục mới. Sao đúng `resumeScanIdRef` của /scans/new.
  const resumeAssetIdRef = useRef<number | undefined>(undefined);

  const [categories, setCategories] = useState<DataCategory[]>([]);
  const [categoryChoice, setCategoryChoice] = useState<string>('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [dataType, setDataType] = useState<DataType | ''>('');
  const [dataTypeOther, setDataTypeOther] = useState('');
  const [title, setTitle] = useState('');

  const [showPatient, setShowPatient] = useState(false);
  const [patient, setPatient] = useState({
    name: '',
    code: '',
    age: '',
    gender: '' as Gender | '',
    condition: '',
  });

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(err => setError(apiErrorMessage(err, 'Không tải được danh sách phân loại.')));
  }, []);

  /** Danh mục đã có mà tên mới gõ vào rất giống — chặn "Viêm lợi"/"viem loi" từ sớm. */
  const similarCategory = useMemo(() => {
    const typed = normalize(newCategoryName);
    if (categoryChoice !== NEW_CATEGORY || typed.length < 2) return null;
    return (
      categories.find(c => {
        const known = normalize(c.name);
        return known === typed || known.includes(typed) || typed.includes(known);
      }) ?? null
    );
  }, [categoryChoice, newCategoryName, categories]);

  const acceptedExtensions = dataType ? DATA_TYPE_EXTENSIONS[dataType] : [];

  const pickFile = useCallback(
    (incoming: File[]) => {
      const picked = incoming[0];
      if (!picked) return;
      if (!dataType) {
        setError('Hãy chọn loại dữ liệu trước khi chọn tệp.');
        return;
      }
      const ext = fileExtension(picked);
      if (!DATA_TYPE_EXTENSIONS[dataType].includes(ext)) {
        setError(
          `"${DATA_TYPE_LABEL[dataType]}" chỉ nhận tệp ${DATA_TYPE_EXTENSIONS[dataType].join(', ')} ` +
            `— tệp bạn chọn có đuôi ${ext || '(không có)'}.`,
        );
        return;
      }
      if (picked.size > MAX_ASSET_SIZE) {
        setError(`Tệp vượt quá giới hạn ${formatFileSize(MAX_ASSET_SIZE)} cho mỗi mục dữ liệu.`);
        return;
      }
      setError(null);
      resumeAssetIdRef.current = undefined;
      setFile(picked);
      // Điền sẵn tiêu đề bằng tên tệp (bỏ đuôi) — người dùng sửa lại được.
      setTitle(prev => prev || picked.name.replace(/\.[^.]+$/, ''));
    },
    [dataType],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      pickFile(Array.from(e.dataTransfer.files));
    },
    [pickFile],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !file || !dataType) return;

    setSubmitting(true);
    setProgress(0);
    setError(null);
    try {
      // Danh mục mới phải tồn tại trước khi khởi tạo upload. Backend trả về danh mục
      // ĐÃ CÓ nếu trùng tên (không phân biệt hoa thường), nên không sinh bản ghi rác.
      let categoryId: number;
      if (categoryChoice === NEW_CATEGORY) {
        const created = await createCategory(newCategoryName.trim());
        categoryId = created.id;
      } else {
        categoryId = Number(categoryChoice);
      }

      const age = patient.age.trim() ? Number(patient.age) : undefined;
      const data = await uploadAsset(
        {
          title: title.trim(),
          categoryId,
          dataType,
          dataTypeOther: dataTypeOther.trim() || undefined,
          patientName: patient.name.trim() || undefined,
          patientCode: hasPatientScope ? undefined : patient.code.trim() || undefined,
          // Hệ thống lưu NĂM SINH, không lưu tuổi — quy đổi ngay tại đây.
          birthYear: age ? CURRENT_YEAR - age : undefined,
          gender: patient.gender,
          conditionNote: patient.condition.trim() || undefined,
          file,
        },
        setProgress,
        resumeAssetIdRef.current,
      );
      router.push(`/library/${data.id}/`);
    } catch (err: unknown) {
      const assetId = (err as { assetId?: number })?.assetId;
      if (assetId) resumeAssetIdRef.current = assetId;
      setError(
        apiErrorMessage(
          err,
          assetId
            ? 'Tải lên thất bại. Bấm "Tải dữ liệu lên" để thử lại — sẽ tiếp tục từ chỗ dang dở, không tải lại từ đầu.'
            : 'Tải dữ liệu lên thất bại. Vui lòng thử lại.',
        ),
      );
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-gray-300">
          autorenew
        </span>
      </div>
    );
  }

  const categoryReady =
    categoryChoice === NEW_CATEGORY ? newCategoryName.trim().length >= 2 : !!categoryChoice;
  const dataTypeReady = dataType && (dataType !== 'other' || dataTypeOther.trim().length > 0);
  const canSubmit = !!file && !!title.trim() && categoryReady && !!dataTypeReady && !submitting;

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/library/"
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        <span className="material-symbols-outlined text-[14px]">arrow_back</span>
        Kho dữ liệu
      </Link>

      {/* ── Khối 1: thông tin bệnh nhân (mọi vai trò, tuỳ chọn) ── */}
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => setShowPatient(v => !v)}
          aria-expanded={showPatient}
          className="flex w-full items-center gap-2 border-b border-gray-100 px-5 py-3.5 text-left"
        >
          <span className="material-symbols-outlined text-[18px] text-gray-400">
            personal_injury
          </span>
          <span className="font-serif text-[15px] font-semibold text-gray-900">
            Thông tin bệnh nhân
          </span>
          <span className="text-xs font-normal text-gray-400">(tuỳ chọn)</span>
          <span className="material-symbols-outlined ml-auto text-[18px] text-gray-400">
            {showPatient ? 'expand_less' : 'expand_more'}
          </span>
        </button>

        {showPatient && (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">
                Tên bệnh nhân
              </label>
              <input
                type="text"
                value={patient.name}
                onChange={e => setPatient(p => ({ ...p, name: e.target.value }))}
                placeholder="Nguyễn Văn A"
                disabled={submitting}
                className={inputCls}
              />
            </div>
            {!hasPatientScope && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">
                  Mã bệnh nhân
                </label>
                <input
                  type="text"
                  value={patient.code}
                  onChange={e => setPatient(p => ({ ...p, code: e.target.value }))}
                  placeholder="Để trống sẽ tự sinh mã LIB-XXXXXXXX"
                  disabled={submitting}
                  className={inputCls}
                />
              </div>
            )}
            <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Tuổi</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={patient.age}
                  onChange={e => setPatient(p => ({ ...p, age: e.target.value }))}
                  placeholder="32"
                  disabled={submitting}
                  className={inputCls}
                />
                <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                  Hệ thống lưu <strong>năm sinh</strong>
                  {patient.age.trim() ? ` (${CURRENT_YEAR - Number(patient.age)})` : ''} thay vì
                  tuổi, để số liệu không sai lệch theo thời gian.
                </p>
            </div>
            <div>
                <span className="mb-1.5 block text-xs font-medium text-gray-600">Giới tính</span>
                <div className="flex gap-4 pt-1.5">
                  {(Object.keys(GENDER_LABEL) as Gender[]).map(g => (
                    <label key={g} className="flex items-center gap-1.5 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="gender"
                        value={g}
                        checked={patient.gender === g}
                        onChange={() => setPatient(p => ({ ...p, gender: g }))}
                        disabled={submitting}
                        className="accent-primary"
                      />
                      {GENDER_LABEL[g]}
                    </label>
                  ))}
                </div>
            </div>
            <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-gray-600">
                  Mô tả tình trạng
                </label>
                <textarea
                  value={patient.condition}
                  onChange={e => setPatient(p => ({ ...p, condition: e.target.value }))}
                  rows={4}
                  placeholder="Tình trạng ghi nhận tại lần này: triệu chứng, vị trí, mức độ…"
                  disabled={submitting}
                  className={`${inputCls} resize-none`}
                />
            </div>
          </div>
        )}
      </section>

      {/* ── Khối 2: phân loại & loại dữ liệu ── */}
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3.5">
          <h2 className="font-serif text-[15px] font-semibold text-gray-900">
            Phân loại &amp; loại dữ liệu
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              Phân loại <span className="text-red-500">*</span>
            </label>
            <select
              value={categoryChoice}
              onChange={e => setCategoryChoice(e.target.value)}
              disabled={submitting}
              required
              className={inputCls}
            >
              <option value="">— Chọn phân loại —</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_CATEGORY}>➕ Khác — nhập tên mới…</option>
            </select>

            {categoryChoice === NEW_CATEGORY && (
              <div className="mt-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="Tên phân loại mới"
                  disabled={submitting}
                  className={inputCls}
                />
                {similarCategory && (
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryChoice(String(similarCategory.id));
                      setNewCategoryName('');
                    }}
                    className="mt-1.5 flex items-start gap-1.5 text-left text-[11px] leading-relaxed text-amber-700"
                  >
                    <span className="material-symbols-outlined mt-px text-[14px]">lightbulb</span>
                    <span>
                      Ý bạn là <strong>{similarCategory.name}</strong>? Bấm để dùng phân loại đã
                      có thay vì tạo mới.
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              Loại dữ liệu <span className="text-red-500">*</span>
            </label>
            <select
              value={dataType}
              onChange={e => {
                const next = e.target.value as DataType | '';
                setDataType(next);
                // Đổi loại dữ liệu có thể làm tệp đang chọn thành không hợp lệ —
                // bỏ chọn luôn thay vì để người dùng phát hiện lúc bấm gửi.
                if (file && next && !DATA_TYPE_EXTENSIONS[next].includes(fileExtension(file))) {
                  setFile(null);
                  resumeAssetIdRef.current = undefined;
                }
              }}
              disabled={submitting}
              required
              className={inputCls}
            >
              <option value="">— Chọn loại dữ liệu —</option>
              {(Object.keys(DATA_TYPE_LABEL) as DataType[]).map(t => (
                <option key={t} value={t}>
                  {DATA_TYPE_LABEL[t]}
                </option>
              ))}
            </select>

            {dataType === 'other' && (
              <input
                type="text"
                value={dataTypeOther}
                onChange={e => setDataTypeOther(e.target.value)}
                placeholder="Ghi rõ loại dữ liệu"
                disabled={submitting}
                required
                className={`${inputCls} mt-2`}
              />
            )}
            {dataType && (
              <p className="mt-1 text-[11px] text-gray-400">
                Nhận tệp: {acceptedExtensions.join(', ')}
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Tên gợi nhớ cho mục dữ liệu này"
              disabled={submitting}
              required
              className={inputCls}
            />
          </div>
        </div>
      </section>

      {/* ── Khối 3: tệp dữ liệu ── */}
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3.5">
          <h2 className="font-serif text-[15px] font-semibold text-gray-900">Tệp dữ liệu</h2>
        </div>
        <div className="space-y-4 p-5">
          {!file ? (
            <div
              onDrop={onDrop}
              onDragOver={e => {
                e.preventDefault();
                setDragging(true);
              }}
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
                cloud_upload
              </span>
              <p className="text-sm text-gray-600">
                Kéo thả tệp vào đây hoặc{' '}
                <span className="font-medium text-primary underline underline-offset-2">
                  chọn từ máy tính
                </span>
              </p>
              <p className="text-xs text-gray-400">
                {dataType
                  ? `Chấp nhận ${acceptedExtensions.join(', ')} · tối đa ${formatFileSize(MAX_ASSET_SIZE)}`
                  : 'Chọn loại dữ liệu trước để biết định dạng được chấp nhận'}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <span className="material-symbols-outlined shrink-0 text-3xl text-primary">
                draft
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">{file.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
              </div>
              {!submitting && (
                <button
                  type="button"
                  onClick={() => {
                    resumeAssetIdRef.current = undefined;
                    setFile(null);
                  }}
                  title="Chọn tệp khác"
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
            accept={acceptedExtensions.join(',')}
            onChange={e => {
              if (e.target.files) pickFile(Array.from(e.target.files));
              e.target.value = '';
            }}
            className="hidden"
          />

          {/* Tiến trình theo BYTE thật (kể cả chunk đang gửi dở) — file vài trăm MB
              mà đo theo số chunk thì thanh đứng im rất lâu rồi nhảy cục. */}
          {submitting && (
            <div className="space-y-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-right text-xs tabular-nums text-gray-500">
                {progress < 100 ? `Đang tải lên… ${progress}%` : 'Đang xử lý trên máy chủ…'}
              </p>
            </div>
          )}
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px]">error</span>
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {file ? 'Sẵn sàng tải lên' : 'Chưa chọn tệp'}
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
              <span className="material-symbols-outlined text-[18px]">upload</span>
              Tải dữ liệu lên
            </>
          )}
        </button>
      </div>
    </form>
  );
}
