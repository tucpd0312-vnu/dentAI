import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// Ensure every request URL ends with "/" so Django's APPEND_SLASH redirect
// never fires on POST (which would lose the request body).
api.interceptors.request.use(config => {
  if (config.url && !config.url.match(/[?#]/) && !config.url.endsWith('/')) {
    config.url = config.url + '/';
  }
  return config;
});

export default api;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Detection {
  id: number;
  source: "ai" | "doctor";
  is_deleted: boolean;
  tooth_fdi: string;
  mgi_level: number;
  x_center: number;
  y_center: number;
  width: number;
  height: number;
  match_score: number | null;
}

export interface Mask {
  id: number;
  tooth_fdi: string;
  polygon: number[][];
  class_id: number;
}

export interface Caption {
  ai_text: string;
  edited_text: string | null;
  is_edited: boolean;
  updated_at: string;
}

/** Quyền của người đang đăng nhập trên một ca. */
export type CasePermission = "admin" | "owner" | "edit" | "view" | "none";

export interface ImageResult {
  id: number;
  order_index: number;
  status: "queued" | "processing" | "done" | "low_confidence" | "failed";
  is_low_confidence: boolean;
  original_path: string;
  annotated_path: string;
  width: number;
  height: number;
  detections: Detection[];
  masks: Mask[];
  caption: Caption | null;
  created_at: string;
  case_permission: CasePermission;
  /** Backend đã tính sẵn — dùng để ẩn nút Chỉnh sửa. Backend vẫn chặn độc lập. */
  can_edit: boolean;
}

export interface CaseStatus {
  id: number;
  status: "processing" | "done" | "failed";
  images: { id: number; order_index: number; status: string; is_low_confidence: boolean }[];
}

export interface CreateCaseResponse {
  id: number;
  status: "processing" | "done" | "failed";
}

export interface CaseOwner {
  id: number;
  username: string;
  full_name: string;
  role: "admin" | "doctor" | "patient" | "receptionist";
}

export interface CaseListItem {
  id: number;
  patient: {
    id: number;
    name: string;
    patient_code: string;
    notes: string | null;
    created_at: string;
  };
  status: "processing" | "done" | "failed";
  image_count: number;
  created_at: string;
  updated_at: string;
  /** null với ca tạo trước khi có hệ thống tài khoản. */
  owner: CaseOwner | null;
  permission: CasePermission;
  is_shared_with_me: boolean;
}
