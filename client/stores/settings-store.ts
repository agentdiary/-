import { kvGet, kvSet } from '@/lib/kv';
import { create } from 'zustand';

import type { BackgroundSetting } from '@/lib/backgrounds';

const SETTINGS_KEY = 'agentdiary_appearance';

interface SettingsState {
  hydrated: boolean;
  // 私密日记手势锁图案("0-4-8" 点序;null = 未开启)。仅存本机。
  lockPattern: string | null;
  setLockPattern: (pattern: string | null) => Promise<void>;
  diaryBg: BackgroundSetting;
  chatBg: BackgroundSetting;
  hydrate: () => Promise<void>;
  setDiaryBg: (bg: BackgroundSetting) => Promise<void>;
  setChatBg: (bg: BackgroundSetting) => Promise<void>;
}

const DEFAULT: BackgroundSetting = { kind: 'default' };

async function persist(
  diaryBg: BackgroundSetting,
  chatBg: BackgroundSetting,
  lockPattern: string | null,
) {
  await kvSet(SETTINGS_KEY, JSON.stringify({ diaryBg, chatBg, lockPattern }));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  hydrated: false,
  diaryBg: DEFAULT,
  chatBg: DEFAULT,
  lockPattern: null,

  hydrate: async () => {
    try {
      const raw = await kvGet(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          diaryBg: parsed.diaryBg ?? DEFAULT,
          chatBg: parsed.chatBg ?? DEFAULT,
          lockPattern: parsed.lockPattern ?? null,
        });
      }
    } catch {
      // 设置损坏时静默回落默认
    } finally {
      set({ hydrated: true });
    }
  },

  setDiaryBg: async (bg) => {
    set({ diaryBg: bg });
    await persist(bg, get().chatBg, get().lockPattern);
  },

  setChatBg: async (bg) => {
    set({ chatBg: bg });
    await persist(get().diaryBg, bg, get().lockPattern);
  },

  setLockPattern: async (pattern) => {
    set({ lockPattern: pattern });
    await persist(get().diaryBg, get().chatBg, pattern);
  },
}));
