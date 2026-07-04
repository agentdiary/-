// 后端 API 客户端。客户端不做任何模型逻辑,不直接调用 LLM(密钥安全红线)。
// 真机(iPad Expo Go)访问时必须用电脑的局域网 IP,通过 .env 配置:
//   EXPO_PUBLIC_API_URL=http://192.168.x.x:8000

import type { AvatarReply, ChatHistoryItem, DiaryEntry } from './types';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API ${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listDiaries: () => request<DiaryEntry[]>('/diaries'),

  createDiary: (content: string) =>
    request<DiaryEntry>('/diaries', {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  // 删除日记会在后端级联删除衍生的对话对与人格卡片(隐私红线)
  deleteDiary: (id: string) =>
    request<{ deleted: string }>(`/diaries/${id}`, { method: 'DELETE' }),

  // 与自己的化身对话;历史与上下文由后端持久化并组装
  sendToAvatar: (message: string) =>
    request<AvatarReply>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  // 拉取聊天历史(旧→新),App 启动时恢复会话
  getChatHistory: () => request<ChatHistoryItem[]>('/chat/history'),
};
