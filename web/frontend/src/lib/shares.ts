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