import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { api } from '@/lib/api';
import { avatarColor, CELEBRITY_PORTRAITS } from '@/lib/celebrity-portraits';
import type { UserSummary } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';

function UserAvatar({ username }: { username: string }) {
  const portrait = CELEBRITY_PORTRAITS[username];
  if (portrait) {
    return <Image source={portrait} style={styles.avatar} />;
  }
  return (
    <View style={[styles.avatar, { backgroundColor: avatarColor(username) }]}>
      <Text style={styles.avatarInitial}>{username.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const token = useAuthStore((s) => s.token);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await api.listUsers());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) refresh();
  }, [token, refresh]);

  if (!token) {
    return <Redirect href="/login" />;
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <ThemedText type="title">发现</ThemedText>
        <ThemedText style={styles.subtitle}>和其他人的化身聊聊,看看合不合拍</ThemedText>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        contentContainerStyle={users.length === 0 && styles.emptyContainer}
        ListEmptyComponent={
          !loading ? (
            <ThemedText style={styles.emptyText}>还没有其他用户。</ThemedText>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: '/visit/[userId]',
                params: { userId: item.id, username: item.username },
              })
            }>
            <UserAvatar username={item.username} />
            <View style={styles.cardBody}>
              <View style={styles.cardRow}>
                <ThemedText style={styles.cardName}>{item.username}</ThemedText>
                <ThemedText style={styles.cardMeta}>
                  {item.is_builtin
                    ? '名人化身'
                    : item.card_count > 0
                      ? `人格卡片 ${item.card_count} 张`
                      : '化身尚未喂养'}
                </ThemedText>
              </View>
              <ThemedText style={styles.cardHint}>
                {item.status ? `今日:${item.status}` : '去和 TA 的化身聊聊 →'}
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
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  subtitle: { fontSize: 13, opacity: 0.5, marginTop: 4 },
  error: { color: '#c00', paddingHorizontal: 20, paddingBottom: 8 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { opacity: 0.5 },
  card: {
    marginHorizontal: 20,
    marginVertical: 7,
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(127,127,127,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 19, fontWeight: '600' },
  cardBody: { flex: 1 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 19, fontWeight: '600' },
  cardMeta: { fontSize: 12, opacity: 0.5 },
  cardHint: { fontSize: 14, opacity: 0.6, marginTop: 6 },
});
