import api from './api';
import type { CaseListItem } from './api';
import type { Role } from './auth';

export type SharePermission = 'view' | 'edit';

export interface CaseShare {
  id: number;
  case: number;
  shared_with: number;
  shared_with_username: string;
  shared_with_full_name: string;
  shared_with_role: Role;
  shared_by_username: string | null;
  permission: SharePermission;
  permission_display: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface ScanShare {
  id: number;
  scan: number;
  shared_with: number;
  shared_with_username: string;
  shared_with_full_name: string;
  shared_with_role: Role;
  shared_by_username: string | null;
  permission: SharePermission;
  permission_display: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export const PERMISSION_LABEL: Record<SharePermission, string> = {
  view: 'Chỉ xem',
  edit: 'Xem và sửa',
};

export async function fetchShares(caseId: number | string): Promise<CaseShare[]> {
  const res = await api.get<CaseShare[]>(`/cases/${caseId}/shares/`);
  return res.data;
}

export async function createShare(
  caseId: number | string,
  userId: number,
  permission: SharePermission,
  note = '',
): Promise<CaseShare> {
  const res = await api.post<CaseShare>(`/cases/${caseId}/shares/`, {
    user_id: userId,
    permission,
    note,
  });
  return res.data;
}

export async function updateShare(
  shareId: number,
  permission: SharePermission,
): Promise<CaseShare> {
  const res = await api.patch<CaseShare>(`/shares/${shareId}/`, { permission });
  return res.data;
}

export async function deleteShare(shareId: number): Promise<void> {
  await api.delete(`/shares/${shareId}/`);
}

export async function fetchSharedWithMe(): Promise<CaseListItem[]> {
  const res = await api.get<CaseListItem[]>('/cases/shared-with-me/');
  return res.data;
}

export async function fetchScanShares(scanId: number | string): Promise<ScanShare[]> {
  const res = await api.get<ScanShare[]>(`/scans/${scanId}/shares/`);
  return res.data;
}

export async function createScanShare(
  scanId: number | string,
  userId: number,
  permission: SharePermission,
  note = '',
): Promise<ScanShare> {
  const res = await api.post<ScanShare>(`/scans/${scanId}/shares/`, {
    user_id: userId,
    permission,
    note,
  });
  return res.data;
}

export async function updateScanShare(
  shareId: number,
  permission: SharePermission,
): Promise<ScanShare> {
  const res = await api.patch<ScanShare>(`/scan-shares/${shareId}/`, { permission });
  return res.data;
}

export async function deleteScanShare(shareId: number): Promise<void> {
  await api.delete(`/scan-shares/${shareId}/`);
}
