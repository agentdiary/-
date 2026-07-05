import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { api, setAuthToken } from '@/lib/api';

const TOKEN_KEY = 'agentdiary_token';
const USERNAME_KEY = 'agentdiary_username';
const USER_ID_KEY = 'agentdiary_user_id';

interface AuthState {
  hydrated: boolean; // 是否已从 SecureStore 恢复
  token: string | null;
  username: string | null;
  userId: string | null;
  hydrate: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

async function persist(token: string, username: string, userId: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USERNAME_KEY, username);
  await SecureStore.setItemAsync(USER_ID_KEY, userId);
}

export const useAuthStore = create<AuthState>((set) => ({
  hydrated: false,
  token: null,
  username: null,
  userId: null,

  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const username = await SecureStore.getItemAsync(USERNAME_KEY);
      const userId = await SecureStore.getItemAsync(USER_ID_KEY);
      setAuthToken(token);
      set({ token, username, userId, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  login: async (username, password) => {
    const res = await api.login(username, password);
    setAuthToken(res.token);
    await persist(res.token, res.username, res.user_id);
    set({ token: res.token, username: res.username, userId: res.user_id });
  },

  register: async (username, password) => {
    const res = await api.register(username, password);
    setAuthToken(res.token);
    await persist(res.token, res.username, res.user_id);
    set({ token: res.token, username: res.username, userId: res.user_id });
  },

  logout: async () => {
    // 尽力吊销服务端 token;离线时静默跳过,不阻塞本地登出
    await api.logout().catch(() => {});
    setAuthToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USERNAME_KEY);
    await SecureStore.deleteItemAsync(USER_ID_KEY);
    set({ token: null, username: null, userId: null });
  },
}));
