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
import Swipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/lib/api';
import type { PendingDiary } from '@/lib/offline-queue';
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

type Row =
  | { kind: 'pending'; id: string; item: PendingDiary }
  | { kind: 'entry'; id: string; item: DiaryEntry };

const VISIBILITY_LABEL: Record<string, string | null> = {
  public: null, // 默认不标注,保持清爽
  restricted: '指定的人',
  private: '仅自己',
};

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
  const { entries, pending, loading, error, refresh, remove, cycleVisibility } =
    useDiaryStore();
  const diaryBg = useSettingsStore((s) => s.diaryBg);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 从状态编辑页返回时刷新状态芯片
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
      row.kind === 'pending' ? '删除这篇未同步的日记?' : '删除这篇日记?',
      row.kind === 'pending'
        ? '它还没有上传,删除后不可恢复。'
        : '衍生的对话对与人格卡片会一并删除,不可恢复。',
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
          <Pressable onPress={() => router.push('/appearance')} hitSlop={8}>
            <IconSymbol size={22} name="paintbrush.fill" color={Colors[colorScheme].icon} />
          </Pressable>
        </View>

        {/* 今日状态芯片:展示给来访者,并影响化身当天语气 */}
        <Pressable style={styles.statusChip} onPress={() => router.push('/status-editor')}>
          <ThemedText style={styles.statusText}>
            {status ? `今日:${status}` : '＋ 设置今日状态'}
          </ThemedText>
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}

        <FlatList
          data={rows}
          keyExtractor={(row) => row.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
          contentContainerStyle={rows.length === 0 && styles.emptyContainer}
          ListEmptyComponent={
            !loading ? (
              <ThemedText style={styles.emptyText}>
                还没有日记。写下的每一篇都会成为化身的训练素材。
              </ThemedText>
            ) : null
          }
          renderItem={({ item: row }) => {
            const label =
              row.kind === 'pending' ? '待同步' : VISIBILITY_LABEL[row.item.visibility];
            const card = (
              <Pressable onLongPress={() => confirmDelete(row)} style={styles.card}>
                <View style={styles.cardTop}>
                  <ThemedText style={styles.cardDate}>
                    {formatDate(row.item.created_at)}
                  </ThemedText>
                  {label && (
                    <ThemedText
                      style={[styles.badge, row.kind === 'pending' && styles.badgePending]}>
                      {label}
                    </ThemedText>
                  )}
                </View>
                <ThemedText numberOfLines={4}>{row.item.content}</ThemedText>
              </Pressable>
            );
            // 右滑(露出左侧按钮)切换可见性,仅已同步日记;左滑删除
            const renderLeft =
              row.kind === 'entry'
                ? (_p: unknown, _d: unknown, swipeable: SwipeableMethods) => (
                    <Pressable
                      style={[styles.action, styles.actionVisibility]}
                      onPress={() => {
                        swipeable.close();
                        cycleVisibility(row.id).catch(() => {});
                      }}>
                      <Text style={styles.actionText}>
                        {row.item.visibility === 'private' ? '设为公开' : '设为仅自己'}
                      </Text>
                    </Pressable>
                  )
                : undefined;
            return (
              <Swipeable
                friction={2}
                leftThreshold={60}
                rightThreshold={60}
                renderLeftActions={renderLeft}
                renderRightActions={(_p: unknown, _d: unknown, swipeable: SwipeableMethods) => (
                  <Pressable
                    style={[styles.action, styles.actionDelete]}
                    onPress={() => {
                      swipeable.close();
                      confirmDelete(row);
                    }}>
                    <Text style={styles.actionText}>删除</Text>
                  </Pressable>
                )}>
                {card}
              </Swipeable>
            );
          }}
        />

        <Pressable
          style={[styles.fab, { backgroundColor: Colors[colorScheme].tint }]}
          onPress={() => router.push('/diary-editor')}>
          <Text
            style={[styles.fabText, { color: colorScheme === 'dark' ? '#151718' : '#fff' }]}>
            ＋
          </Text>
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
  statusChip: {
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(127,127,127,0.1)',
  },
  statusText: { fontSize: 13, opacity: 0.8 },
  error: { color: '#c60', paddingHorizontal: 20, paddingBottom: 8, fontSize: 12 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { opacity: 0.5, paddingHorizontal: 40, textAlign: 'center' },
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(127,127,127,0.08)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardDate: { fontSize: 12, opacity: 0.5 },
  action: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    marginVertical: 6,
    borderRadius: 12,
  },
  actionVisibility: { backgroundColor: '#5f8fbf', marginLeft: 16 },
  actionDelete: { backgroundColor: '#c0392b', marginRight: 16 },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  badge: { fontSize: 11, opacity: 0.6 },
  badgePending: { color: '#c60', opacity: 1 },
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
