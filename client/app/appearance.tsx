import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { BACKGROUND_PRESETS, type BackgroundSetting } from '@/lib/backgrounds';
import { useSettingsStore } from '@/stores/settings-store';

function sameSetting(a: BackgroundSetting, b: BackgroundSetting): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'preset' && b.kind === 'preset') return a.id === b.id;
  if (a.kind === 'custom' && b.kind === 'custom') return a.uri === b.uri;
  return true;
}

// 选中的图片拷进应用文档目录,避免相册缓存被系统清理后背景失效
async function pickAndStoreImage(slot: 'diary' | 'chat'): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
  });
  if (result.canceled || !result.assets[0]) return null;
  const src = result.assets[0].uri;
  const ext = src.split('.').pop()?.split('?')[0] || 'jpg';
  const dest = `${FileSystem.documentDirectory}bg-${slot}.${ext}`;
  await FileSystem.copyAsync({ from: src, to: dest });
  // 加时间戳参数绕过 Image 缓存(同名文件更新后不刷新)
  return `${dest}?t=${Date.now()}`;
}

function BackgroundPicker({
  title,
  value,
  onChange,
  slot,
}: {
  title: string;
  value: BackgroundSetting;
  onChange: (bg: BackgroundSetting) => void;
  slot: 'diary' | 'chat';
}) {
  const scheme = useColorScheme() ?? 'light';
  const tint = Colors[scheme].tint;
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await pickAndStoreImage(slot);
      if (uri) onChange({ kind: 'custom', uri });
    } catch (e) {
      Alert.alert('选图失败', String(e));
    } finally {
      setBusy(false);
    }
  };

  const ring = (selected: boolean) => [
    styles.swatchRing,
    selected && { borderColor: tint },
  ];

  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {/* 默认 */}
        <Pressable style={ring(value.kind === 'default')} onPress={() => onChange({ kind: 'default' })}>
          <View style={[styles.swatch, { backgroundColor: Colors[scheme].background }]}>
            <ThemedText style={styles.swatchLabel}>默认</ThemedText>
          </View>
        </Pressable>
        {/* 预设渐变 */}
        {BACKGROUND_PRESETS.map((p) => (
          <Pressable
            key={p.id}
            style={ring(sameSetting(value, { kind: 'preset', id: p.id }))}
            onPress={() => onChange({ kind: 'preset', id: p.id })}>
            <LinearGradient colors={p[scheme]} style={styles.swatch}>
              <ThemedText style={styles.swatchLabel}>{p.name}</ThemedText>
            </LinearGradient>
          </Pressable>
        ))}
        {/* 自定义上传 */}
        <Pressable style={ring(value.kind === 'custom')} onPress={upload}>
          {value.kind === 'custom' ? (
            <Image source={{ uri: value.uri }} style={styles.swatch} />
          ) : (
            <View style={[styles.swatch, styles.uploadSwatch]}>
              <ThemedText style={styles.uploadPlus}>＋</ThemedText>
              <ThemedText style={styles.swatchLabel}>相册</ThemedText>
            </View>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

export default function AppearanceScreen() {
  const { diaryBg, chatBg, setDiaryBg, setChatBg } = useSettingsStore();

  return (
    <ThemedView style={styles.container}>
      <BackgroundPicker title="日记背景" value={diaryBg} onChange={setDiaryBg} slot="diary" />
      <BackgroundPicker title="聊天背景" value={chatBg} onChange={setChatBg} slot="chat" />
      <ThemedText style={styles.hint}>
        自定义图片会加一层淡淡的遮罩来保证文字可读;更换后立即生效。
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 8 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '600', paddingHorizontal: 20, marginBottom: 10 },
  row: { paddingHorizontal: 16, gap: 10 },
  swatchRing: {
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 16,
    padding: 2,
  },
  swatch: {
    width: 72,
    height: 96,
    borderRadius: 12,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 8,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(127,127,127,0.25)',
  },
  swatchLabel: { fontSize: 11, opacity: 0.7 },
  uploadSwatch: { justifyContent: 'center', gap: 2 },
  uploadPlus: { fontSize: 24, opacity: 0.5, lineHeight: 28 },
  hint: { fontSize: 12, opacity: 0.45, paddingHorizontal: 20, marginTop: 24, lineHeight: 18 },
});
