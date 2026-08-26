import api from './api';
import type { Paginated } from './users';

export type LogCategory = 'admin' | 'auth' | 'business' | 'error';

/** Loại chẩn đoán dòng log thuộc về — 'system' cho sự kiện không gắn module nào. */
export type LogModule = 'gingivitis' | 'canine3d' | 'library' | 'system';

export interface ActivityLog {
  id: number;
  category: LogCategory;
  category_display: string;
  action: string;
  action_display: string;
  module: LogModule;
  module_display: string;
  actor: number | null;
  /** Snapshot username lúc ghi — giữ vết kể cả khi tài khoản bị xoá. */
  actor_label: string;
  target_user: number | null;
  target_user_label: string | null;
  target_case: number | null;
  target_scan: number | null;
  detail: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface ActivityFilters {
  category?: LogCategory | '';
  module?: LogModule | '';
  action?: string;
  actor?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
}

export const LOG_PAGE_SIZE = 30;

export const CATEGORY_LABEL: Record<LogCategory, string> = {
  admin: 'Quản trị',
  auth: 'Xác thực',
  business: 'Nghiệp vụ',
  error: 'Lỗi hệ thống',
};

export const CATEGORY_STYLE: Record<LogCategory, string> = {
  admin: 'bg-purple-50 text-purple-700',
  auth: 'bg-blue-50 text-blue-700',
  business: 'bg-green-50 text-green-700',
  error: 'bg-red-50 text-red-700',
};

export const CATEGORY_ICON: Record<LogCategory, string> = {
  admin: 'admin_panel_settings',
  auth: 'key',
  business: 'medical_services',
  error: 'error',
};

/** Cùng bảng màu badge với cột "Loại chẩn đoán" ở /history. */
export const MODULE_LABEL: Record<LogModule, string> = {
  gingivitis: 'Viêm lợi · 2D',
  canine3d: 'Răng nanh ngầm · 3D',
  library: 'Kho dữ liệu',
  system: 'Hệ thống',
};

export const MODULE_STYLE: Record<LogModule, string> = {
  gingivitis: 'bg-primary-50 text-primary',
  canine3d: 'bg-indigo-50 text-indigo-600',
  library: 'bg-amber-50 text-amber-700',
  system: 'bg-gray-100 text-gray-500',
};

/** Danh sách action theo nhóm — khớp LogAction ở apps/users/models.py. */
export const ACTIONS_BY_CATEGORY: Record<LogCategory, { value: string; label: string }[]> = {
  admin: [
    { value: 'user_create', label: 'Tạo người dùng' },
    { value: 'user_update', label: 'Cập nhật người dùng' },
    { value: 'user_role_change', label: 'Đổi vai trò' },
    { value: 'user_lock', label: 'Khoá tài khoản' },
    { value: 'user_unlock', label: 'Mở khoá tài khoản' },
    { value: 'user_delete', label: 'Xoá người dùng' },
    { value: 'user_restore', label: 'Khôi phục người dùng' },
    { value: 'settings_update', label: 'Cập nhật cài đặt' },
  ],
  auth: [
    { value: 'login_success', label: 'Đăng nhập thành công' },
    { value: 'login_failed', label: 'Đăng nhập thất bại' },
    { value: 'logout', label: 'Đăng xuất' },
    { value: 'session_timeout', label: 'Hết phiên do không hoạt động' },
    { value: 'register', label: 'Đăng ký' },
    { value: 'otp_verified', label: 'Xác thực OTP' },
    { value: 'password_change', label: 'Đổi mật khẩu' },
  ],
  business: [
    { value: 'case_create', label: 'Tạo ca chẩn đoán' },
    { value: 'case_done', label: 'Ca hoàn thành' },
    { value: 'case_failed', label: 'Ca thất bại' },
    { value: 'labels_edited', label: 'Bác sĩ sửa nhãn' },
    { value: 'case_export', label: 'Tải kết quả' },
    { value: 'case_share', label: 'Chia sẻ ca' },
    { value: 'case_unshare', label: 'Thu hồi chia sẻ' },
    { value: 'asset_upload', label: 'Tải dữ liệu lên kho' },
    { value: 'asset_download', label: 'Tải dữ liệu từ kho' },
    { value: 'asset_delete', label: 'Xoá dữ liệu khỏi kho' },
  ],
  error: [
    { value: 'task_error', label: 'Lỗi tác vụ nền' },
    { value: 'pipeline_error', label: 'Lỗi pipeline AI' },
    { value: 'email_error', label: 'Lỗi gửi email' },
  ],
};

export async function fetchActivityLogs(
  filters: ActivityFilters = {},
): Promise<Paginated<ActivityLog>> {
  const params: Record<string, string | number> = {};
  if (filters.category) params.category = filters.category;
  if (filters.module) params.module = filters.module;
  if (filters.action) params.action = filters.action;
  if (filters.actor) params.actor = filters.actor;
  if (filters.date_from) params.date_from = filters.date_from;
  if (filters.date_to) params.date_to = filters.date_to;
  if (filters.page && filters.page > 1) params.page = filters.page;

  const res = await api.get<Paginated<ActivityLog>>('/activity-logs/', { params });
  return res.data;
}