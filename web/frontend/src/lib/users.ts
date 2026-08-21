import api from './api';
import type { Role } from './auth';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: Role;
  phone: string;
  is_active: boolean;
  is_deleted: boolean;
  email_verified: boolean;
  date_joined: string;
  last_login: string | null;
  deleted_at: string | null;
  case_count: number;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface UserFilters {
  q?: string;
  role?: Role | '';
  is_active?: 'true' | 'false' | '';
  /** 'true' = chỉ xem thùng rác, 'all' = cả hai, bỏ trống = ẩn user đã xoá. */
  is_deleted?: 'true' | 'all' | '';
  page?: number;
}

export interface CreateUserPayload {
  username: string;
  email: string;
  password: string;
  role: Role;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

/** Kết quả autocomplete — email luôn ở dạng che một phần. */
export interface UserSuggestion {
  id: number;
  username: string;
  full_name: string;
  email_masked: string;
  role: Role;
  /** false với bệnh nhân — không cấp được quyền 'edit'. */
  can_receive_edit: boolean;
}

// ── API ───────────────────────────────────────────────────────────────────────

export async function fetchUsers(filters: UserFilters = {}): Promise<Paginated<AdminUser>> {
  const params: Record<string, string | number> = {};
  if (filters.q) params.q = filters.q;
  if (filters.role) params.role = filters.role;
  if (filters.is_active) params.is_active = filters.is_active;
  if (filters.is_deleted) params.is_deleted = filters.is_deleted;
  if (filters.page && filters.page > 1) params.page = filters.page;

  const res = await api.get<Paginated<AdminUser>>('/users/', { params });
  return res.data;
}

export async function createUser(payload: CreateUserPayload): Promise<AdminUser> {
  const res = await api.post<AdminUser>('/users/', payload);
  return res.data;
}

export async function updateUser(id: number, patch: Partial<AdminUser>): Promise<AdminUser> {
  const res = await api.patch<AdminUser>(`/users/${id}/`, patch);
  return res.data;
}

export async function deleteUser(id: number): Promise<void> {
  await api.delete(`/users/${id}/`);
}

export async function restoreUser(id: number): Promise<AdminUser> {
  const res = await api.post<AdminUser>(`/users/${id}/restore/`);
  return res.data;
}

export async function searchUsers(q: string): Promise<UserSuggestion[]> {
  if (q.trim().length < 2) return [];
  const res = await api.get<UserSuggestion[]>('/users/search/', { params: { q } });
  return res.data;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Rút thông điệp lỗi tiếng Việt từ response DRF (detail hoặc lỗi theo field). */
export function apiErrorMessage(err: unknown, fallback = 'Đã xảy ra lỗi. Vui lòng thử lại.'): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  for (const value of Object.values(data)) {
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    if (typeof value === 'string') return value;
  }
  return fallback;
}