import { create } from 'zustand';

import { api } from '@/lib/api';

export interface ChatMessage {
  id: string;
  text: string;
  from: 'me' | 'avatar';
}

interface ChatState {
  // 倒序存储(最新在前),配合 inverted FlatList
  messages: ChatMessage[];
  sending: boolean;
  error: string | null;
  // 从后端恢复聊天历史(App 启动/回到页面时调用)
  load: () => Promise<void>;
  send: (text: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sending: false,
  error: null,

  load: async () => {
    try {
      const items = await api.getChatHistory();
      set({
        messages: items
          .map((i) => ({
            id: i.id,
            text: i.content,
            from: i.role === 'user' ? ('me' as const) : ('avatar' as const),
          }))
          .reverse(),
        error: null,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  send: async (text: string) => {
    const userMsg: ChatMessage = { id: `me-${Date.now()}`, text, from: 'me' };
    set({ messages: [userMsg, ...get().messages], sending: true, error: null });

    try {
      const reply = await api.sendToAvatar(text);
      const avatarMsg: ChatMessage = { id: reply.id, text: reply.content, from: 'avatar' };
      set({ messages: [avatarMsg, ...get().messages], sending: false });
    } catch (e) {
      set({ sending: false, error: String(e) });
    }
  },
}));
