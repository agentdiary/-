// 页面背景层:默认纯色 / 内置渐变 / 用户自定义图片。
// 自定义图片上加一层随配色方案的半透明遮罩,保证内容可读(Telegram 同款手法)。

import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { type BackgroundSetting, presetById } from '@/lib/backgrounds';

export function ScreenBackground({
  setting,
  children,
}: {
  setting: BackgroundSetting;
  children: ReactNode;
}) {
  const scheme = useColorScheme() ?? 'light';

  if (setting.kind === 'preset') {
    const preset = presetById(setting.id);
    if (preset) {
      return (
        <LinearGradient colors={preset[scheme]} style={styles.flex}>
          {children}
        </LinearGradient>
      );
    }
  }

  if (setting.kind === 'custom') {
    const scrim = scheme === 'dark' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
    return (
      <ImageBackground source={{ uri: setting.uri }} style={styles.flex} resizeMode="cover">
        <View style={[styles.flex, { backgroundColor: scrim }]}>{children}</View>
      </ImageBackground>
    );
  }

  return <ThemedView style={styles.flex}>{children}</ThemedView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
