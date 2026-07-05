// 「指定的人」白名单选择:从日记卡片右滑面板的「指定」进入。
// 保存后该日记的衍生卡片只对勾选的用户开放。

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/lib/api';
import type { UserSummary } from '@/lib/types';
import { useDiaryStore } from '@/stores/diary-store';

export default function VisibilityPickerScreen() {
  const { diaryId } = useLocalSearchParams<{ diaryId: string }>();
  const scheme = useColorScheme() ?? 'light';
  const tint = Colors[scheme].tint;
  const onTint = scheme === 'dark' ? '#151718' : '#fff';
  const setVisibility = useDiaryStore((s) => s.setVisibility);

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!diaryId) return;
    Promise.all([api.listUsers(), api.getDiaryAllowed(diaryId).catch(() => ({ allowed_user_ids: [] }))])
      .then(([list, allowed]) => {
        setUsers(list.filter((u) => !u.is_builtin));
        setSelected(new Set(allowed.allowed_user_ids));
      })
      .catch((e) => Alert.alert('加载失败', String(e)))
      .finally(() => setLoading(false));
  }, [diaryId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!diaryId || saving) return;
    setSaving(true);
    try {
      await setVisibility(diaryId, 'restricted', [...selected]);
      router.back();
    } catch (e) {
      Alert.alert('保存失败', String(e));
      setSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.hint}>
        这篇日记的内容,你的化身只会对勾选的人透露。
      </ThemedText>

      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          ListEmptyComponent={
            <ThemedText style={styles.hint}>还没有其他用户可选。</ThemedText>
          }
          renderItem={({ item }) => {
            const checked = selected.has(item.id);
            return (
              <Pressable style={styles.row} onPress={() => toggle(item.id)}>
                <View
                  style={[styles.checkbox, checked && { backgroundColor: tint, borderColor: tint }]}>
                  {checked && <Text style={[styles.checkmark, { color: onTint }]}>✓</Text>}
                </View>
                <ThemedText style={styles.name}>{item.username}</ThemedText>
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        style={[styles.saveButton, { backgroundColor: tint, opacity: saving ? 0.6 : 1 }]}
        disabled={saving || loading}
        onPress={save}>
        {saving ? (
          <ActivityIndicator color={onTint} />
        ) : (
          <Text style={[styles.saveText, { color: onTint }]}>
            保存({selected.size} 人可见)
          </Text>
        )}
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  hint: { fontSize: 13, opacity: 0.55, lineHeight: 20, marginBottom: 14 },
  loading: { marginTop: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(127,127,127,0.2)',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(127,127,127,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: { fontSize: 14, fontWeight: '700' },
  name: { fontSize: 17 },
  saveButton: {
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  saveText: { fontSize: 15, fontWeight: '600' },
});
