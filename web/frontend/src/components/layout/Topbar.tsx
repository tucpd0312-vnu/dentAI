'use client';

import { usePathname } from 'next/navigation';

function getTitle(pathname: string): string {
  if (pathname === '/analysis/new') return 'Phân tích mới';
  if (/^\/analysis\/[^/]+\/processing/.test(pathname)) return 'Đang xử lý…';
  if (/^\/analysis\/[^/]+\/results\/[^/]+\/edit/.test(pathname)) return 'Chỉnh sửa kết quả';
  if (/^\/analysis\/[^/]+\/results/.test(pathname)) return 'Kết quả chẩn đoán';
  if (pathname.startsWith('/history')) return 'Lịch sử chẩn đoán';
  if (pathname.startsWith('/settings')) return 'Cài đặt';
  if (pathname.startsWith('/help')) return 'Hướng dẫn sử dụng';
  return 'Chẩn đoán viêm lợi';
}

export default function Topbar() {
  const pathname = usePathname();
  return (
    <header className="flex items-center h-14 px-6 bg-white border-b border-gray-200 shrink-0">
      <h1 className="font-serif font-semibold text-[18px] text-gray-900">
        {getTitle(pathname)}
      </h1>
    </header>
  );
}
