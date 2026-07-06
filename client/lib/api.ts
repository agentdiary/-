// 后端 API 客户端。客户端不做任何模型逻辑,不直接调用 LLM(密钥安全红线)。
// 本机开发时 EXPO_PUBLIC_API_URL 用电脑局域网 IP;发布版走 ngrok 公网域名。

import type {
  AuthResponse,
  AvatarReply,
  ChatHistoryItem,
  DiaryEntry,
  DiaryVisibility,
  UserSummary,
} from './types';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // ngrok 免费域名对无此头的请求返回警告页 HTML 而非 JSON
    'ngrok-skip-browser-warning': '1',
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, { headers, ...init });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      // 非 JSON 错误体,保留状态码
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  register: (username: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  listUsers: () => request<UserSummary[]>('/users'),

  listDiaries: () => request<DiaryEntry[]>('/diaries'),

  createDiary: (
    content: string,
    visibility: DiaryVisibility = 'public',
    allowedUserIds: string[] = [],
  ) =>
    request<DiaryEntry>('/diaries', {
      method: 'POST',
      body: JSON.stringify({
        content,
        visibility,
        allowed_user_ids: allowedUserIds,
      }),
    }),

  setStatus: (status: string | null) =>
    request<{ status: string | null }>('/users/me/status', {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  getMyStatus: () => request<{ status: string | null }>('/users/me/status'),

  setDiaryVisibility: (id: string, visibility: DiaryVisibility, allowedUserIds?: string[]) =>
    request<DiaryEntry>(`/diaries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        visibility,
        allowed_user_ids: allowedUserIds ?? null,
      }),
    }),

  setDiaryLocked: (id: string, locked: boolean) =>
    request<DiaryEntry>(`/diaries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ locked }),
    }),

  // 修改日记内容(仅限落笔 24 小时内,后端强制校验)
  updateDiary: (id: string, content: string) =>
    request<DiaryEntry>(`/diaries/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  getDiaryAllowed: (id: string) =>
    request<{ allowed_user_ids: string[] }>(`/diaries/${id}/allowed`),

  // 删除日记会在后端级联删除衍生的对话对与人格卡片(隐私红线)
  deleteDiary: (id: string) =>
    request<{ deleted: string }>(`/diaries/${id}`, { method: 'DELETE' }),

  // targetUserId 不传 = 和自己的化身聊;传 = 访问该用户的化身
  sendToAgent: (message: string, targetUserId?: string) =>
    request<AvatarReply>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, target_user_id: targetUserId ?? null }),
    }),

  getChatHistory: (targetUserId?: string) =>
    request<ChatHistoryItem[]>(
      targetUserId ? `/chat/history?target_user_id=${targetUserId}` : '/chat/history',
    ),
};
