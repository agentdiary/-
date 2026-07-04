// 与后端 server/app 各路由的传输类型保持一致

export type DiaryVisibility = 'public' | 'restricted' | 'private';

export interface DiaryEntry {
  id: string;
  content: string;
  visibility: DiaryVisibility;
  created_at: string; // ISO 8601
  updated_at: string;
}

export interface AuthResponse {
  token: string;
  user_id: string;
  username: string;
}

export interface UserSummary {
  id: string;
  username: string;
  card_count: number;
  is_builtin: boolean;
  status: string | null;
}

export interface ChatHistoryItem {
  id: string;
  role: 'user' | 'avatar';
  content: string;
  created_at: string;
}

export interface AvatarReply {
  id: string;
  content: string;
  created_at: string;
  // 回应引用了哪些人格卡片(可追溯性红线:卡片必须带出处)
  cited_card_ids: string[];
}

export interface PersonaCard {
  id: string;
  assertion: string;
  confidence: number; // 0~1
  source_diary_id: string;
  superseded_by: string | null;
  created_at: string;
}
