import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/lib/api';

// 预设状态(微信状态式):点选即填,也可自由输入
const PRESETS = [
  '😊 开心',
  '😪 有点累',
  '💻 搬砖中',
  '📚 学习中',
  '🏃 运动中',
  '🌙 想静静',
  '🍜 干饭中',
  '✈️ 在路上',
];

export default function StatusEditorScreen() {
  const scheme = useColorScheme() ?? 'light';
  const tint = Colors[scheme].tint;
  const onTint = scheme === 'dark' ? '#151718' : '#fff';
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getMyStatus()
      .then((r) => setText(r.status ?? ''))
      .catch(() => {});
  }, []);

  const save = async (value: string | null) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.setStatus(value);
      router.back();
    } catch (e) {
      Alert.alert('保存失败', String(e));
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.hint}>
        状态会展示给来找你化身聊天的人,并影响化身的当天语气;24 小时后自动消失。
      </ThemedText>

      <View style={styles.presets}>
        {PRESETS.map((p) => (
          <Pressable
            key={p}
            style={[styles.preset, text === p && { backgroundColor: tint }]}
            onPress={() => setText(p)}>
            <Text style={[styles.presetText, text === p && { color: onTint }]}>{p}</Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={[styles.input, { color: Colors[scheme].text }]}
        placeholder="或者自己写一个(50 字内)…"
        placeholderTextColor="rgba(127,127,127,0.6)"
        value={text}
        onChangeText={setText}
        maxLength={50}
      />

      <Pressable
        style={[styles.saveButton, { backgroundColor: tint, opacity: text.trim() ? 1 : 0.4 }]}
        disabled={!text.trim() || busy}
        onPress={() => save(text.trim())}>
        {busy ? (
          <ActivityIndicator color={onTint} />
        ) : (
          <Text style={[styles.saveText, { color: onTint }]}>设为今日状态</Text>
        )}
      </Pressable>

      <Pressable style={styles.clear} onPress={() => save(null)} disabled={busy}>
        <ThemedText style={styles.clearText}>清除状态</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  hint: { fontSize: 12, opacity: 0.5, lineHeight: 18, marginBottom: 16 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  preset: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(127,127,127,0.12)',
  },
  presetText: { fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(127,127,127,0.3)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  saveButton: {
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveText: { fontSize: 15, fontWeight: '600' },
  clear: { alignItems: 'center', marginTop: 14 },
  clearText: { fontSize: 13, opacity: 0.5 },
});
