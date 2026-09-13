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
  birth_year: number | null;
  age: number | null;
  organization: string;
  lecturer_code: string;
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
  birth_year?: number | null;
  organization?: string;
  lecturer_code?: string;
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
  const data = (err as { response?: { data?: unknown } })?.response?.data;

  // DRF thường trả {field: ["..." ]}, nhưng proxy/network có thể trả chuỗi
  // hoặc object lồng nhau. Chỉ nhận chuỗi có nội dung để tránh ErrorBox bị rỗng.
  const findMessage = (value: unknown): string | null => {
    if (typeof value === 'string') return value.trim() || null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const message = findMessage(item);
        if (message) return message;
      }
      return null;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['detail', 'message', 'non_field_errors']) {
        const message = findMessage(record[key]);
        if (message) return message;
      }
      for (const item of Object.values(record)) {
        const message = findMessage(item);
        if (message) return message;
      }
    }
    return null;
  };

  return findMessage(data) || fallback;
}
