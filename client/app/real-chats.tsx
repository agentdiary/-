import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { api, avatarUrl } from '@/lib/api';
import { avatarColor } from '@/lib/celebrity-portraits';
import type { ConversationItem } from '@/lib/types';

function formatLastAt(iso: string): string {
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}-${d.getDate()}`;
}

// 真人聊天列表:只有 AI 裁判评估通过(解锁)的用户才会出现在这里
export default function RealChatsScreen() {
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.listConversations());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // 每次回到此页都刷新(对方可能刚发来消息)
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <ThemedView style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={items}
        keyExtractor={(i) => i.user_id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        contentContainerStyle={[styles.list, items.length === 0 && styles.emptyContainer]}
        ListEmptyComponent={
          !loading ? (
            <ThemedText style={styles.emptyText}>
              还没有解锁的真人对话。{'\n\n'}
              先去和 TA 的化身聊上几句,再让 AI 裁判评估契合度——通过后,真人就会出现在这里。
            </ThemedText>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              router.push({
                pathname: '/visit/[userId]',
                params: {
                  userId: item.user_id,
                  username: item.username,
                  builtin: '',
                  avatarTs: item.avatar_updated_at ?? '',
                  mode: 'real',
                },
              })
            }>
            {item.avatar_updated_at ? (
              <Image
                source={{ uri: avatarUrl(item.user_id, item.avatar_updated_at) }}
                style={styles.avatar}
                fadeDuration={0}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: avatarColor(item.username) }]}>
                <Text style={styles.avatarInitial}>
                  {item.username.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.rowBody}>
              <View style={styles.rowTop}>
                <ThemedText style={styles.name} numberOfLines={1}>
                  {item.username}
                </ThemedText>
                {item.last_at && (
                  <ThemedText style={styles.time}>{formatLastAt(item.last_at)}</ThemedText>
                )}
              </View>
              <ThemedText style={styles.preview} numberOfLines={1}>
                {item.last_message ?? '已解锁,打个招呼吧 →'}
              </ThemedText>
            </View>
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  error: { color: '#c44', paddingHorizontal: 20, paddingTop: 10 },
  list: { padding: 16, gap: 10 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  emptyText: {
    opacity: 0.5,
    textAlign: 'center',
    paddingHorizontal: 40,
    fontSize: 15,
    lineHeight: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    minHeight: 76,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(127,127,127,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 18, fontWeight: '600' },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  time: { fontSize: 12, opacity: 0.45, marginLeft: 8 },
  preview: { fontSize: 13, opacity: 0.55, marginTop: 5 },
});
