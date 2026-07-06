import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { DiaryEntry } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';
import { useDiaryStore } from '@/stores/diary-store';
import { useSettingsStore } from '@/stores/settings-store';

function formatDate(iso: string) {
  // 后端存 UTC 但序列化不带时区标记,补上 Z 让 Date 按 UTC 解析,再显示为本机时间
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function DiaryListScreen() {
  const token = useAuthStore((s) => s.token);
  if (!token) {
    return <Redirect href="/login" />;
  }
  return <DiaryList />;
}

function DiaryList() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const { entries, loading, error, refresh, remove } = useDiaryStore();
  const diaryBg = useSettingsStore((s) => s.diaryBg);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const confirmDelete = (entry: DiaryEntry) => {
    Alert.alert('删除这篇日记?', '衍生的对话对与人格卡片会一并删除,不可恢复。', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => remove(entry.id) },
    ]);
  };

  return (
    <ScreenBackground setting={diaryBg}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <ThemedText type="title">日记</ThemedText>
        <Pressable onPress={() => router.push('/appearance')} hitSlop={8}>
          <IconSymbol size={22} name="paintbrush.fill" color={Colors[colorScheme].icon} />
        </Pressable>
      </View>

      {error && (
        <Text style={styles.error}>
          无法连接后端:{error}{'\n'}请确认 server 已启动,且 .env 里 EXPO_PUBLIC_API_URL 是电脑的局域网 IP。
        </Text>
      )}

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        contentContainerStyle={entries.length === 0 && styles.emptyContainer}
        ListEmptyComponent={
          !loading ? (
            <ThemedText style={styles.emptyText}>
              还没有日记。写下的每一篇都会成为化身的训练素材。
            </ThemedText>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable onLongPress={() => confirmDelete(item)} style={styles.card}>
            <ThemedText style={styles.cardDate}>{formatDate(item.created_at)}</ThemedText>
            <ThemedText numberOfLines={4}>{item.content}</ThemedText>
          </Pressable>
        )}
      />

      <Pressable
        style={[styles.fab, { backgroundColor: Colors[colorScheme].tint }]}
        onPress={() => router.push('/diary-editor')}>
        {/* 深色模式 tint 为白色,＋ 需要用深色 */}
        <Text style={[styles.fabText, { color: colorScheme === 'dark' ? '#151718' : '#fff' }]}>＋</Text>
      </Pressable>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  error: { color: '#c00', paddingHorizontal: 20, paddingBottom: 8 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { opacity: 0.5, paddingHorizontal: 40, textAlign: 'center' },
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(127,127,127,0.08)',
  },
  cardDate: { fontSize: 12, opacity: 0.5, marginBottom: 6 },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 32,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { fontSize: 28, lineHeight: 32 },
});
