import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// 手势区域内的按钮必须用 gesture-handler 自家的 Pressable:
// RNGH 的命中判定基于布局位置而非视觉变换,普通 Pressable 会被滑开的卡片"原位"拦截
import {
  Gesture,
  GestureDetector,
  Pressable as GHPressable,
} from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/lib/api';
import type { PendingDiary } from '@/lib/offline-queue';
import type { DiaryEntry, DiaryVisibility } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';
import { useDiaryStore } from '@/stores/diary-store';
import { useSettingsStore } from '@/stores/settings-store';

function formatDate(iso: string) {
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type Row =
  | { kind: 'pending'; id: string; item: PendingDiary }
  | { kind: 'entry'; id: string; item: DiaryEntry };

const VISIBILITY_LABEL: Record<DiaryVisibility, string> = {
  public: '公开',
  restricted: '指定用户',
  private: '仅自己',
};

const VISIBILITY_OPTIONS: { key: DiaryVisibility; label: string }[] = [
  { key: 'public', label: '公开' },
  { key: 'restricted', label: '指定' },
  { key: 'private', label: '自己' },
];

const OPEN_X = 132;
const DELETE_X = -104;
const COMMIT_THRESHOLD = 92;

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
  const { entries, pending, loading, error, refresh, remove, setVisibility } = useDiaryStore();
  const diaryBg = useSettingsStore((s) => s.diaryBg);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      api
        .getMyStatus()
        .then((r) => setStatus(r.status))
        .catch(() => {});
    }, []),
  );

  const rows: Row[] = [
    ...pending.map((p): Row => ({ kind: 'pending', id: p.local_id, item: p })),
    ...entries.map((e): Row => ({ kind: 'entry', id: e.id, item: e })),
  ];

  const confirmDelete = (row: Row) => {
    Alert.alert(
      row.kind === 'pending' ? '删除这篇未同步日记？' : '删除这篇日记？',
      row.kind === 'pending'
        ? '它还没有上传，删除后不可恢复。'
        : '衍生的对话对与人格卡片会一起删除，不可恢复。',
      [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: () => remove(row.id) },
      ],
    );
  };

  return (
    <ScreenBackground setting={diaryBg}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <ThemedText type="title">日记</ThemedText>
          <Pressable style={styles.headerButton} onPress={() => router.push('/appearance')} hitSlop={8}>
            <IconSymbol size={24} name="paintbrush.fill" color={Colors[colorScheme].icon} />
          </Pressable>
        </View>

        <Pressable style={styles.statusChip} onPress={() => router.push('/status-editor')}>
          <ThemedText style={styles.statusText}>
            {status ? `今日：${status}` : '今日：'}
          </ThemedText>
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}

        <FlatList
          data={rows}
          keyExtractor={(row) => row.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
          contentContainerStyle={[
            styles.listContent,
            rows.length === 0 && styles.emptyContainer,
            { paddingBottom: insets.bottom + 108 },
          ]}
          ListEmptyComponent={
            !loading ? (
              <ThemedText style={styles.emptyText}>
                还没有日记。写下的每一篇，都会成为化身更像你的材料。
              </ThemedText>
            ) : null
          }
          renderItem={({ item }) => (
            <DiaryRow
              row={item}
              onDelete={() => confirmDelete(item)}
              onVisibility={(visibility) => {
                // 「指定」需要选人:已同步的日记跳白名单选择页;
                // 未同步的本地日记没有服务器 id,先仅切换档位
                if (visibility === 'restricted' && item.kind === 'entry') {
                  router.push({
                    pathname: '/visibility-picker',
                    params: { diaryId: item.id },
                  });
                  return;
                }
                setVisibility(item.id, visibility).catch(() => {});
              }}
            />
          )}
        />

        <Pressable
          style={[
            styles.fab,
            { backgroundColor: colorScheme === 'dark' ? '#f4f5f8' : '#ffffff' },
          ]}
          onPress={() => router.push('/diary-editor')}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      </View>
    </ScreenBackground>
  );
}

