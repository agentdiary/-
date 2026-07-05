import * as SecureStore from 'expo-secure-store';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { api } from '@/lib/api';
import { avatarColor, CELEBRITY_PORTRAITS } from '@/lib/celebrity-portraits';
import type { UserSummary } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';

// 用户自定义的发现页排序(仅本机显示顺序,长按拖动调整)
const ORDER_KEY = 'agentdiary_discover_order';

// 固定行高:自绘排序依赖等高行(卡片 84 + 间距 14)
const CARD_HEIGHT = 84;
const ROW_GAP = 14;
const ITEM_HEIGHT = CARD_HEIGHT + ROW_GAP;
// 左右小幅拖动的最大位移与阻尼(与日记卡片同样的玩法,纯手感、无功能)
const DRIFT_MAX = 36;

const SPRING = { damping: 22, stiffness: 220 };

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
    return <Image source={portrait} style={styles.avatar} fadeDuration={0} />;
  }
  return (
    <View style={[styles.avatar, { backgroundColor: avatarColor(username) }]}>
      <Text style={styles.avatarInitial}>{username.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

function DraggableRow({
  user,
  count,
  positions,
  onReorder,
}: {
  user: UserSummary;
  count: number;
  // id → 槽位序号,全程在 UI 线程读写,排序过程不触发 React 重渲染(防闪烁的关键)
  positions: SharedValue<Record<string, number>>;
  onReorder: (positions: Record<string, number>) => void;
}) {
  const active = useSharedValue(false);
  const x = useSharedValue(0);
  const top = useSharedValue((positions.value[user.id] ?? 0) * ITEM_HEIGHT);
  const dragStartTop = useSharedValue(0);

  // 别的行把自己的槽位挤走时,弹到新位置
  useAnimatedReaction(
    () => positions.value[user.id],
    (slot, prev) => {
      if (slot === undefined || slot === prev) return;
      if (!active.value) {
        top.value = withSpring(slot * ITEM_HEIGHT, SPRING);
      }
    },
  );

  // 长按后上下拖动排序
  const reorderGesture = Gesture.Pan()
    .activateAfterLongPress(250)
    .onStart(() => {
      active.value = true;
      dragStartTop.value = top.value;
    })
    .onUpdate((e) => {
      top.value = dragStartTop.value + e.translationY;
      const mySlot = positions.value[user.id];
      const targetSlot = Math.min(
        count - 1,
        Math.max(0, Math.round(top.value / ITEM_HEIGHT)),
      );
      if (targetSlot !== mySlot) {
        // 和目标槽位的行互换
        const next = { ...positions.value };
        for (const id in next) {
          if (next[id] === targetSlot) {
            next[id] = mySlot;
            break;
          }
        }
        next[user.id] = targetSlot;
        positions.value = next;
      }
    })
    .onEnd(() => {
      active.value = false;
      top.value = withSpring(positions.value[user.id] * ITEM_HEIGHT, SPRING);
      runOnJS(onReorder)(positions.value);
    })
    .onFinalize(() => {
      if (active.value) {
        active.value = false;
        top.value = withSpring(positions.value[user.id] * ITEM_HEIGHT, SPRING);
      }
    });

  // 左右小幅拖动(带阻尼回弹,同日记卡片的手感;纵向让位给列表滚动)
  const driftGesture = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const damped = e.translationX / 3;
      x.value = Math.max(-DRIFT_MAX, Math.min(DRIFT_MAX, damped));
    })
    .onEnd(() => {
      x.value = withSpring(0, SPRING);
    })
    .onFinalize(() => {
      x.value = withSpring(0, SPRING);
    });

  const gesture = Gesture.Race(reorderGesture, driftGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    top: top.value,
    zIndex: active.value ? 10 : 0,
    transform: [
      { translateX: x.value },
      { scale: withTiming(active.value ? 1.03 : 1, { duration: 140 }) },
      // 轻微倾斜呼应横向拖动,与日记卡片一致的俏皮感
      { rotateZ: `${interpolate(x.value, [-DRIFT_MAX, DRIFT_MAX], [-1.2, 1.2])}deg` },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.rowWrap, animatedStyle]}>
        <Pressable
          style={styles.card}
          onPress={() =>
            router.push({
              pathname: '/visit/[userId]',
              params: { userId: user.id, username: user.username },
            })
          }>
          <UserAvatar username={user.username} />
          <View style={styles.cardBody}>
            <View style={styles.cardRow}>
              <ThemedText style={styles.cardName} numberOfLines={1}>
                {user.username}
              </ThemedText>
              <ThemedText style={styles.cardMeta} numberOfLines={1}>
                {user.is_builtin
                  ? '名人化身'
                  : user.card_count > 0
                    ? `人格卡片 ${user.card_count} 张`
                    : '化身尚未喂养'}
              </ThemedText>
            </View>
            <ThemedText style={styles.cardHint} numberOfLines={1}>
              {user.status ? `今日:${user.status}` : '去和 TA 的化身聊聊 →'}
            </ThemedText>
          </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const token = useAuthStore((s) => s.token);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const positions = useSharedValue<Record<string, number>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, order] = await Promise.all([api.listUsers(), loadOrder()]);
      const sorted = applyOrder(list, order);
      positions.value = Object.fromEntries(sorted.map((u, i) => [u.id, i]));
      setUsers(sorted);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (token) refresh();
  }, [token, refresh]);

  const onReorder = useCallback(async (pos: Record<string, number>) => {
    const ids = Object.entries(pos)
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id);
    await SecureStore.setItemAsync(ORDER_KEY, JSON.stringify(ids)).catch(() => {});
    // 不 setState:布局完全由共享值驱动,避免松手后的重渲染闪烁
  }, []);

  // users 的 id 集合稳定时,行组件不因排序重挂载
  const rows = useMemo(
    () =>
      users.map((u) => (
        <DraggableRow
          key={u.id}
          user={u}
          count={users.length}
          positions={positions}
          onReorder={onReorder}
        />
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users, onReorder],
  );

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

      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        contentContainerStyle={
          users.length === 0
            ? styles.emptyContainer
            : { height: users.length * ITEM_HEIGHT + ROW_GAP }
        }>
        {users.length === 0 && !loading ? (
          <ThemedText style={styles.emptyText}>还没有其他用户。</ThemedText>
        ) : (
          rows
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 12 },
  subtitle: { fontSize: 13, opacity: 0.5, marginTop: 4 },
  error: { color: '#c44', paddingHorizontal: 24, paddingBottom: 8 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { opacity: 0.5 },
  rowWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: CARD_HEIGHT,
  },
  card: {
    height: CARD_HEIGHT,
    paddingHorizontal: 16,
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
  cardName: { fontSize: 19, fontWeight: '600', flexShrink: 1 },
  cardMeta: { fontSize: 12, opacity: 0.5, marginLeft: 8 },
  cardHint: { fontSize: 14, opacity: 0.6, marginTop: 6 },
});
