import api from './api';
import type { Role } from './auth';

export interface BoundingBox {
  x: number;       // relative 0-1
  y: number;       // relative 0-1
  width: number;   // relative 0-1
  height: number;  // relative 0-1
  label?: string;
}

export interface QAMessage {
  id: number;
  session: number;
  sender: {
    id: number;
    username: string;
    email: string;
    full_name: string;
    role: Role;
  };
  content: string;
  bounding_box: BoundingBox | null;
  box_comment: string;
  created_at: string;
}

export interface QAShareItem {
  id: number;
  session: number;
  shared_with: {
    id: number;
    username: string;
    email: string;
    full_name: string;
    role: Role;
  };
  shared_by: {
    id: number;
    username: string;
    full_name: string;
    role: Role;
  } | null;
  can_reply: boolean;
  created_at: string;
}

export interface QASessionListItem {
  id: number;
  title: string;
  created_by: {
    id: number;
    username: string;
    email: string;
    full_name: string;
    role: Role;
  };
  case: number | null;
  image: number | null;
  image_url: string;
  status: 'open' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  messages_count: number;
  latest_message?: {
    content: string;
    sender_name: string;
    sender_role: Role;
    created_at: string;
    has_box: boolean;
  } | null;
  is_owner: boolean;
  shared_with_count: number;
}

export interface QASessionDetail {
  id: number;
  title: string;
  created_by: {
    id: number;
    username: string;
    email: string;
    full_name: string;
    role: Role;
  };
  case: number | null;
  image: number | null;
  image_url: string;
  status: 'open' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  messages: QAMessage[];
  shares: QAShareItem[];
  is_owner: boolean;
}

export interface CreateSessionPayload {
  title: string;
  case?: number | null;
  image?: number | null;
  image_url?: string;
  initial_content?: string;
  bounding_box?: BoundingBox | null;
  box_comment?: string;
  share_with_user_ids?: number[];
}

export interface SendMessagePayload {
  content: string;
  bounding_box?: BoundingBox | null;
  box_comment?: string;
}

export const qaApi = {
  getSessions: async (params?: { scope?: string; q?: string; status?: string }) => {
    const res = await api.get<QASessionListItem[]>('/qa/sessions/', { params });
    return res.data;
  },

  getSession: async (id: number) => {
    const res = await api.get<QASessionDetail>(`/qa/sessions/${id}/`);
    return res.data;
  },

  createSession: async (data: CreateSessionPayload) => {
    const res = await api.post<QASessionDetail>('/qa/sessions/', data);
    return res.data;
  },

  updateSession: async (id: number, data: Partial<Pick<QASessionDetail, 'title' | 'status'>>) => {
    const res = await api.patch<QASessionDetail>(`/qa/sessions/${id}/`, data);
    return res.data;
  },

  deleteSession: async (id: number) => {
    await api.delete(`/qa/sessions/${id}/`);
  },

  sendMessage: async (sessionId: number, data: SendMessagePayload) => {
    const res = await api.post<QAMessage>(`/qa/sessions/${sessionId}/messages/`, data);
    return res.data;
  },

  shareSession: async (sessionId: number, userIds: number[]) => {
    const res = await api.post<QAShareItem[]>(`/qa/sessions/${sessionId}/share/`, { user_ids: userIds });
    return res.data;
  },

  unshareSession: async (sessionId: number, userId: number) => {
    await api.delete(`/qa/sessions/${sessionId}/share/${userId}/`);
  },
};
