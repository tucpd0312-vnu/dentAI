'use client';

import { useEffect, useRef, useState } from 'react';

interface SliceViewerProps {
  /** Số ảnh xem trước có sẵn. 0 ⇒ hiện khung rỗng, không gọi API lần nào. */
  count: number;
  /**
   * Lấy PNG lát thứ `index`. Nhận qua prop chứ không tự gọi API vì cùng một viewer
   * phục vụ hai nguồn khác nhau: phim CBCT (`fetchScanPreviewBlob`) và kho dữ liệu
   * (`fetchAssetPreviewBlob`). Hàm này KHÔNG cần memo hoá — component giữ tham chiếu
   * mới nhất trong ref, nên truyền arrow function inline cũng không gây gọi lại vô hạn.
   */
  fetchBlob: (index: number) => Promise<Blob>;
  /** Nhãn ảnh, mặc định "Lát cắt". Ảnh 2D một tấm thì truyền tên khác cho đúng nghĩa. */
  label?: string;
}

/**
 * Xem ảnh xem trước dạng cuộn lát — tách từ `app/(main)/scans/[id]/page.tsx` khi kho
 * dữ liệu cần đúng thành phần này cho DICOM.
 *
 * Ảnh KHÔNG tải bằng `<img src>` thẳng: endpoint preview đòi JWT mà thẻ `<img>` thuần
 * không gắn được header `Authorization`, nên phải tải blob qua axios rồi dựng object
 * URL. Mọi URL đã tạo được thu hồi khi rời trang.
 */
export default function SliceViewer({ count, fetchBlob, label = 'Lát cắt' }: SliceViewerProps) {
  const [index, setIndex] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cache = useRef<Map<number, string>>(new Map());
  const fetchRef = useRef(fetchBlob);
  fetchRef.current = fetchBlob;

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
        const blob = await fetchRef.current(index);
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
  }, [index, count]);

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
            alt={`${label} ${index + 1}`}
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

      {/* Một ảnh duy nhất thì thanh cuộn lát chỉ là nhiễu — ẩn hẳn. */}
      {count > 1 && (
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
            aria-label={label}
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
      )}
    </div>
  );
}
