import api from './api';
import type { CaseListItem } from './api';
import type { Role } from './auth';

export interface DashboardCases {
  total: number;
  by_status: Record<'processing' | 'done' | 'failed', number>;
  images_total: number;
  low_confidence: number;
  shared_with_me: number;
  recent: CaseListItem[];
}

export interface DashboardUsers {
  total: number;
  by_role: Record<Role, number>;
  unverified: number;
  locked: number;
  deleted: number;
  new_7d: number;
  /** Yêu cầu vai trò admin xử lý được ngay (đã xác thực email, chưa khoá/xoá). */
  pending_role_requests: number;
}

export interface DashboardStorageModule {
  total: number;
  by_status: Record<'uploading' | 'processing' | 'ready' | 'failed', number>;
  shared_with_me: number;
}

export type LogCategory = 'admin' | 'auth' | 'business' | 'error';

export interface OperationalDashboardData {
  scope: 'all' | 'own';
  cases: DashboardCases;
  scans: DashboardStorageModule;
  library: DashboardStorageModule;
  /** Khoá là mức MGI dạng chuỗi: '0'…'4'. */
  mgi: Record<string, number>;
  /** Chỉ có trong response của admin. */
  users?: DashboardUsers;
  activity?: { last_7d_by_category: Record<LogCategory, number> };
}

export interface ReceptionistDashboardData {
  scope: 'receptionist';
  available_modules: ['dashboard'];
}

export type DashboardData = OperationalDashboardData | ReceptionistDashboardData;

export async function fetchDashboard(): Promise<DashboardData> {
  const res = await api.get<DashboardData>('/dashboard/');
  return res.data;
}

// ── Nhãn hiển thị dùng chung ─────────────────────────────────────────────────

export const CASE_STATUS_LABEL: Record<string, string> = {
  processing: 'Đang xử lý',
  done: 'Hoàn thành',
  failed: 'Thất bại',
};

/** Khớp với bảng màu mgi.* trong tailwind.config.ts. */
export const MGI_COLOR: Record<string, string> = {
  '0': '#9ca3af',
  '1': '#22c55e',
  '2': '#eab308',
  '3': '#f97316',
  '4': '#ef4444',
};

export const MGI_LABEL: Record<string, string> = {
  '0': 'Bình thường',
  '1': 'Viêm nhẹ',
  '2': 'Viêm trung bình',
  '3': 'Viêm nặng',
  '4': 'Viêm rất nặng',
};
