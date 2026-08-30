/**
 * Trang giữ chỗ cho chức năng trò chuyện.
 *
 * Không khai báo guard theo vai trò: layout chính đã yêu cầu đăng nhập và mục này
 * được mở giống nhau cho admin, doctor và patient.
 */
export default function ChatPage() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <span className="material-symbols-outlined text-5xl text-gray-300">forum</span>
      <div>
        <h1 className="font-serif text-lg font-semibold text-gray-800">Trò chuyện</h1>
        <p className="mt-1 text-sm text-gray-500">Hệ thống đang được phát triển.</p>
      </div>
    </div>
  );
}
