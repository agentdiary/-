// 键值存储适配层:原生端走 SecureStore(加密),Web 端走 localStorage。
// SecureStore 在网页环境不可用,不做这层适配 Web 版会在启动时崩溃。

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

export async function kvGet(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function kvSet(key: string, value: string): Promise<void> {
  if (isWeb) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // 隐私模式等场景写不进去,静默降级为不持久
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function kvDelete(key: string): Promise<void> {
  if (isWeb) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // 同上
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
