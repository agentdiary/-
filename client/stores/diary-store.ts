import { create } from 'zustand';

import { api } from '@/lib/api';
import type { DiaryEntry } from '@/lib/types';

interface DiaryState {
  entries: DiaryEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  add: (content: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useDiaryStore = create<DiaryState>((set, get) => ({
  entries: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const entries = await api.listDiaries();
      set({ entries, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  add: async (content: string) => {
    const entry = await api.createDiary(content);
    set({ entries: [entry, ...get().entries] });
  },

  remove: async (id: string) => {
    await api.deleteDiary(id);
    set({ entries: get().entries.filter((e) => e.id !== id) });
  },
}));
