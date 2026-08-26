/** Trạng thái thiết lập chỉ có ý nghĩa trên đúng trình duyệt/máy đang sử dụng. */
const SLICER_SETUP_KEY = 'dentai.slicer-setup.v1';

export function isSlicerSetupConfirmed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SLICER_SETUP_KEY) === 'confirmed';
  } catch {
    return false;
  }
}

export function confirmSlicerSetup(): void {
  try {
    window.localStorage.setItem(SLICER_SETUP_KEY, 'confirmed');
  } catch {
    // Trình duyệt chặn localStorage: người dùng vẫn có thể quay lại và mở thủ công.
  }
}

export function clearSlicerSetupConfirmation(): void {
  try {
    window.localStorage.removeItem(SLICER_SETUP_KEY);
  } catch {
    // Không có gì cần xử lý khi storage bị chặn.
  }
}
