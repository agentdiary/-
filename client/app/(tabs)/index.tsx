import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiaryCalendar, dateKey } from '@/components/diary-calendar';
import { PatternLock } from '@/components/pattern-lock';
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
import { useUiStore } from '@/stores/ui-store';

function parseUtc(iso: string) {
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
}

function formatDate(iso: string) {
  const d = parseUtc(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 日记落笔 24 小时内可修改,之后定格(保证日记的真实性)
const EDIT_WINDOW_MS = 24 * 3600 * 1000;

function editRemainingMs(createdAtIso: string): number {
  const created = new Date(
    createdAtIso.endsWith('Z') || createdAtIso.includes('+')
      ? createdAtIso
      : `${createdAtIso}Z`,
  ).getTime();
  return created + EDIT_WINDOW_MS - Date.now();
}

function formatRemaining(ms: number): string {
  const hours = ms / 3600000;
  if (hours >= 1) return `${Math.floor(hours)}h`;
  return `${Math.max(1, Math.floor(ms / 60000))}m`;
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

// 便签底色:按 id 哈希取色,低透明度,不压过自定义背景与暗色主题
const NOTE_TINTS = [
  'rgba(255, 235, 170, 0.16)',
  'rgba(180, 220, 255, 0.14)',
  'rgba(255, 200, 205, 0.13)',
  'rgba(195, 240, 205, 0.14)',
  'rgba(230, 210, 255, 0.14)',
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function DiaryListScreen() {
  const token = useAuthStore((s) => s.token);
  if (!token) {
    return <Redirect href="/login" />;
  }
  return <DiaryList />;
}

// 便签:一行两张;点按进详情,长按弹操作面板(可见性/加锁/删除)
function DiaryNote({
  row,
  unlocked,
  onPress,
  onLongPress,
}: {
  row: Row;
  unlocked: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const colorScheme = useColorScheme() ?? 'light';
  const h = hashCode(row.id);
  const tint = NOTE_TINTS[h % NOTE_TINTS.length];
  // 每张便签一点随机倾斜,像随手贴上去的
  const rotate = ((h % 7) - 3) * 0.5;

  const visibility = row.item.visibility as DiaryVisibility;
  const label = row.kind === 'pending' ? '待同步' : VISIBILITY_LABEL[visibility];
  const isLocked = row.kind === 'entry' && row.item.locked;
  const shouldHideContent = isLocked && !unlocked;
  const remaining = row.kind === 'entry' ? editRemainingMs(row.item.created_at) : 0;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={[
        styles.note,
        { backgroundColor: tint, transform: [{ rotateZ: `${rotate}deg` }] },
      ]}>
      <View style={styles.noteTop}>
        <ThemedText style={styles.noteDate}>
          {formatDate(row.item.created_at).slice(5)}
        </ThemedText>
        {isLocked && (
          <IconSymbol size={12} name="lock.fill" color={Colors[colorScheme].icon} />
        )}
      </View>
      {shouldHideContent ? (
        <ThemedText style={styles.noteLockedText}>🔒 点按解锁查看</ThemedText>
      ) : (
        <ThemedText
          numberOfLines={6}
          style={[styles.noteContent, { color: Colors[colorScheme].text }]}>
          {row.item.content}
        </ThemedText>
      )}
      <View style={styles.noteBottom}>
        {remaining > 0 ? (
          <ThemedText style={styles.noteEdit}>⏳{formatRemaining(remaining)}</ThemedText>
        ) : (
          <View />
        )}
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
    </Pressable>
  );
}

function DiaryList() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const { entries, pending, loading, error, refresh, remove, setVisibility, setLocked } =
    useDiaryStore();
  const diaryBg = useSettingsStore((s) => s.diaryBg);
  const [status, setStatus] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // 手势锁验证门:待执行动作暂存,图案验证通过后放行
  const lockPattern = useSettingsStore((s) => s.lockPattern);
  const [lockGate, setLockGate] = useState<(() => void) | null>(null);
  const [lockError, setLockError] = useState(false);
  const [unlockedDiaryIds, setUnlockedDiaryIds] = useState<Set<string>>(() => new Set());
  // 长按便签弹出的操作面板
  const [actionRow, setActionRow] = useState<Row | null>(null);

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

  const allRows: Row[] = [
    ...pending.map((p): Row => ({ kind: 'pending', id: p.local_id, item: p })),
    ...entries.map((e): Row => ({ kind: 'entry', id: e.id, item: e })),
  ];
  // 有日记的日期(本地时区),供月历打点
  const markedDates = new Set(allRows.map((r) => dateKey(parseUtc(r.item.created_at))));
  const rows = selectedDate
    ? allRows.filter((r) => dateKey(parseUtc(r.item.created_at)) === selectedDate)
    : allRows;

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

  // 加锁/解锁(解锁需先验证图案,锁才不形同虚设)
  const toggleLock = (row: Row) => {
    if (row.kind !== 'entry') return;
    if (!row.item.locked) {
      if (!lockPattern) {
        Alert.alert('先设置解锁图案', '加锁前需要先设置一个手势图案。', [
          { text: '取消', style: 'cancel' },
          {
            text: '去设置',
            onPress: () => router.push({ pathname: '/pattern-setup', params: { mode: 'set' } }),
          },
        ]);
        return;
      }
      setLocked(row.id, true)
        .then(() => {
          setUnlockedDiaryIds((prev) => {
            const next = new Set(prev);
            next.delete(row.id);
            return next;
          });
          Alert.alert('已加锁', '之后打开这篇日记需要先绘制手势图案。');
        })
        .catch(() => Alert.alert('加锁失败', '请稍后再试。'));
    } else {
      setLockError(false);
      setLockGate(() => () => {
        setLocked(row.id, false)
          .then(() => {
            setUnlockedDiaryIds((prev) => {
              const next = new Set(prev);
              next.delete(row.id);
              return next;
            });
            Alert.alert('已取消加锁');
          })
          .catch(() => Alert.alert('解锁失败', '请稍后再试。'));
      });
    }
  };

  const changeVisibility = (row: Row, visibility: DiaryVisibility) => {
    // 「指定」需要选人:已同步的日记跳白名单选择页;
    // 未同步的本地日记没有服务器 id,先仅切换档位
    if (visibility === 'restricted' && row.kind === 'entry') {
      router.push({ pathname: '/visibility-picker', params: { diaryId: row.id } });
      return;
    }
    setVisibility(row.id, visibility).catch(() => {});
  };

  const openDetail = (row: Row) => {
    if (row.kind !== 'entry') return;
    const go = () => {
      router.push({
        pathname: '/diary-editor',
        params: {
          diaryId: row.id,
          initialContent: row.item.content,
          createdAt: row.item.created_at,
        },
      });
    };
    // 短按加锁日记:验证通过直接进详情页,锁状态保持不变
    if (row.item.locked && lockPattern) {
      setLockError(false);
      setLockGate(() => go);
      return;
    }
    go();
  };

  return (
    <ScreenBackground setting={diaryBg}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {/* 点标题呼出/收起左侧导航栏 */}
          <Pressable onPress={useUiStore.getState().toggleRail} hitSlop={8}>
            <ThemedText type="title">日记</ThemedText>
          </Pressable>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.headerButton}
              onPress={() => setShowCalendar((v) => !v)}
              hitSlop={8}>
              <IconSymbol
                size={24}
                name="calendar"
                color={showCalendar || selectedDate ? Colors[colorScheme].tint : Colors[colorScheme].icon}
              />
            </Pressable>
            <Pressable style={styles.headerButton} onPress={() => router.push('/appearance')} hitSlop={8}>
              <IconSymbol size={24} name="paintbrush.fill" color={Colors[colorScheme].icon} />
            </Pressable>
          </View>
        </View>

        {showCalendar && (
          <DiaryCalendar
            marked={markedDates}
            selected={selectedDate}
            onSelect={(d) => setSelectedDate(d)}
          />
        )}
        {selectedDate && (
          <Pressable style={styles.filterChip} onPress={() => setSelectedDate(null)}>
            <ThemedText style={styles.filterChipText}>
              {selectedDate} · {rows.length} 篇 ✕
            </ThemedText>
          </Pressable>
        )}

        <Pressable style={styles.statusChip} onPress={() => router.push('/status-editor')}>
          <ThemedText style={styles.statusText}>
            {status ? `今日：${status}` : '今日：'}
          </ThemedText>
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}

        <FlatList
          data={rows}
          numColumns={2}
          keyExtractor={(row) => row.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
          columnWrapperStyle={styles.noteRow}
          contentContainerStyle={[
            styles.listContent,
            rows.length === 0 && styles.emptyContainer,
            { paddingBottom: insets.bottom + 96 },
          ]}
          ListEmptyComponent={
            !loading ? (
              <ThemedText style={styles.emptyText}>
                还没有日记。写下的每一篇，都会成为化身更像你的材料。
              </ThemedText>
            ) : null
          }
          renderItem={({ item }) => (
            <DiaryNote
              row={item}
              unlocked={item.kind === 'entry' && unlockedDiaryIds.has(item.id)}
              onPress={() => openDetail(item)}
              onLongPress={() => setActionRow(item)}
            />
          )}
        />

        {/* 长按便签的操作面板 */}
        <Modal visible={actionRow !== null} transparent animationType="fade">
          <Pressable style={styles.actionOverlay} onPress={() => setActionRow(null)}>
            {/* 内层 Pressable 吃掉点击,避免点面板本体误关闭 */}
            <Pressable
              style={[
                styles.actionPanel,
                { backgroundColor: colorScheme === 'dark' ? '#1c1e22' : '#fff' },
              ]}
              onPress={() => {}}>
              {actionRow?.kind === 'entry' && (
                <>
                  <ThemedText style={styles.actionTitle}>谁能看到这篇</ThemedText>
                  <View style={styles.actionPills}>
                    {VISIBILITY_OPTIONS.map((option) => {
                      const active =
                        (actionRow.item.visibility as DiaryVisibility) === option.key;
                      return (
                        <Pressable
                          key={option.key}
                          style={[
                            styles.actionPill,
                            active && { backgroundColor: Colors[colorScheme].tint },
                          ]}
                          onPress={() => {
                            const row = actionRow;
                            setActionRow(null);
                            changeVisibility(row, option.key);
                          }}>
                          <Text
                            style={[
                              styles.actionPillText,
                              active && {
                                color: colorScheme === 'dark' ? '#151718' : '#fff',
                              },
                            ]}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable
                    style={styles.actionItem}
                    onPress={() => {
                      const row = actionRow;
                      setActionRow(null);
                      toggleLock(row);
                    }}>
                    <IconSymbol size={17} name="lock.fill" color={Colors[colorScheme].icon} />
                    <ThemedText style={styles.actionItemText}>
                      {actionRow.item.locked ? '取消加锁' : '加锁(手势图案)'}
                    </ThemedText>
                  </Pressable>
                </>
              )}
              <Pressable
                style={styles.actionItem}
                onPress={() => {
                  const row = actionRow;
                  setActionRow(null);
                  if (row) confirmDelete(row);
                }}>
                <ThemedText style={[styles.actionItemText, styles.actionDelete]}>
                  删除这篇日记
                </ThemedText>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        {/* 手势锁验证弹层 */}
        <Modal visible={lockGate !== null} transparent animationType="fade">
          <View style={styles.lockOverlay}>
            <View style={[styles.lockPanel, { backgroundColor: colorScheme === 'dark' ? '#1c1e22' : '#fff' }]}>
              <ThemedText style={styles.lockTitle}>绘制图案以解锁私密日记</ThemedText>
              {lockError && <Text style={styles.lockErrorText}>图案不对,再试一次</Text>}
              <PatternLock
                onComplete={(pattern) => {
                  if (pattern === lockPattern) {
                    const go = lockGate;
                    setLockGate(null);
                    go?.();
                  } else {
                    setLockError(true);
                  }
                }}
              />
              <Pressable onPress={() => setLockGate(null)} style={styles.lockCancel}>
                <ThemedText style={styles.lockCancelText}>取消</ThemedText>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Pressable
          style={[
            styles.fab,
            {
              backgroundColor: colorScheme === 'dark' ? '#f4f5f8' : '#ffffff',
              bottom: insets.bottom + 24,
            },
          ]}
          onPress={() => router.push('/diary-editor')}>
          <Text style={styles.fabText}>+</Text>
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
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 12,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChip: {
    alignSelf: 'flex-start',
    marginHorizontal: 24,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 13,
    backgroundColor: 'rgba(127,127,127,0.13)',
  },
  filterChipText: { fontSize: 13, opacity: 0.75 },
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
  listContent: { paddingTop: 8, paddingHorizontal: 16 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { opacity: 0.55, paddingHorizontal: 42, textAlign: 'center', lineHeight: 22 },
  // 一行两张便签
  noteRow: { gap: 12, marginBottom: 12 },
  note: {
    flex: 1,
    height: 172,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 250, 235, 0.22)',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  noteTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 7,
  },
  noteDate: { fontSize: 12, opacity: 0.5, lineHeight: 16 },
  noteContent: { flex: 1, fontSize: 14, lineHeight: 19 },
  noteLockedText: { flex: 1, fontSize: 13, opacity: 0.5, paddingTop: 6, lineHeight: 19 },
  noteBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  noteEdit: { fontSize: 11, opacity: 0.55, lineHeight: 14 },
  badge: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  badgePublic: { color: '#6fc6a5', backgroundColor: 'rgba(111,198,165,0.12)' },
  badgeRestricted: { color: '#78aee5', backgroundColor: 'rgba(120,174,229,0.15)' },
  badgePrivate: { color: '#a9a9b8', backgroundColor: 'rgba(169,169,184,0.14)' },
  badgePending: { color: '#d89b3d', backgroundColor: 'rgba(216,155,61,0.15)' },
  // 长按操作面板
  actionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 34,
  },
  actionPanel: {
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 18,
    gap: 4,
  },
  actionTitle: { fontSize: 13, opacity: 0.55, marginBottom: 8 },
  actionPills: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  actionPill: {
    flex: 1,
    minHeight: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(127,127,127,0.13)',
  },
  actionPillText: { fontSize: 14, fontWeight: '600', color: 'rgba(127,127,127,0.95)' },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 4,
  },
  actionItemText: { fontSize: 15, fontWeight: '600' },
  actionDelete: { color: '#ca4543' },
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
  lockOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  lockPanel: {
    borderRadius: 22,
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  lockTitle: { textAlign: 'center', fontSize: 15, fontWeight: '600', marginBottom: 6 },
  lockErrorText: { textAlign: 'center', fontSize: 12, color: '#c60', marginBottom: 4 },
  lockCancel: { alignItems: 'center', marginTop: 10 },
  lockCancelText: { fontSize: 13, opacity: 0.5 },
});
