import { create } from 'zustand';

import { api, ApiError } from '@/lib/api';
import {
  loadCache,
  loadQueue,
  type PendingDiary,
  saveCache,
  saveQueue,
} from '@/lib/offline-queue';
import type { DiaryEntry, DiaryVisibility } from '@/lib/types';

interface DiaryState {
  entries: DiaryEntry[];
  pending: PendingDiary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  add: (
    content: string,
    visibility: DiaryVisibility,
    allowedUserIds: string[],
  ) => Promise<void>;
  setVisibility: (
    id: string,
    visibility: DiaryVisibility,
    allowedUserIds?: string[],
  ) => Promise<void>;
  cycleVisibility: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const isNetworkError = (e: unknown) => !(e instanceof ApiError);

export const useDiaryStore = create<DiaryState>((set, get) => ({
  entries: [],
  pending: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    let queue = await loadQueue();
    if (queue.length > 0) {
      const remaining: PendingDiary[] = [];
      for (const item of queue) {
        try {
          await api.createDiary(item.content, item.visibility, item.allowed_user_ids);
        } catch {
          remaining.push(item);
        }
      }
      queue = remaining;
      await saveQueue(queue);
    }
    try {
      const entries = await api.listDiaries();
      await saveCache(entries);
      set({ entries, pending: queue, loading: false });
    } catch {
      const cached = (await loadCache()) as DiaryEntry[];
      set({
        entries: cached,
        pending: queue,
        loading: false,
        error: '当前离线，展示的是本地缓存；新日记会先存在本机，联网后自动同步。',
      });
    }
  },

  add: async (content, visibility, allowedUserIds) => {
    try {
      const entry = await api.createDiary(content, visibility, allowedUserIds);
      set({ entries: [entry, ...get().entries] });
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      const item: PendingDiary = {
        local_id: `local-${Date.now()}`,
        content,
        visibility,
        allowed_user_ids: allowedUserIds,
        created_at: new Date().toISOString(),
      };
      const queue = [...get().pending, item];
      await saveQueue(queue);
      set({ pending: queue });
    }
  },

  setVisibility: async (id, visibility, allowedUserIds) => {
    if (id.startsWith('local-')) {
      const queue = get().pending.map((p) =>
        p.local_id === id
          ? {
              ...p,
              visibility,
              allowed_user_ids:
                visibility === 'restricted' ? (allowedUserIds ?? p.allowed_user_ids) : [],
            }
          : p,
      );
      await saveQueue(queue);
      set({ pending: queue });
      return;
    }

    const updated = await api.setDiaryVisibility(id, visibility, allowedUserIds);
    const entries = get().entries.map((e) => (e.id === id ? updated : e));
    await saveCache(entries);
    set({ entries });
  },

  cycleVisibility: async (id: string) => {
    const entry = get().entries.find((e) => e.id === id);
    if (!entry) return;
    const order: DiaryVisibility[] = ['public', 'restricted', 'private'];
    const next = order[(order.indexOf(entry.visibility) + 1) % order.length];
    await get().setVisibility(id, next);
  },

  remove: async (id: string) => {
    if (id.startsWith('local-')) {
      const queue = get().pending.filter((p) => p.local_id !== id);
      await saveQueue(queue);
      set({ pending: queue });
      return;
    }
    await api.deleteDiary(id);
    const entries = get().entries.filter((e) => e.id !== id);
    await saveCache(entries);
    set({ entries });
  },
}));
