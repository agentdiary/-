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
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api, avatarUrl } from '@/lib/api';
import { avatarColor, CELEBRITY_PORTRAITS } from '@/lib/celebrity-portraits';
import { kvGet, kvSet } from '@/lib/kv';
import type { UserSummary } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';

// 用户自定义的会话列表排序(仅本机显示顺序,长按拖动调整)
const ORDER_KEY = 'agentdiary_discover_order';
// 置顶的用户 id 列表(仅本机;长按头像切换)
const PIN_KEY = 'agentdiary_chat_pins';

// 固定行高:自绘排序依赖等高行(卡片 84 + 间距 14)
const CARD_HEIGHT = 84;
const ROW_GAP = 14;
const ITEM_HEIGHT = CARD_HEIGHT + ROW_GAP;
// 左右小幅拖动的最大位移与阻尼(与日记卡片同样的玩法,纯手感、无功能)
const DRIFT_MAX = 36;

const SPRING = { damping: 22, stiffness: 220 };

async function loadOrder(): Promise<string[]> {
  try {
    const raw = await kvGet(ORDER_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function loadPins(): Promise<string[]> {
  try {
    const raw = await kvGet(PIN_KEY);
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

function UserAvatar({
  username,
  userId,
  avatarTs,
}: {
  username: string;
  userId?: string;
  avatarTs?: string | null;
}) {
  // 优先级:自定义头像 > 名人内置画像 > 首字母色块
  if (userId && avatarTs) {
    return (
      <Image source={{ uri: avatarUrl(userId, avatarTs) }} style={styles.avatar} fadeDuration={0} />
    );
  }
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

function openChat(user: UserSummary) {
  router.push({
    pathname: '/visit/[userId]',
    params: {
      userId: user.id,
      username: user.username,
      builtin: user.is_builtin ? '1' : '',
      avatarTs: user.avatar_updated_at ?? '',
    },
  });
}

function DraggableRow({
  user,
  count,
  positions,
  onReorder,
  onPinToggle,
}: {
  user: UserSummary;
  count: number;
  // id → 槽位序号,全程在 UI 线程读写,排序过程不触发 React 重渲染(防闪烁的关键)
  positions: SharedValue<Record<string, number>>;
  onReorder: (positions: Record<string, number>) => void;
  onPinToggle: () => void;
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

  // 长按后上下拖动排序(比头像长按置顶的 260ms 晚,避免抢手势)
  const reorderGesture = Gesture.Pan()
    .activateAfterLongPress(420)
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
        <Pressable style={styles.card} onPress={() => openChat(user)}>
          {/* 长按头像置顶:用原生 LongPress 手势,260ms 先于外层拖动的 420ms
              激活,子手势激活会按 RNGH 标准仲裁取消外层 Pan(GH Pressable 做不到) */}
          <GestureDetector
            gesture={Gesture.LongPress()
              .minDuration(260)
              .maxDistance(18)
              .onStart(() => {
                'worklet';
                runOnJS(onPinToggle)();
              })}>
            <View collapsable={false}>
              <UserAvatar
                username={user.username}
                userId={user.id}
                avatarTs={user.avatar_updated_at}
              />
            </View>
          </GestureDetector>
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

// 置顶卡片:样式对齐「我的化身」(描边突出),长按头像取消置顶
function PinnedCard({ user, onUnpin }: { user: UserSummary; onUnpin: () => void }) {
  const scheme = useColorScheme() ?? 'light';
  return (
    <Pressable
      style={[styles.card, styles.pinnedCard, { borderColor: Colors[scheme].tint }]}
      onPress={() => openChat(user)}>
      {/* 与置顶同一套手势:长按头像取消置顶 */}
      <GestureDetector
        gesture={Gesture.LongPress()
          .minDuration(260)
          .maxDistance(18)
          .onStart(() => {
            'worklet';
            runOnJS(onUnpin)();
          })}>
        <View collapsable={false}>
          <UserAvatar
            username={user.username}
            userId={user.id}
            avatarTs={user.avatar_updated_at}
          />
        </View>
      </GestureDetector>
      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <ThemedText style={styles.cardName} numberOfLines={1}>
            {user.username}
          </ThemedText>
          <ThemedText style={styles.cardMeta}>已置顶</ThemedText>
        </View>
        <ThemedText style={styles.cardHint} numberOfLines={1}>
          {user.status ? `今日:${user.status}` : '去和 TA 的化身聊聊 →'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export default function ChatsScreen() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() ?? 'light';
  const { token, username, userId, avatarTs } = useAuthStore();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [pins, setPins] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const positions = useSharedValue<Record<string, number>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, order, savedPins] = await Promise.all([
        api.listUsers(),
        loadOrder(),
        loadPins(),
      ]);
      const sorted = applyOrder(list, order);
      setUsers(sorted);
      setPins(savedPins.filter((id) => list.some((u) => u.id === id)));
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
    await kvSet(ORDER_KEY, JSON.stringify(ids)).catch(() => {});
    // 不 setState:布局完全由共享值驱动,避免松手后的重渲染闪烁
  }, []);

  const togglePin = useCallback((id: string) => {
    setPins((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      kvSet(PIN_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // 置顶的固定在上方(按置顶先后),其余进可拖动排序的列表
  const pinnedUsers = useMemo(
    () =>
      pins
        .map((id) => users.find((u) => u.id === id))
        .filter((u): u is UserSummary => u !== undefined),
    [pins, users],
  );
  const others = useMemo(() => users.filter((u) => !pins.includes(u.id)), [pins, users]);

  // 置顶集合变化后重建槽位表(共享值,不触发行组件重挂载)
  useEffect(() => {
    positions.value = Object.fromEntries(others.map((u, i) => [u.id, i]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [others]);

  // users 的 id 集合稳定时,行组件不因排序重挂载
  const rows = useMemo(
    () =>
      others.map((u) => (
        <DraggableRow
          key={u.id}
          user={u}
          count={others.length}
          positions={positions}
          onReorder={onReorder}
          onPinToggle={() => togglePin(u.id)}
        />
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [others, onReorder, togglePin],
  );

  if (!token) {
    return <Redirect href="/login" />;
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <ThemedText type="title">对话</ThemedText>
        {/* 真人聊天:只列 AI 裁判评估通过(已解锁)的人 */}
        <Pressable
          style={styles.realChatsBtn}
          hitSlop={10}
          onPress={() => router.push('/real-chats')}>
          <IconSymbol size={30} name="person.2.fill" color={Colors[scheme].icon} />
        </Pressable>
      </View>

      {/* 我的化身:固定置顶,不参与拖动排序 */}
      <Pressable
        style={[styles.card, styles.selfCard, { borderColor: Colors[scheme].tint }]}
        onPress={() =>
          router.push({
            pathname: '/visit/[userId]',
            params: {
              userId: userId ?? '',
              username: username ?? '',
              builtin: '',
              avatarTs: avatarTs ?? '',
            },
          })
        }>
        <UserAvatar username={username ?? '我'} userId={userId ?? undefined} avatarTs={avatarTs} />
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            <ThemedText style={styles.cardName} numberOfLines={1}>
              我的化身
            </ThemedText>
            <ThemedText style={styles.cardMeta}>自聊</ThemedText>
          </View>
          <ThemedText style={styles.cardHint} numberOfLines={1}>
            和自己的化身聊聊,检验它像不像你 →
          </ThemedText>
        </View>
      </Pressable>

      {pinnedUsers.map((u) => (
        <PinnedCard key={u.id} user={u} onUnpin={() => togglePin(u.id)} />
      ))}

      {error && <Text style={styles.error}>{error}</Text>}

      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        contentContainerStyle={
          others.length === 0
            ? styles.emptyContainer
            : { height: others.length * ITEM_HEIGHT + ROW_GAP + insets.bottom + 20 }
        }>
        {others.length === 0 && !loading ? (
          <ThemedText style={styles.emptyText}>
            {users.length === 0 ? '还没有其他用户。' : '都被你置顶了。'}
          </ThemedText>
        ) : (
          rows
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 12,
  },
  realChatsBtn: { alignItems: 'center', justifyContent: 'center' },
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
  selfCard: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: ROW_GAP,
    borderWidth: 1,
  },
  pinnedCard: {
    marginHorizontal: 20,
    marginBottom: ROW_GAP,
    borderWidth: 1,
    opacity: 0.98,
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
