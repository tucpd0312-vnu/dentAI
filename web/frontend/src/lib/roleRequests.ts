import api from './api';
import type { Role } from './auth';
import type { Paginated } from './users';

export type RoleRequestStatus = 'pending' | 'approved' | 'rejected';

export interface RoleRequest {
  id: number;
  user: number;
  username: string;
  full_name: string;
  email: string;
  phone: string;
  current_role: Role;
  user_is_active: boolean;
  user_is_deleted: boolean;
  email_verified: boolean;
  requested_role: Role;
  requested_role_display: string;
  status: RoleRequestStatus;
  status_display: string;
  organization: string;
  note: string;
  reviewed_by: number | null;
  reviewed_by_username: string | null;
  review_note: string;
  reviewed_at: string | null;
  /** Số lần tài khoản này từng bị từ chối trước đó. */
  previous_rejections: number;
  /** null = duyệt được ngay; có giá trị = lý do chưa duyệt được. */
  blocking_reason: string | null;
  created_at: string;
}

/** Yêu cầu gần nhất của chính người đang đăng nhập (từ `/auth/me/`). */
export interface MyRoleRequest {
  id: number;
  requested_role: Role;
  status: RoleRequestStatus;
  status_display: string;
  review_note: string;
  created_at: string;
  reviewed_at: string | null;
}

export const REQUEST_STATUS_LABEL: Record<RoleRequestStatus, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Đã từ chối',
};

export const REQUEST_STATUS_STYLE: Record<RoleRequestStatus, string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
};

export async function fetchRoleRequests(
  status: RoleRequestStatus | 'all' = 'pending',
  page = 1,
  q = '',
): Promise<Paginated<RoleRequest> & { pending_total: number }> {
  const params: Record<string, string | number> = { status };
  if (page > 1) params.page = page;
  if (q) params.q = q;
  const res = await api.get<Paginated<RoleRequest> & { pending_total: number }>(
    '/role-requests/',
    { params },
  );
  return res.data;
}

export async function approveRoleRequest(id: number, note = ''): Promise<RoleRequest> {
  const res = await api.post<RoleRequest>(`/role-requests/${id}/approve/`, { note });
  return res.data;
}

/** `note` là BẮT BUỘC — backend từ chối nếu để trống. */
export async function rejectRoleRequest(id: number, note: string): Promise<RoleRequest> {
  const res = await api.post<RoleRequest>(`/role-requests/${id}/reject/`, { note });
  return res.data;
}
