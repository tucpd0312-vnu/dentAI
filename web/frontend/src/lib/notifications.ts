import api from './api';

export type NotificationKind = 'share' | 'processing' | 'role' | 'system';
export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

export interface UserNotification {
  id: number;
  kind: NotificationKind;
  level: NotificationLevel;
  title: string;
  message: string;
  link: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationInbox {
  unread_count: number;
  results: UserNotification[];
}

export async function fetchNotifications(limit = 20): Promise<NotificationInbox> {
  const response = await api.get<NotificationInbox>('/auth/notifications/', {
    params: { limit },
  });
  return response.data;
}

export async function markNotificationRead(id: number): Promise<UserNotification> {
  const response = await api.patch<UserNotification>(`/auth/notifications/${id}/read/`);
  return response.data;
}

export async function markAllNotificationsRead(): Promise<number> {
  const response = await api.post<{ updated: number }>('/auth/notifications/read-all/');
  return response.data.updated;
}
