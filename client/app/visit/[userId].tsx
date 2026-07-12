import { useHeaderHeight } from '@react-navigation/elements';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AgentChat } from '@/components/agent-chat';
import { DirectChat } from '@/components/direct-chat';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api, avatarUrl } from '@/lib/api';
import { CELEBRITY_PORTRAITS } from '@/lib/celebrity-portraits';
import type { JudgeStatus } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';

export default function VisitAgentScreen() {
  const { userId, username, builtin, avatarTs } = useLocalSearchParams<{
    userId: string;
    username?: string;
    builtin?: string;
    avatarTs?: string;
  }>();
  const scheme = useColorScheme() ?? 'light';
  const tint = Colors[scheme].tint;
  const chatBg = useSettingsStore((s) => s.chatBg);
  const myId = useAuthStore((s) => s.userId);
  // 聊天气泡旁的头像:自定义头像 > 名人内置画像
  const portrait =
    avatarTs && userId
      ? { uri: avatarUrl(userId, avatarTs) }
      : username
        ? CELEBRITY_PORTRAITS[username]
        : undefined;
  // 此页有导航头:键盘规避需要补上 header 高度(含状态栏)
  const headerHeight = useHeaderHeight();

  const isSelf = userId === myId;
  // 名人化身没有真人,不显示裁判入口
  const judgeable = !isSelf && builtin !== '1';

  const [judge, setJudge] = useState<JudgeStatus | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [mode, setMode] = useState<'avatar' | 'real'>('avatar');

  const refreshJudge = useCallback(() => {
    if (!judgeable || !userId) return;
    api
      .getJudgeStatus(userId)
      .then(setJudge)
      .catch(() => {});
  }, [judgeable, userId]);

  useEffect(() => {
    refreshJudge();
  }, [refreshJudge]);

  const evaluate = async () => {
    if (evaluating || !userId) return;
    setEvaluating(true);
    setJudgeError(null);
    try {
      const status = await api.evaluateMatch(userId);
      setJudge(status);
      setShowReport(true);
    } catch (e) {
      setJudgeError(e instanceof Error ? e.message : String(e));
    } finally {
      setEvaluating(false);
    }
  };

  const report = judge?.report ?? null;
  const unlocked = judge?.unlocked ?? false;
  const turnsLeft = judge ? Math.max(0, judge.min_turns - judge.visitor_turns) : null;

  const title = isSelf ? '我的化身' : `${username ?? 'TA'} 的化身`;
  const emptyHint = isSelf
    ? '这是你的数字化身,由你的日记喂养。说点什么试试——写的日记越多,它越像你。'
    : `这是 ${username ?? 'TA'} 的数字化身，由 TA 的日记喂养。打个招呼吧，它会以 TA 的口吻和你聊。`;

  return (
    <ScreenBackground setting={chatBg}>
      <Stack.Screen options={{ title }} />

      {judgeable && (
        <View style={styles.toolbar}>
          {unlocked ? (
            // 已解锁:化身/真人切换
            <View style={styles.segment}>
              {(
                [
                  { key: 'avatar', label: '化身' },
                  { key: 'real', label: `${username ?? 'TA'} 本人` },
                ] as const
              ).map((opt) => {
                const active = mode === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    style={[styles.segmentBtn, active && { backgroundColor: tint }]}
                    onPress={() => setMode(opt.key)}>
                    <Text
                      style={[
                        styles.segmentText,
                        active && { color: scheme === 'dark' ? '#151718' : '#fff' },
                      ]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Pressable
              style={[styles.judgeBtn, evaluating && styles.judgeBtnBusy]}
              disabled={evaluating}
              onPress={evaluate}>
              {evaluating ? (
                <>
                  <ActivityIndicator size="small" />
                  <ThemedText style={styles.judgeBtnText}>裁判审读中,约半分钟...</ThemedText>
                </>
              ) : (
                <ThemedText style={styles.judgeBtnText}>
                  ⚖️ AI 裁判评估契合度
                  {turnsLeft !== null && turnsLeft > 0 ? `(再聊 ${turnsLeft} 句)` : ''}
                </ThemedText>
              )}
            </Pressable>
          )}

          {report && (
            <Pressable
              style={[styles.scoreChip, report.passed && styles.scoreChipPassed]}
              onPress={() => setShowReport(true)}>
              <Text style={[styles.scoreText, report.passed && styles.scoreTextPassed]}>
                {report.score} 分
              </Text>
            </Pressable>
          )}
        </View>
      )}
      {judgeError && <Text style={styles.judgeError}>{judgeError}</Text>}

      {judgeable && unlocked && mode === 'real' ? (
        <DirectChat
          userId={userId}
          username={username ?? 'TA'}
          keyboardOffset={headerHeight}
        />
      ) : (
        <AgentChat
          targetUserId={userId}
          avatarImage={portrait}
          keyboardOffset={headerHeight}
          emptyHint={emptyHint}
          onMessageSent={judgeable ? refreshJudge : undefined}
        />
      )}

      {/* 契合度报告弹层 */}
      <Modal visible={showReport} transparent animationType="fade">
        <View style={styles.reportOverlay}>
          <View
            style={[
              styles.reportPanel,
              { backgroundColor: scheme === 'dark' ? '#1c1e22' : '#fff' },
            ]}>
            <ThemedText style={styles.reportTitle}>契合度报告</ThemedText>
            {report && (
              <>
                <Text
                  style={[
                    styles.reportScore,
                    { color: report.passed ? '#4faa7d' : Colors[scheme].text },
                  ]}>
                  {report.score}
                  <Text style={styles.reportScoreUnit}> / 100</Text>
                </Text>
                <ThemedText style={styles.reportSummary}>{report.summary}</ThemedText>
                {report.reasons.map((r, i) => (
                  <ThemedText key={i} style={styles.reportReason}>
                    · {r}
                  </ThemedText>
                ))}
                <ThemedText style={styles.reportVerdict}>
                  {report.passed
                    ? `🎉 裁判认为你们聊得来,与 ${username ?? 'TA'} 本人的对话已解锁。`
                    : '还没到解锁线(70 分)。多和化身聊聊,随时可以再评。'}
                </ThemedText>
              </>
            )}
            <Pressable
              style={[styles.reportClose, { backgroundColor: tint }]}
              onPress={() => {
                setShowReport(false);
                if (report?.passed) setMode('real');
              }}>
              <Text
                style={[
                  styles.reportCloseText,
                  { color: scheme === 'dark' ? '#151718' : '#fff' },
                ]}>
                {report?.passed ? '去和本人聊' : '知道了'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 19,
    backgroundColor: 'rgba(127,127,127,0.13)',
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentText: { fontSize: 13, fontWeight: '600', color: 'rgba(127,127,127,0.9)' },
  judgeBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 19,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(127,127,127,0.13)',
  },
  judgeBtnBusy: { opacity: 0.7 },
  judgeBtnText: { fontSize: 13, fontWeight: '600', opacity: 0.85 },
  scoreChip: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    justifyContent: 'center',
    backgroundColor: 'rgba(127,127,127,0.13)',
  },
  scoreChipPassed: { backgroundColor: 'rgba(79,170,125,0.18)' },
  scoreText: { fontSize: 13, fontWeight: '700', color: 'rgba(127,127,127,0.9)' },
  scoreTextPassed: { color: '#4faa7d' },
  judgeError: { color: '#c44', paddingHorizontal: 20, paddingVertical: 4, fontSize: 12 },
  reportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  reportPanel: {
    borderRadius: 22,
    paddingVertical: 24,
    paddingHorizontal: 22,
  },
  reportTitle: { textAlign: 'center', fontSize: 15, fontWeight: '600', opacity: 0.7 },
  reportScore: { textAlign: 'center', fontSize: 46, fontWeight: '800', marginVertical: 6 },
  reportScoreUnit: { fontSize: 16, fontWeight: '600', opacity: 0.45 },
  reportSummary: { fontSize: 15, lineHeight: 23, marginBottom: 10 },
  reportReason: { fontSize: 13, lineHeight: 20, opacity: 0.75 },
  reportVerdict: { fontSize: 13, lineHeight: 20, marginTop: 12, opacity: 0.85 },
  reportClose: {
    marginTop: 16,
    minHeight: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportCloseText: { fontSize: 15, fontWeight: '700' },
});
