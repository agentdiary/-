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
  pending: PendingDiary[]; // 断网时写的,待同步
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  add: (
    content: string,
    visibility: DiaryVisibility,
    allowedUserIds: string[],
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

// 网络层失败(断网/超时)才离线排队;服务器 4xx 是业务错误,照常抛出
const isNetworkError = (e: unknown) => !(e instanceof ApiError);

export const useDiaryStore = create<DiaryState>((set, get) => ({
  entries: [],
  pending: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    // 先尝试补传离线队列
    let queue = await loadQueue();
    if (queue.length > 0) {
      const remaining: PendingDiary[] = [];
      for (const item of queue) {
        try {
          await api.createDiary(item.content, item.visibility, item.allowed_user_ids);
        } catch {
          remaining.push(item); // 仍失败的留在队列
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
      // 离线:用本地缓存顶上
      const cached = (await loadCache()) as DiaryEntry[];
      set({
        entries: cached,
        pending: queue,
        loading: false,
        error: '当前离线,展示的是本地缓存;新日记会先存在本机,联网后自动同步。',
      });
    }
  },

  add: async (content, visibility, allowedUserIds) => {
    try {
      const entry = await api.createDiary(content, visibility, allowedUserIds);
      set({ entries: [entry, ...get().entries] });
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      // 断网:落本地队列,联网后 refresh 时补传
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

  remove: async (id: string) => {
    // 未同步的本地日记直接从队列删
    if (id.startsWith('local-')) {
      const queue = get().pending.filter((p) => p.local_id !== id);
      await saveQueue(queue);
      set({ pending: queue });
      return;
    }
    await api.deleteDiary(id);
    set({ entries: get().entries.filter((e) => e.id !== id) });
  },
}));
