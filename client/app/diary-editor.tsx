import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
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
import type { DiaryVisibility, UserSummary } from '@/lib/types';
import { useDiaryStore } from '@/stores/diary-store';

const VISIBILITY_OPTIONS: { key: DiaryVisibility; label: string; hint: string }[] = [
  { key: 'public', label: '公开', hint: '化身可对所有访客使用这篇日记的内容' },
  { key: 'restricted', label: '指定的人', hint: '仅勾选的用户与你的化身聊天时可用' },
  { key: 'private', label: '仅自己', hint: '只用于你和自己化身的对话' },
];

export default function DiaryEditorScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const onTint = colorScheme === 'dark' ? '#151718' : '#fff';
  const add = useDiaryStore((s) => s.add);
  const edit = useDiaryStore((s) => s.edit);

  // 编辑模式:从日记卡片点入,带 diaryId 与原文;24h 窗口由后端强制校验
  const { diaryId, initialContent } = useLocalSearchParams<{
    diaryId?: string;
    initialContent?: string;
  }>();
  const isEditing = !!diaryId;

  const [content, setContent] = useState(initialContent ?? '');
  const [visibility, setVisibility] = useState<DiaryVisibility>('public');
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // 选「指定的人」时才拉用户列表;名人化身不参与
  useEffect(() => {
    if (visibility === 'restricted' && users.length === 0) {
      api
        .listUsers()
        .then((list) => setUsers(list.filter((u) => !u.is_builtin)))
        .catch(() => {});
    }
  }, [visibility, users.length]);

  const toggleUser = (id: string) => {
    setAllowed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    const text = content.trim();
    if (!text) return;
    setSaving(true);
    try {
      if (isEditing && diaryId) {
        await edit(diaryId, text);
      } else {
        await add(text, visibility, visibility === 'restricted' ? [...allowed] : []);
      }
      router.back();
    } catch (e) {
      Alert.alert('保存失败', String(e));
      setSaving(false);
    }
  };

  const selectedHint = VISIBILITY_OPTIONS.find((o) => o.key === visibility)?.hint;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stack.Screen options={{ title: isEditing ? '修改日记' : '写日记' }} />
      <ThemedView style={styles.container}>
        {isEditing && (
          <ThemedText style={styles.hint}>
            ⏳ 日记落笔 24 小时内可修改;修改后化身会重新学习这篇内容。
          </ThemedText>
        )}
        <TextInput
          style={[styles.input, { color: Colors[colorScheme].text }]}
          multiline
          autoFocus
          placeholder="今天发生了什么?你怎么想?"
          placeholderTextColor="rgba(127,127,127,0.6)"
          value={content}
          onChangeText={setContent}
        />

        {/* 编辑模式只改内容;可见性用日记卡片右滑调整 */}
        {!isEditing && (
        <View style={styles.visibilityRow}>
          {VISIBILITY_OPTIONS.map((o) => {
            const active = visibility === o.key;
            return (
              <Pressable
                key={o.key}
                style={[styles.chip, active && { backgroundColor: tint }]}
                onPress={() => setVisibility(o.key)}>
                <Text style={[styles.chipText, active && { color: onTint }]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
        )}
        {!isEditing && <ThemedText style={styles.hint}>{selectedHint}</ThemedText>}

        {!isEditing && visibility === 'restricted' && (
          <ScrollView style={styles.userList}>
            {users.length === 0 ? (
              <ThemedText style={styles.hint}>暂无其他用户可选</ThemedText>
            ) : (
              users.map((u) => {
                const checked = allowed.has(u.id);
                return (
                  <Pressable key={u.id} style={styles.userRow} onPress={() => toggleUser(u.id)}>
                    <View style={[styles.checkbox, checked && { backgroundColor: tint, borderColor: tint }]}>
                      {checked && <Text style={[styles.checkmark, { color: onTint }]}>✓</Text>}
                    </View>
                    <ThemedText>{u.username}</ThemedText>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        )}

        <Pressable
          style={[
            styles.saveButton,
            { backgroundColor: tint, opacity: content.trim() ? 1 : 0.4 },
          ]}
          disabled={!content.trim() || saving}
          onPress={save}>
          {saving ? (
            <ActivityIndicator color={onTint} />
          ) : (
            <Text style={[styles.saveText, { color: onTint }]}>保存</Text>
          )}
        </Pressable>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, padding: 20 },
  input: { flex: 1, fontSize: 17, lineHeight: 26, textAlignVertical: 'top' },
  visibilityRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(127,127,127,0.12)',
  },
  chipText: { fontSize: 13 },
  hint: { fontSize: 12, opacity: 0.5, marginBottom: 8 },
  userList: { maxHeight: 140, marginBottom: 8 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(127,127,127,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: { fontSize: 13, fontWeight: '700' },
  saveButton: {
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  saveText: { fontSize: 16, fontWeight: '600' },
});
