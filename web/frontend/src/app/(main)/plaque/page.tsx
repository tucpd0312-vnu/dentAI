'use client';

import { useRequireRole } from '@/lib/useRequireRole';

/**
 * Chẩn đoán mảng bám trên bệnh nhân niềng răng.
 *
 * Nội dung để trống có chủ đích: backend chưa có endpoint cho module này,
 * trang chỉ giữ chỗ cho mục "Mảng bám niềng răng" trong nhóm AI chẩn đoán lâm sàng.
 */
export default function PlaquePage() {
  const { allowed, checking } = useRequireRole(['admin', 'doctor']);

  if (checking || !allowed) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-gray-300">
          autorenew
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <span className="material-symbols-outlined text-5xl text-gray-300">dentistry</span>
      <p className="text-sm text-gray-500">Chức năng đang được phát triển.</p>
    </div>
  );
}
