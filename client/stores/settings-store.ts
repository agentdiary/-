import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import type { BackgroundSetting } from '@/lib/backgrounds';

const SETTINGS_KEY = 'agentdiary_appearance';

interface SettingsState {
  hydrated: boolean;
  diaryBg: BackgroundSetting;
  chatBg: BackgroundSetting;
  hydrate: () => Promise<void>;
  setDiaryBg: (bg: BackgroundSetting) => Promise<void>;
  setChatBg: (bg: BackgroundSetting) => Promise<void>;
}

const DEFAULT: BackgroundSetting = { kind: 'default' };

async function persist(diaryBg: BackgroundSetting, chatBg: BackgroundSetting) {
  await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify({ diaryBg, chatBg }));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  hydrated: false,
  diaryBg: DEFAULT,
  chatBg: DEFAULT,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({ diaryBg: parsed.diaryBg ?? DEFAULT, chatBg: parsed.chatBg ?? DEFAULT });
      }
    } catch {
      // 设置损坏时静默回落默认
    } finally {
      set({ hydrated: true });
    }
  },

  setDiaryBg: async (bg) => {
    set({ diaryBg: bg });
    await persist(bg, get().chatBg);
  },

  setChatBg: async (bg) => {
    set({ chatBg: bg });
    await persist(get().diaryBg, bg);
  },
}));
