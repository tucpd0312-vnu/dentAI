import api from './api';
import type { Role } from './auth';
import type { Paginated } from './users';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AssetStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export type DataType =
  | 'dicom'
  | 'dicom_series'
  | 'intraoral'
  | 'panoramic'
  | 'cephalometric'
  | 'periapical'
  | 'face_photo'
  | 'document'
  | 'other';

export type Gender = 'male' | 'female' | 'other';

export interface DataCategory {
  id: number;
  name: string;
  slug: string;
  /** Danh mục hệ thống — không sửa/xoá được. */
  is_builtin: boolean;
  asset_count?: number;
  created_at: string;
}

export interface AssetPatient {
  id: number;
  name: string;
  patient_code: string;
  notes: string | null;
  gender: Gender | '';
  gender_display: string;
  birth_year: number | null;
  /** Suy từ `birth_year` lúc đọc — backend không lưu tuổi, xem Patient.birth_year. */
  age: number | null;
  created_at: string;
}

export interface AssetUploader {
  id: number;
  username: string;
  full_name: string;
  role: Role;
}

/** Quyền của người đang đăng nhập trên một mục dữ liệu. */
export type AssetPermission = 'admin' | 'owner' | 'edit' | 'view' | 'none';

export interface DataAsset {
  id: number;
  title: string;
  /**
   * null khi tư liệu không gắn bệnh nhân **hoặc** khi người xem không được đọc PHI
   * (vai trò bệnh nhân) — backend cắt hẳn field, không chỉ ẩn ở giao diện.
   * Trang chi tiết dùng `can_see_patient_info` để phân biệt hai trường hợp.
   */
  patient: AssetPatient | null;
  /** Cùng nhóm PHI với `patient` ⇒ vắng mặt hẳn trong response của bệnh nhân. */
  condition_note?: string;
  category: number;
  category_name: string;
  data_type: DataType;
  /** Nhãn hiển thị đã tính sẵn — với `other` là tên người dùng tự nhập. */
  data_type_display: string;
  status: AssetStatus;
  status_display: string;
  file_size: number;
  original_filename: string;
  preview_count: number;
  uploaded_by: AssetUploader | null;
  permission: AssetPermission;
  can_edit: boolean;
  created_at: string;
  updated_at: string;
}

export interface DataAssetDetail extends DataAsset {
  data_type_other: string;
  visibility: 'private' | 'shared';
  mime_type: string;
  is_anonymized: boolean;
  error_message: string;
  can_see_patient_info: boolean;
  /** Nguồn gốc khi tư liệu đến từ module khác; null với dữ liệu tải thẳng lên kho. */
  source: { kind: 'scan'; id: number } | { kind: 'case'; id: number; image_id: number | null } | null;
}

export interface AssetFilters {
  q?: string;
  category?: number;
  data_type?: DataType | '';
  uploaded_by?: number;
  /** Tab "Của tôi" / "Được chia sẻ" — với admin đây là cách lọc ra phần của mình. */
  mine?: boolean;
  shared?: boolean;
  page?: number;
}

export interface UploadAssetPayload {
  title: string;
  categoryId: number;
  dataType: DataType;
  dataTypeOther?: string;
  /** Chỉ bác sĩ/admin gửi được — backend bỏ qua nếu người gửi là bệnh nhân. */
  patientName?: string;
  patientCode?: string;
  birthYear?: number;
  gender?: Gender | '';
  conditionNote?: string;
  file: File;
}

// ── Nhãn hiển thị dùng chung ─────────────────────────────────────────────────

export const DATA_TYPE_LABEL: Record<DataType, string> = {
  dicom: 'DICOM (một file)',
  dicom_series: 'Chuỗi DICOM (ZIP)',
  intraoral: 'Ảnh trong miệng',
  panoramic: 'Ảnh toàn cảnh (Pano)',
  cephalometric: 'Ảnh sọ nghiêng (Cephalo)',
  periapical: 'Phim quanh chóp',
  face_photo: 'Ảnh mặt ngoài',
  document: 'Tài liệu / báo cáo',
  other: 'Khác',
};

export const DATA_TYPE_ICON: Record<DataType, string> = {
  dicom: 'radiology',
  dicom_series: 'folder_zip',
  intraoral: 'dentistry',
  panoramic: 'panorama_wide_angle',
  cephalometric: 'accessibility_new',
  periapical: 'radiology',
  face_photo: 'face',
  document: 'description',
  other: 'draft',
};

