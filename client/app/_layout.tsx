import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { hydrated, hydrate } = useAuthStore();
  const hydrateSettings = useSettingsStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
    hydrateSettings();
  }, [hydrate, hydrateSettings]);

  // 等 SecureStore 恢复登录态,避免闪一下登录页
  if (!hydrated) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen
          name="diary-editor"
          options={{ presentation: 'modal', title: '写日记' }}
        />
        <Stack.Screen
          name="appearance"
          options={{ presentation: 'modal', title: '外观' }}
        />
        <Stack.Screen
          name="status-editor"
          options={{ presentation: 'modal', title: '今日状态' }}
        />
        <Stack.Screen
          name="visibility-picker"
          options={{ presentation: 'modal', title: '指定可见的人' }}
        />
        <Stack.Screen
          name="pattern-setup"
          options={{ presentation: 'modal', title: '手势锁' }}
        />
        <Stack.Screen name="visit/[userId]" options={{ title: '' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}
