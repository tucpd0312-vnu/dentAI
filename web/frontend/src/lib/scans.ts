import api from './api';
import type { ActivityLog } from './activity';
import type { Role } from './auth';
import type { Paginated } from './users';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScanStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface ScanPatient {
  id: number;
  name: string;
  patient_code: string;
  notes: string | null;
  created_at: string;
}

export interface ScanUploader {
  id: number;
  username: string;
  full_name: string;
  role: Role;
}

export interface ScanListItem {
  id: number;
  patient: ScanPatient;
  status: ScanStatus;
  modality: string;
  n_slices: number;
  file_size: number;
  /** null với phim tạo trước khi có hệ thống tài khoản — không xảy ra thực tế ở
   * module này (upload luôn gắn request.user) nhưng khớp shape backend. */
  uploaded_by: ScanUploader | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface ScanDetail extends ScanListItem {
  study_uid: string;
  series_uid: string;
  acquired_at: string | null;
  is_anonymized: boolean;
  error_message: string;
  /** Số PNG preview đã sinh (<= 60) — phạm vi index hợp lệ cho scanPreviewUrl(). */
  preview_count: number;
}

export interface ScanFilters {
  q?: string;
  uploaded_by?: number;
  page?: number;
  /** Ép cỡ trang lớn hơn mặc định (20) — dùng khi cần TOÀN BỘ danh sách để trộn/lọc
   * phía client (vd. /history gộp), không phải để phân trang thật. Trần 100 ở backend. */
  pageSize?: number;
}

export interface UploadScanPayload {
  patientName: string;
  patientCode?: string;
  note?: string;
  file: File;
}

export interface SegmentationAuthor {
  id: number;
  username: string;
  full_name: string;
}

export interface Segmentation {
  id: number;
  scan: number;
  version: number;
  author: SegmentationAuthor | null;
  note: string;
  metrics: Record<string, unknown>;
  file_hash: string;
  created_at: string;
}

export interface OpenTokenResponse {
  token: string;
  /** `dentai://open?token=...&server=...` — gán thẳng vào `window.location.href`. */
  open_url: string;
  expires_at: string;
}

// ── API ───────────────────────────────────────────────────────────────────────

export async function fetchScans(filters: ScanFilters = {}): Promise<Paginated<ScanListItem>> {
  const params: Record<string, string | number> = {};
  if (filters.q) params.q = filters.q;
  if (filters.uploaded_by) params.uploaded_by = filters.uploaded_by;
  if (filters.page && filters.page > 1) params.page = filters.page;
  if (filters.pageSize) params.page_size = filters.pageSize;

  const res = await api.get<Paginated<ScanListItem>>('/scans/', { params });
  return res.data;
}

export async function fetchScan(id: number | string): Promise<ScanDetail> {
  const res = await api.get<ScanDetail>(`/scans/${id}/`);
  return res.data;
}

export async function fetchScanStatus(
  id: number | string,
): Promise<{ id: number; status: ScanStatus; error_message: string }> {
  const res = await api.get(`/scans/${id}/status/`);
  return res.data;
}

const CHUNK_RETRY_LIMIT = 3;

interface UploadInitResponse {
  scan_id: number;
  chunk_size: number;
  total_chunks: number;
}

interface UploadStatusResponse {
  received_chunks: number[];
  total_chunks: number;
  chunk_size: number;
}

/**
 * Tải phim CBCT lên theo chunk (§4.2 PLAN_3D_CANINE.md) — CBCT thật ~500MB, và
 * `dentai.datasphere.id.vn` đi qua Cloudflare Tunnel giới hạn cứng 100MB/request nên
 * KHÔNG thể gửi một request duy nhất. `onProgress` nhận % (0–100) tính theo tổng byte
 * đã gửi qua mọi chunk (kể cả chunk đang dở), không phải số chunk xong, để thanh tiến
 * trình mượt. Truyền `resumeScanId` (phiên upload dở từ lần gọi trước bị lỗi) để chỉ
 * gửi lại phần chunk còn thiếu thay vì tạo phim mới.
 */
export async function uploadScan(
  payload: UploadScanPayload,
  onProgress?: (percent: number) => void,
  resumeScanId?: number,
): Promise<{ id: number; status: ScanStatus }> {
  const file = payload.file;
  let scanId: number;
  let chunkSize: number;
  let totalChunks: number;
  let received: Set<number>;

  if (resumeScanId) {
    const res = await api.get<UploadStatusResponse>(`/scans/uploads/${resumeScanId}`);
    scanId = resumeScanId;
    chunkSize = res.data.chunk_size;
    totalChunks = res.data.total_chunks;
    received = new Set(res.data.received_chunks);
  } else {
    const res = await api.post<UploadInitResponse>('/scans/uploads', {
      patient_name: payload.patientName,
      patient_code: payload.patientCode,
      note: payload.note,
      filename: file.name,
      total_size: file.size,
    });
    scanId = res.data.scan_id;
    chunkSize = res.data.chunk_size;
    totalChunks = res.data.total_chunks;
    received = new Set();
  }

  // Byte đã gửi thành công (chunk đã xác nhận) + byte đang gửi dở của chunk hiện tại —
  // cộng dồn để % không nhảy cục theo từng chunk 20MB.
  let confirmedBytes = 0;
  for (const idx of received) {
    confirmedBytes += Math.min(chunkSize, file.size - idx * chunkSize);
  }
  const reportProgress = (inFlightBytes: number) => {
    if (!onProgress) return;
    onProgress(Math.round(((confirmedBytes + inFlightBytes) / file.size) * 100));
  };
  reportProgress(0);

  for (let index = 0; index < totalChunks; index += 1) {
    if (received.has(index)) continue;
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const blob = file.slice(start, end);

    let attempt = 0;
    for (;;) {
      try {
        await api.put(`/scans/uploads/${scanId}/${index}`, blob, {
          headers: { 'Content-Type': 'application/octet-stream' },
          onUploadProgress: evt => reportProgress(evt.loaded),
        });
        break;
      } catch (err) {
        attempt += 1;
        if (attempt >= CHUNK_RETRY_LIMIT) {
          throw Object.assign(err instanceof Error ? err : new Error('Upload chunk thất bại'), {
            scanId,
          });
        }
      }
    }
    confirmedBytes += end - start;
    reportProgress(0);
  }

  try {
    const res = await api.post<{ id: number; status: ScanStatus }>(
      `/scans/uploads/${scanId}/complete`,
    );
    return res.data;
  } catch (err) {
    throw Object.assign(err instanceof Error ? err : new Error('Ghép file thất bại'), { scanId });
  }
}

export async function deleteScan(id: number | string): Promise<void> {
  await api.delete(`/scans/${id}/`);
}

/**
 * Tải PNG lát cắt thứ `index` dưới dạng blob.
 *
 * KHÔNG dùng `<img src="/api/scans/.../preview/n/">` trực tiếp — endpoint yêu cầu
 * JWT (`IsActiveUser`), mà một thẻ `<img>` thuần không gắn được header
 * `Authorization`. Phải đi qua axios (có interceptor gắn Bearer token, xem `api.ts`)
 * rồi tự dựng object URL từ blob nhận về.
 */
export async function fetchScanPreviewBlob(id: number | string, index: number): Promise<Blob> {
  const res = await api.get<Blob>(`/scans/${id}/preview/${index}/`, { responseType: 'blob' });
  return res.data;
}

/** Yêu cầu mở phim trong 3D Slicer — phát một vé dùng-một-lần, sống 5 phút. */
export async function openScanToken(id: number | string): Promise<OpenTokenResponse> {
  const res = await api.post<OpenTokenResponse>(`/scans/${id}/open-token/`);
  return res.data;
}

/**
 * URL tải ZIP trực tiếp bằng token đã có (từ `openScanToken`) — dùng cho nút dự
 * phòng "Tải file ZIP về máy" khi `dentai://` không mở được (PLAN_3D_CANINE.md
 * §5.1). Endpoint không cần JWT — token TỰ LÀ xác thực, nên dùng được như `<a href>`
 * thuần, không cần đi qua axios/blob như preview.
 */
export function scanDownloadUrl(token: string): string {
  return `/api/scans/download/${token}/`;
}

export async function fetchScanLogs(id: number | string): Promise<ActivityLog[]> {
  const res = await api.get<ActivityLog[]>(`/scans/${id}/logs/`);
  return res.data;
}

export async function fetchSegmentations(id: number | string): Promise<Segmentation[]> {
  const res = await api.get<Segmentation[]>(`/scans/${id}/segmentations/`);
  return res.data;
}

export function segmentationFileUrl(id: number | string): string {
  return `/api/segmentations/${id}/file/`;
}

// ── Nhãn hiển thị dùng chung ─────────────────────────────────────────────────

export const SCAN_STATUS_LABEL: Record<ScanStatus, string> = {
  uploading: 'Đang tải lên',
  processing: 'Đang xử lý',
  ready: 'Sẵn sàng',
  failed: 'Lỗi',
};

export const SCAN_STATUS_CLASS: Record<ScanStatus, string> = {
  uploading: 'bg-gray-50 text-gray-500 border-gray-200',
  processing: 'bg-blue-50 text-blue-600 border-blue-200',
  ready: 'bg-green-50 text-green-700 border-green-200',
  failed: 'bg-red-50 text-red-600 border-red-200',
};

/** `1234567` → `"1.18 MB"`. */
export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}