/**
 * Đuôi file hợp lệ theo từng loại dữ liệu — PHẢI khớp `ALLOWED_EXTENSIONS` ở
 * `apps/library/serializers.py`. Đây chỉ là kiểm tra sớm cho trải nghiệm; backend
 * validate lại và mới là chốt chặn thật.
 */
export const DATA_TYPE_EXTENSIONS: Record<DataType, string[]> = {
  dicom: ['.dcm'],
  dicom_series: ['.zip'],
  intraoral: ['.jpg', '.jpeg', '.png'],
  panoramic: ['.jpg', '.jpeg', '.png'],
  cephalometric: ['.jpg', '.jpeg', '.png'],
  periapical: ['.jpg', '.jpeg', '.png'],
  face_photo: ['.jpg', '.jpeg', '.png'],
  document: ['.pdf', '.docx'],
  other: [
    '.dcm', '.zip', '.jpg', '.jpeg', '.png', '.pdf', '.docx',
    '.tif', '.tiff', '.bmp', '.stl', '.ply', '.obj', '.csv', '.txt',
  ],
};

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  uploading: 'Đang tải lên',
  processing: 'Đang xử lý',
  ready: 'Sẵn sàng',
  failed: 'Lỗi',
};

export const ASSET_STATUS_CLASS: Record<AssetStatus, string> = {
  uploading: 'bg-gray-50 text-gray-500 border-gray-200',
  processing: 'bg-blue-50 text-blue-600 border-blue-200',
  ready: 'bg-green-50 text-green-700 border-green-200',
  failed: 'bg-red-50 text-red-600 border-red-200',
};

export const GENDER_LABEL: Record<Gender, string> = {
  male: 'Nam',
  female: 'Nữ',
  other: 'Khác',
};

/** Trần dung lượng một mục dữ liệu — khớp `LIBRARY_MAX_ASSET_SIZE` ở backend. */
export const MAX_ASSET_SIZE = 2 * 1024 * 1024 * 1024;

/** Đuôi file (viết thường, có dấu chấm) của một `File`. */
export function fileExtension(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot === -1 ? '' : file.name.slice(dot).toLowerCase();
}

// ── API ───────────────────────────────────────────────────────────────────────

export async function fetchCategories(): Promise<DataCategory[]> {
  const res = await api.get<DataCategory[]>('/library/categories/');
  return res.data;
}

/**
 * Tạo danh mục mới. Backend chuẩn hoá tên và **trả về danh mục đã có** (200) nếu
 * trùng tên không phân biệt hoa/thường — nên chỗ gọi cứ dùng `id` trả về, không cần
 * tự dò trùng.
 */
export async function createCategory(name: string): Promise<DataCategory> {
  const res = await api.post<DataCategory>('/library/categories/', { name });
  return res.data;
}

export async function fetchAssets(filters: AssetFilters = {}): Promise<Paginated<DataAsset>> {
  const params: Record<string, string | number> = {};
  if (filters.q) params.q = filters.q;
  if (filters.category) params.category = filters.category;
  if (filters.data_type) params.data_type = filters.data_type;
  if (filters.uploaded_by) params.uploaded_by = filters.uploaded_by;
  if (filters.mine) params.mine = 1;
  if (filters.shared) params.shared = 1;
  if (filters.page && filters.page > 1) params.page = filters.page;

  const res = await api.get<Paginated<DataAsset>>('/library/assets/', { params });
  return res.data;
}

export async function fetchAsset(id: number | string): Promise<DataAssetDetail> {
  const res = await api.get<DataAssetDetail>(`/library/assets/${id}/`);
  return res.data;
}

export async function fetchAssetStatus(
  id: number | string,
): Promise<{ id: number; status: AssetStatus; preview_count: number; error_message: string }> {
  const res = await api.get(`/library/assets/${id}/status/`);
  return res.data;
}

export interface UpdateAssetPatch {
  title?: string;
  category?: number;
  data_type_other?: string;
  condition_note?: string;
}

export async function updateAsset(
  id: number | string,
  patch: UpdateAssetPatch,
): Promise<DataAssetDetail> {
  const res = await api.patch<DataAssetDetail>(`/library/assets/${id}/`, patch);
  return res.data;
}

export async function deleteAsset(id: number | string): Promise<void> {
  await api.delete(`/library/assets/${id}/`);
}

const CHUNK_RETRY_LIMIT = 3;

interface UploadInitResponse {
  asset_id: number;
  chunk_size: number;
  total_chunks: number;
}

interface UploadStatusResponse {
  received_chunks: number[];
  total_chunks: number;
  chunk_size: number;
}

