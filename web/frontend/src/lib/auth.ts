import api from "./api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Role = "admin" | "doctor" | "patient";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: Role;
  phone: string;
  email_verified: boolean;
  is_active: boolean;
  date_joined: string;
  last_login: string | null;
  /** Số yêu cầu vai trò admin xử lý được ngay. Không phải admin → luôn 0. */
  pending_role_requests: number;
  /** Yêu cầu vai trò gần nhất của chính người này; null nếu chưa từng gửi. */
  my_role_request: {
    id: number;
    requested_role: Role;
    status: 'pending' | 'approved' | 'rejected';
    status_display: string;
    review_note: string;
    created_at: string;
    reviewed_at: string | null;
  } | null;
}

/** Vai trò người dùng tự chọn được khi đăng ký — KHÔNG có admin. */
export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  requestedRole: 'patient' | 'doctor';
  /** Bắt buộc khi requestedRole = 'doctor'. */
  firstName?: string;
  lastName?: string;
  phone?: string;
  organization?: string;
  note?: string;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Quản trị viên',
  doctor: 'Bác sĩ',
  patient: 'Bệnh nhân',
};

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface AuthResult extends AuthTokens {
  user: AuthUser;
}

// ── Token storage (localStorage) ──────────────────────────────────────────────

const ACCESS_KEY = "dentai_access";
const REFRESH_KEY = "dentai_refresh";
const USER_KEY = "dentai_user";
// Phải khớp với LAST_ACTIVITY_KEY / LAST_REFRESH_KEY trong session.ts
const ACTIVITY_KEY = "dentai_last_activity";
const REFRESH_TS_KEY = "dentai_last_refresh";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return storage()?.getItem(ACCESS_KEY) ?? null;
}

export function getRefreshToken(): string | null {
  return storage()?.getItem(REFRESH_KEY) ?? null;
}

export function getStoredUser(): AuthUser | null {
  const raw = storage()?.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

function storeSession(tokens: AuthTokens, user?: AuthUser) {
  const s = storage();
  if (!s) return;
  s.setItem(ACCESS_KEY, tokens.access);
  s.setItem(REFRESH_KEY, tokens.refresh);
  if (user) s.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  const s = storage();
  if (!s) return;
  s.removeItem(ACCESS_KEY);
  s.removeItem(REFRESH_KEY);
  s.removeItem(USER_KEY);
  s.removeItem(ACTIVITY_KEY);
  s.removeItem(REFRESH_TS_KEY);
}

/**
 * Đặt lại đồng hồ phiên sau khi đăng nhập.
 *
 * Viết trực tiếp ở đây thay vì gọi `startSession()` từ `session.ts`: file đó đã
 * import `getRefreshToken` từ file này, thêm chiều ngược lại sẽ tạo vòng lặp import.
 * (Hai key phải khớp với hằng số trong session.ts.)
 */
function beginSessionClock() {
  const s = storage();
  if (!s) return;
  const now = String(Date.now());
  s.setItem(ACTIVITY_KEY, now);
  s.setItem(REFRESH_TS_KEY, now);
}

// ── Axios interceptors: attach Bearer + refresh on 401 ────────────────────────

api.interceptors.request.use(config => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Refresh is shared: parallel 401s wait on the same in-flight request.
let refreshing: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refresh = getRefreshToken();
  if (!refresh) throw new Error("no refresh token");
  // Backend bật ROTATE_REFRESH_TOKENS ⇒ response có refresh MỚI và token cũ vào
  // blacklist. storeSession lưu cả hai — nếu chỉ lưu access thì lần refresh sau 401.
  const res = await api.post<AuthTokens>("/auth/refresh/", { refresh });
  storeSession(res.data);
  return res.data.access;
}

api.interceptors.response.use(
  res => res,
  async error => {
    const config = error?.config;
    const status = error?.response?.status;
    const url: string = config?.url ?? "";

    // Don't try to refresh on the auth endpoints themselves, or twice.
    if (status !== 401 || !config || config._retried || url.includes("/auth/")) {
      return Promise.reject(error);
    }
    if (!getRefreshToken()) return Promise.reject(error);

    config._retried = true;
    try {
      refreshing = refreshing ?? refreshAccessToken().finally(() => { refreshing = null; });
      const access = await refreshing;
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${access}`;
      return api(config);
    } catch {
      clearSession();
      if (typeof window !== "undefined") window.location.href = "/login/";
      return Promise.reject(error);
    }
  },
);

// ── Auth API ──────────────────────────────────────────────────────────────────

export async function login(username: string, password: string): Promise<AuthResult> {
  const res = await api.post<AuthResult>("/auth/login/", { username, password });
  storeSession(res.data, res.data.user);
  beginSessionClock();
  return res.data;
}

export async function register(
  payload: RegisterPayload,
): Promise<{ detail: string; email: string }> {
  const res = await api.post<{ detail: string; email: string }>("/auth/register/", {
    username: payload.username,
    email: payload.email,
    password: payload.password,
    confirm_password: payload.confirmPassword,
    requested_role: payload.requestedRole,
    first_name: payload.firstName ?? "",
    last_name: payload.lastName ?? "",
    phone: payload.phone ?? "",
    organization: payload.organization ?? "",
    note: payload.note ?? "",
  });
  return res.data;
}

export async function verifyOTP(email: string, code: string): Promise<AuthResult> {
  const res = await api.post<AuthResult & { detail: string }>("/auth/verify-otp/", { email, code });
  storeSession(res.data, res.data.user);
  beginSessionClock();
  return res.data;
}

export async function resendOTP(email: string): Promise<{ detail: string }> {
  const res = await api.post<{ detail: string }>("/auth/resend-otp/", { email });
  return res.data;
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const res = await api.get<AuthUser>("/auth/me/");
  storage()?.setItem(USER_KEY, JSON.stringify(res.data));
  return res.data;
}

export async function updateCurrentUser(patch: Partial<AuthUser>): Promise<AuthUser> {
  const res = await api.patch<AuthUser>("/auth/me/", patch);
  storage()?.setItem(USER_KEY, JSON.stringify(res.data));
  return res.data;
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<{ detail: string }> {
  const res = await api.post<{ detail: string }>("/auth/change-password/", {
    old_password: oldPassword,
    new_password: newPassword,
  });
  return res.data;
}

/**
 * Đăng xuất — báo server blacklist refresh token rồi mới xoá session.
 *
 * Việc gọi server là best-effort: mạng hỏng cũng phải xoá được session phía client,
 * nếu không người dùng bị kẹt trong trạng thái "không đăng xuất được".
 */
export async function logout(reason?: 'idle_timeout'): Promise<void> {
  const refresh = getRefreshToken();
  if (refresh) {
    try {
      await api.post('/auth/logout/', reason ? { refresh, reason } : { refresh });
    } catch {
      /* bỏ qua */
    }
  }
  clearSession();
}