import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { api } from '@/lib/api';
import type { UserSummary } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';

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
            <ThemedText style={styles.cardHint}>去和 TA 的化身聊聊 →</ThemedText>
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
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(127,127,127,0.08)',
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 17, fontWeight: '600' },
  cardMeta: { fontSize: 12, opacity: 0.5 },
  cardHint: { fontSize: 13, opacity: 0.6, marginTop: 6 },
});