/**
 * Tải một mục dữ liệu lên kho theo chunk — sao đúng khuôn `uploadScan` (`lib/scans.ts`)
 * vì cùng đi qua Cloudflare Tunnel giới hạn cứng 100MB/request. Ảnh JPG 2MB vẫn đi
 * đường này nhưng chỉ tốn đúng 1 chunk, không phải viết hai luồng.
 *
 * `onProgress` nhận % tính theo **tổng byte thật** đã gửi (kể cả chunk đang dở), không
 * theo số chunk xong — thanh tiến trình mới mượt với file vài trăm MB.
 *
 * Lỗi giữa chừng: exception được gắn thêm `assetId`; gọi lại với `resumeAssetId` đó
 * sẽ chỉ gửi nốt phần còn thiếu thay vì tạo mục mới.
 */
export async function uploadAsset(
  payload: UploadAssetPayload,
  onProgress?: (percent: number) => void,
  resumeAssetId?: number,
): Promise<{ id: number; status: AssetStatus }> {
  const file = payload.file;
  let assetId: number;
  let chunkSize: number;
  let totalChunks: number;
  let received: Set<number>;

  if (resumeAssetId) {
    const res = await api.get<UploadStatusResponse>(`/library/assets/uploads/${resumeAssetId}`);
    assetId = resumeAssetId;
    chunkSize = res.data.chunk_size;
    totalChunks = res.data.total_chunks;
    received = new Set(res.data.received_chunks);
  } else {
    const res = await api.post<UploadInitResponse>('/library/assets/uploads', {
      title: payload.title,
      category: payload.categoryId,
      data_type: payload.dataType,
      data_type_other: payload.dataTypeOther ?? '',
      patient_name: payload.patientName ?? '',
      patient_code: payload.patientCode ?? '',
      birth_year: payload.birthYear ?? null,
      gender: payload.gender ?? '',
      condition_note: payload.conditionNote ?? '',
      filename: file.name,
      total_size: file.size,
    });
    assetId = res.data.asset_id;
    chunkSize = res.data.chunk_size;
    totalChunks = res.data.total_chunks;
    received = new Set();
  }

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
        await api.put(`/library/assets/uploads/${assetId}/${index}`, blob, {
          headers: { 'Content-Type': 'application/octet-stream' },
          onUploadProgress: evt => reportProgress(evt.loaded),
        });
        break;
      } catch (err) {
        attempt += 1;
        if (attempt >= CHUNK_RETRY_LIMIT) {
          throw Object.assign(err instanceof Error ? err : new Error('Gửi chunk thất bại'), {
            assetId,
          });
        }
      }
    }
    confirmedBytes += end - start;
    reportProgress(0);
  }

  try {
    const res = await api.post<{ id: number; status: AssetStatus }>(
      `/library/assets/uploads/${assetId}/complete`,
    );
    return res.data;
  } catch (err) {
    throw Object.assign(err instanceof Error ? err : new Error('Ghép file thất bại'), {
      assetId,
    });
  }
}

/**
 * Tải PNG xem trước thứ `index` dưới dạng blob.
 *
 * KHÔNG dùng `<img src="/api/library/...">` trực tiếp — endpoint đòi JWT mà thẻ `<img>`
 * thuần không gắn được header `Authorization`. Cùng lý do với `fetchScanPreviewBlob`.
 */
export async function fetchAssetPreviewBlob(
  id: number | string,
  index: number,
): Promise<Blob> {
  const res = await api.get<Blob>(`/library/assets/${id}/preview/${index}/`, {
    responseType: 'blob',
  });
  return res.data;
}

/** Ảnh nhỏ cho bảng danh sách — nhẹ hơn nhiều so với preview 512px. */
export async function fetchAssetThumbnailBlob(id: number | string): Promise<Blob> {
  const res = await api.get<Blob>(`/library/assets/${id}/thumbnail/`, {
    responseType: 'blob',
  });
  return res.data;
}

/**
 * Tải file gốc về máy.
 *
 * Endpoint đòi JWT nên KHÔNG thể để `<a href>` thuần (khác `scanDownloadUrl`, nơi token
 * trong URL tự là xác thực). Phải qua axios rồi dựng object URL và click một thẻ `<a>`
 * tạm — đây là cách duy nhất giữ được cả header Authorization lẫn tên file gốc.
 */
export async function downloadAsset(asset: Pick<DataAsset, 'id' | 'original_filename'>): Promise<void> {
  const res = await api.get<Blob>(`/library/assets/${asset.id}/download/`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = asset.original_filename || `asset_${asset.id}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Thu hồi ngay sau khi trình duyệt đã nhận lệnh tải — giữ lại là rò rỉ bộ nhớ.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