function DiaryRow({
  row,
  onDelete,
  onVisibility,
}: {
  row: Row;
  onDelete: () => void;
  onVisibility: (visibility: DiaryVisibility) => void;
}) {
  const colorScheme = useColorScheme() ?? 'light';
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);

  const close = useCallback(() => {
    x.value = withSpring(0, { damping: 18, stiffness: 220 });
    y.value = withSpring(0, { damping: 18, stiffness: 220 });
  }, [x, y]);

  const openDelete = useCallback(() => {
    x.value = withSpring(DELETE_X, { damping: 18, stiffness: 220 });
    y.value = withSpring(0, { damping: 18, stiffness: 220 });
  }, [x, y]);

  const gesture = Gesture.Pan()
    // 只在横向拖动时激活,纵向让给列表滚动
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      startX.value = x.value;
    })
    .onUpdate((event) => {
      x.value = Math.max(Math.min(startX.value + event.translationX, OPEN_X + 18), DELETE_X - 18);
      y.value = Math.max(Math.min(event.translationY, 18), -18);
    })
    .onEnd(() => {
      if (x.value > COMMIT_THRESHOLD) {
        x.value = withSpring(OPEN_X, { damping: 18, stiffness: 220 });
      } else if (x.value < -COMMIT_THRESHOLD) {
        runOnJS(openDelete)();
      } else {
        x.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
      y.value = withSpring(0, { damping: 18, stiffness: 220 });
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  const visibilityStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [18, COMMIT_THRESHOLD], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(x.value, [0, OPEN_X], [-22, 0], Extrapolation.CLAMP) }],
  }));

  const deleteStyle = useAnimatedStyle(() => ({
    opacity: interpolate(-x.value, [18, COMMIT_THRESHOLD], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(x.value, [DELETE_X, 0], [0, 22], Extrapolation.CLAMP) }],
  }));

  const visibility = row.item.visibility as DiaryVisibility;
  const label = row.kind === 'pending' ? '待同步' : VISIBILITY_LABEL[visibility];

  return (
    <View style={styles.rowShell}>
      <Animated.View
        pointerEvents="box-none"
        style={[styles.actionLayer, styles.visibilityLayer, visibilityStyle]}>
        <View style={styles.visibilityPanel}>
          {VISIBILITY_OPTIONS.map((option) => {
            const active = visibility === option.key;
            return (
              <GHPressable
                key={option.key}
                style={[styles.visibilityPill, active && styles.visibilityPillActive]}
                onPress={() => {
                  onVisibility(option.key);
                  close();
                }}>
                <Text style={[styles.visibilityPillText, active && styles.visibilityPillTextActive]}>
                  {option.label}
                </Text>
              </GHPressable>
            );
          })}
        </View>
      </Animated.View>

      <Animated.View
        pointerEvents="box-none"
        style={[styles.actionLayer, styles.deleteLayer, deleteStyle]}>
        <GHPressable
          style={styles.deleteButton}
          onPress={() => {
            close();
            onDelete();
          }}>
          <Text style={styles.deleteText}>删除</Text>
        </GHPressable>
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <Animated.View style={cardStyle}>
          <Pressable onLongPress={onDelete} style={styles.card}>
            <View style={styles.cardTop}>
              <ThemedText style={styles.cardDate}>{formatDate(row.item.created_at)}</ThemedText>
              <ThemedText
                style={[
                  styles.badge,
                  row.kind === 'pending' && styles.badgePending,
                  visibility === 'public' && styles.badgePublic,
                  visibility === 'restricted' && styles.badgeRestricted,
                  visibility === 'private' && styles.badgePrivate,
                ]}>
                {label}
              </ThemedText>
            </View>
            <ThemedText
              numberOfLines={5}
              style={[styles.cardContent, { color: Colors[colorScheme].text }]}>
              {row.item.content}
            </ThemedText>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
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
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChip: {
    alignSelf: 'flex-start',
    marginHorizontal: 24,
    marginBottom: 18,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(127,127,127,0.13)',
  },
  statusText: { fontSize: 20, fontWeight: '600', opacity: 0.78 },
  error: { color: '#d47a2d', paddingHorizontal: 24, paddingBottom: 8, fontSize: 12 },
  listContent: { paddingTop: 8 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { opacity: 0.55, paddingHorizontal: 42, textAlign: 'center', lineHeight: 22 },
  rowShell: {
    marginHorizontal: 20,
    marginVertical: 7,
    minHeight: 112,
    justifyContent: 'center',
  },
  actionLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  visibilityLayer: { alignItems: 'flex-start' },
  deleteLayer: { alignItems: 'flex-end' },
  visibilityPanel: {
    width: 122,
    gap: 6,
    padding: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(89, 139, 180, 0.26)',
  },
  visibilityPill: {
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  visibilityPillActive: { backgroundColor: '#f4f7fb' },
  visibilityPillText: { color: '#f4f7fb', fontSize: 12, fontWeight: '700' },
  visibilityPillTextActive: { color: '#21364d' },
  deleteButton: {
    width: 88,
    minHeight: 86,
    borderRadius: 18,
    backgroundColor: 'rgba(202, 69, 67, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  card: {
    minHeight: 104,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(127,127,127,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  cardDate: { fontSize: 14, opacity: 0.5 },
  cardContent: { fontSize: 19, lineHeight: 27 },
  badge: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 11,
    fontSize: 12,
    fontWeight: '700',
  },
  badgePublic: { color: '#6fc6a5', backgroundColor: 'rgba(111,198,165,0.12)' },
  badgeRestricted: { color: '#78aee5', backgroundColor: 'rgba(120,174,229,0.15)' },
  badgePrivate: { color: '#a9a9b8', backgroundColor: 'rgba(169,169,184,0.14)' },
  badgePending: { color: '#d89b3d', backgroundColor: 'rgba(216,155,61,0.15)' },
  fab: {
    position: 'absolute',
    right: 28,
    bottom: 34,
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  fabText: { color: '#0b0c12', fontSize: 42, lineHeight: 48, fontWeight: '300' },
});
