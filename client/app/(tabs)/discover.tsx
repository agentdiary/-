import * as SecureStore from 'expo-secure-store';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { api } from '@/lib/api';
import { avatarColor, CELEBRITY_PORTRAITS } from '@/lib/celebrity-portraits';
import type { UserSummary } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';

// 用户自定义的发现页排序(仅本机显示顺序,长按拖动调整)
const ORDER_KEY = 'agentdiary_discover_order';

async function loadOrder(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(ORDER_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function applyOrder(users: UserSummary[], order: string[]): UserSummary[] {
  if (order.length === 0) return users;
  const rank = new Map(order.map((id, i) => [id, i]));
  // 有既存排序的按排序走,新面孔排在最后(保持服务器给的相对顺序)
  return [...users].sort(
    (a, b) => (rank.get(a.id) ?? order.length) - (rank.get(b.id) ?? order.length),
  );
}

function UserAvatar({ username }: { username: string }) {
  const portrait = CELEBRITY_PORTRAITS[username];
  if (portrait) {
    // fadeDuration=0:安卓 Image 默认 300ms 淡入,cell 因拖拽结束重新挂载时
    // 会重新触发这个淡入,看起来像"刷新了一帧"
    return <Image source={portrait} style={styles.avatar} fadeDuration={0} />;
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
      const [list, order] = await Promise.all([api.listUsers(), loadOrder()]);
      setUsers(applyOrder(list, order));
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

  const onDragEnd = useCallback(({ data }: { data: UserSummary[] }) => {
    setUsers(data);
    SecureStore.setItemAsync(ORDER_KEY, JSON.stringify(data.map((u) => u.id))).catch(() => {});
  }, []);

  if (!token) {
    return <Redirect href="/login" />;
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <ThemedText type="title">发现</ThemedText>
        <ThemedText style={styles.subtitle}>点按去聊天;长按拖动调整顺序</ThemedText>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <DraggableFlatList
        data={users}
        keyExtractor={(u) => u.id}
        onDragEnd={onDragEnd}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        containerStyle={styles.listContainer}
        // 安卓拖拽结束后,离屏 cell 常被重新挂载(该库的已知行为);
        // 关掉视图裁剪回收可以避免这次重新挂载,从根上消掉"刷新感"的那一帧
        removeClippedSubviews={false}
        contentContainerStyle={users.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          !loading ? (
            <ThemedText style={styles.emptyText}>还没有其他用户。</ThemedText>
          ) : null
        }
        renderItem={({ item, drag, isActive }: RenderItemParams<UserSummary>) => (
          <ScaleDecorator activeScale={1.03}>
            <Pressable
              // 拿起时只用 ScaleDecorator 的缩放反馈;之前额外叠加的背景色瞬时切换
              // 和缩放动画不同步,松手瞬间两者对不上就是那一下"闪烁"
              style={styles.card}
              onLongPress={drag}
              delayLongPress={220}
              disabled={isActive}
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
          </ScaleDecorator>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 12 },
  subtitle: { fontSize: 13, opacity: 0.5, marginTop: 4 },
  error: { color: '#c44', paddingHorizontal: 24, paddingBottom: 8 },
  listContainer: { flex: 1 },
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
