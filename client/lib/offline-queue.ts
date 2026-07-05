// 离线日记队列:断网时日记先落本地文件,恢复后由 diary-store 补传。
// 用 expo-file-system(APK 原生层已有),不引入新原生依赖。

import * as FileSystem from 'expo-file-system/legacy';

import type { DiaryVisibility } from './types';

const QUEUE_FILE = `${FileSystem.documentDirectory}pending-diaries.json`;
const CACHE_FILE = `${FileSystem.documentDirectory}diaries-cache.json`;

export interface PendingDiary {
  local_id: string;
  content: string;
  visibility: DiaryVisibility;
  allowed_user_ids: string[];
  created_at: string; // 本地落笔时间
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return fallback;
    return JSON.parse(await FileSystem.readAsStringAsync(path)) as T;
  } catch {
    return fallback;
  }
}

export const loadQueue = () => readJson<PendingDiary[]>(QUEUE_FILE, []);

export async function saveQueue(queue: PendingDiary[]) {
  await FileSystem.writeAsStringAsync(QUEUE_FILE, JSON.stringify(queue));
}

// 服务器日记列表的本地缓存:离线时也能翻看
export const loadCache = () => readJson<unknown[]>(CACHE_FILE, []);

export async function saveCache(entries: unknown[]) {
  try {
    await FileSystem.writeAsStringAsync(CACHE_FILE, JSON.stringify(entries));
  } catch {
    // 缓存写失败不影响主流程
  }
}
