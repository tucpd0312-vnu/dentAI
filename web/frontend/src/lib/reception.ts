import api from '@/lib/api';

export const ASSIGNMENT_WORKBOOK_ACCEPT =
  '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
export const ASSIGNMENT_WORKBOOK_MAX_SIZE = 10 * 1024 * 1024;

export interface AssignmentWorkbook {
  id: number;
  original_filename: string;
  file_size: number;
  created_at: string;
}

interface LatestAssignmentWorkbookResponse {
  latest: AssignmentWorkbook | null;
}

export async function fetchLatestAssignmentWorkbook(): Promise<AssignmentWorkbook | null> {
  const response = await api.get<LatestAssignmentWorkbookResponse>(
    '/reception/assignments/latest/'
  );
  return response.data.latest;
}

export async function uploadAssignmentWorkbook(file: File): Promise<AssignmentWorkbook> {
  const body = new FormData();
  body.append('file', file);
  const response = await api.post<AssignmentWorkbook>('/reception/assignments/', body, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export function assignmentUploadError(error: unknown): string {
  const data = (
    error as { response?: { data?: { file?: string | string[]; detail?: string } } }
  ).response?.data;
  if (Array.isArray(data?.file)) return data.file[0] || 'Không thể tải file lên.';
  return data?.file || data?.detail || 'Không thể tải file lên. Vui lòng thử lại.';
}
