/**
 * Quản lý phiên làm việc 1 giờ — lớp phòng thủ thứ nhất (trải nghiệm).
 *
 * Lớp thứ hai nằm ở backend: access và refresh token đều sống 1h và được rotate
 * (xem config/settings.py SIMPLE_JWT). Kể cả khi ai đó vô hiệu hoá JS ở đây, không
 * hoạt động quá 1h là token chết ở server.
 *
 * Cách hoạt động:
 *   - Mỗi tương tác (click/gõ/cuộn/chạm/quay lại tab) ghi mốc thời gian vào
 *     localStorage. Dùng localStorage chứ không phải biến trong bộ nhớ để MỌI TAB
 *     cùng nhìn một mốc — mở 2 tab, làm việc ở tab A thì tab B không bị đăng xuất.
 *   - Còn 2 phút thì hiện modal đếm ngược.
 *   - Hết 60 phút thì gọi /auth/logout/ (best-effort) rồi về /login?reason=timeout.
 */
import api from './api';
import { getRefreshToken } from './auth';

// ── Tham số ───────────────────────────────────────────────────────────────────

export const IDLE_LIMIT_MS = 60 * 60 * 1000;  // 60 phút không tương tác → đăng xuất
export const WARN_BEFORE_MS = 2 * 60 * 1000;  // hiện cảnh báo trước 2 phút
export const CHECK_INTERVAL_MS = 15 * 1000;   // nhịp kiểm tra
const SLIDE_AFTER_MS = 45 * 60 * 1000;        // chỉ refresh khi token đã dùng > 45'
const ACTIVITY_THROTTLE_MS = 5 * 1000;        // gộp sự kiện, tránh ghi localStorage liên tục

const LAST_ACTIVITY_KEY = 'dentai_last_activity';
const LAST_REFRESH_KEY = 'dentai_last_refresh';

const ACTIVITY_EVENTS = [
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'visibilitychange',
] as const;

// ── Mốc thời gian (chia sẻ giữa các tab qua localStorage) ─────────────────────

function store(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readTs(key: string): number {
  const raw = store()?.getItem(key);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function writeTs(key: string, value: number) {
  store()?.setItem(key, String(value));
}

export function markActivity(now = Date.now()) {
  writeTs(LAST_ACTIVITY_KEY, now);
}

export function getLastActivity(): number {
  return readTs(LAST_ACTIVITY_KEY);
}

/** Bắt đầu một phiên mới — gọi ngay sau khi đăng nhập thành công. */
export function startSession() {
  const now = Date.now();
  writeTs(LAST_ACTIVITY_KEY, now);
  writeTs(LAST_REFRESH_KEY, now);
}

export function clearSessionTimestamps() {
  store()?.removeItem(LAST_ACTIVITY_KEY);
  store()?.removeItem(LAST_REFRESH_KEY);
}

/** Mili-giây còn lại trước khi phiên hết hạn. */
export function msUntilExpiry(now = Date.now()): number {
  const last = getLastActivity();
  if (!last) return IDLE_LIMIT_MS;
  return Math.max(0, last + IDLE_LIMIT_MS - now);
}

// ── Gia hạn token (cửa sổ trượt) ──────────────────────────────────────────────

let sliding: Promise<void> | null = null;

/**
 * Gia hạn access token nếu nó đã dùng quá lâu.
 *
 * Không refresh mỗi lần tương tác — như vậy sẽ bắn hàng trăm request mỗi phiên.
 * Chỉ refresh khi token đã sống > 45 phút, tức là tối đa ~1 lần/45 phút.
 */
export async function slideSessionIfNeeded(force = false): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!getRefreshToken()) return;

  const age = Date.now() - readTs(LAST_REFRESH_KEY);
  if (!force && age < SLIDE_AFTER_MS) return;
  if (sliding) return sliding;

  sliding = (async () => {
    try {
      const refresh = getRefreshToken();
      if (!refresh) return;
      const res = await api.post<{ access: string; refresh?: string }>('/auth/refresh/', { refresh });
      const s = store();
      if (s) {
        s.setItem('dentai_access', res.data.access);
        // Rotate bật ở backend ⇒ luôn có refresh mới; token cũ đã vào blacklist,
        // không lưu lại là lần refresh sau sẽ 401.
        if (res.data.refresh) s.setItem('dentai_refresh', res.data.refresh);
      }
      writeTs(LAST_REFRESH_KEY, Date.now());
    } catch {
      // Refresh hỏng → interceptor trong auth.ts sẽ xử lý ở request kế tiếp.
    } finally {
      sliding = null;
    }
  })();

  return sliding;
}

// ── Theo dõi tương tác ────────────────────────────────────────────────────────

/**
 * Gắn listener theo dõi tương tác. Trả về hàm gỡ listener.
 *
 * `onActivity` được gọi sau throttle, dùng để reset trạng thái cảnh báo.
 */
export function watchActivity(onActivity?: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  let lastWrite = 0;

  const handler = (event: Event) => {
    // Tab bị ẩn không tính là tương tác; chỉ tính lúc người dùng quay lại.
    if (event.type === 'visibilitychange' && document.visibilityState !== 'visible') return;

    const now = Date.now();
    if (now - lastWrite < ACTIVITY_THROTTLE_MS) return;
    lastWrite = now;
    markActivity(now);
    onActivity?.();
  };

  ACTIVITY_EVENTS.forEach(evt =>
    window.addEventListener(evt, handler, { passive: true }),
  );

  // Tab khác ghi mốc mới → tab này cũng coi như còn hoạt động.
  const onStorage = (e: StorageEvent) => {
    if (e.key === LAST_ACTIVITY_KEY) onActivity?.();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handler));
    window.removeEventListener('storage', onStorage);
  };
}

// ── Đăng xuất ─────────────────────────────────────────────────────────────────

/**
 * Báo cho server biết phiên kết thúc để đưa refresh token vào blacklist.
 * Best-effort: mạng hỏng cũng không được cản việc xoá session phía client.
 */
export async function revokeSession(reason?: 'idle_timeout'): Promise<void> {
  const refresh = getRefreshToken();
  if (!refresh) return;
  try {
    await api.post('/auth/logout/', reason ? { refresh, reason } : { refresh });
  } catch {
    /* bỏ qua */
  }
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}