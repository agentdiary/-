import { kvDelete, kvGet, kvSet } from '@/lib/kv';
import { create } from 'zustand';

import { api, setAuthToken, setUnauthorizedHandler } from '@/lib/api';

const TOKEN_KEY = 'agentdiary_token';
const USERNAME_KEY = 'agentdiary_username';
const USER_ID_KEY = 'agentdiary_user_id';
const AVATAR_TS_KEY = 'agentdiary_avatar_ts';

interface AuthState {
  hydrated: boolean; // 是否已从 SecureStore 恢复
  token: string | null;
  username: string | null;
  userId: string | null;
  // 自己的头像时间戳(null = 没有自定义头像);兼作头像 URL 缓存指纹
  avatarTs: string | null;
  hydrate: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUsername: (username: string) => Promise<void>;
  setAvatarTs: (ts: string) => Promise<void>;
}

async function persist(token: string, username: string, userId: string, avatarTs: string | null) {
  await kvSet(TOKEN_KEY, token);
  await kvSet(USERNAME_KEY, username);
  await kvSet(USER_ID_KEY, userId);
  if (avatarTs) {
    await kvSet(AVATAR_TS_KEY, avatarTs);
  } else {
    await kvDelete(AVATAR_TS_KEY);
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  hydrated: false,
  token: null,
  username: null,
  userId: null,
  avatarTs: null,

  hydrate: async () => {
    try {
      const token = await kvGet(TOKEN_KEY);
      const username = await kvGet(USERNAME_KEY);
      const userId = await kvGet(USER_ID_KEY);
      const avatarTs = await kvGet(AVATAR_TS_KEY);
      setAuthToken(token);
      set({ token, username, userId, avatarTs, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  login: async (username, password) => {
    const res = await api.login(username, password);
    setAuthToken(res.token);
    await persist(res.token, res.username, res.user_id, res.avatar_updated_at);
    set({
      token: res.token,
      username: res.username,
      userId: res.user_id,
      avatarTs: res.avatar_updated_at,
    });
  },

  register: async (username, password) => {
    const res = await api.register(username, password);
    setAuthToken(res.token);
    await persist(res.token, res.username, res.user_id, res.avatar_updated_at);
    set({
      token: res.token,
      username: res.username,
      userId: res.user_id,
      avatarTs: res.avatar_updated_at,
    });
  },

  logout: async () => {
    // 尽力吊销服务端 token;离线时静默跳过,不阻塞本地登出
    await api.logout().catch(() => {});
    setAuthToken(null);
    await kvDelete(TOKEN_KEY);
    await kvDelete(USERNAME_KEY);
    await kvDelete(USER_ID_KEY);
    await kvDelete(AVATAR_TS_KEY);
    set({ token: null, username: null, userId: null, avatarTs: null });
  },

  setUsername: async (username) => {
    await kvSet(USERNAME_KEY, username);
    set({ username });
  },

  setAvatarTs: async (ts) => {
    await kvSet(AVATAR_TS_KEY, ts);
    set({ avatarTs: ts });
  },
}));

// 任何接口返回 401(token 失效/账号变动)→ 自动登出,守卫会跳回登录页
setUnauthorizedHandler(() => {
  const { token, logout } = useAuthStore.getState();
  if (token) {
    logout().catch(() => {});
  }
});
