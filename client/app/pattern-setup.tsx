// 手势锁设置页:mode=set 绘制两次确认;mode=disable 验证旧图案后关闭。
// 已有图案时进入 set 模式会先要求验证旧图案。

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { PatternLock } from '@/components/pattern-lock';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSettingsStore } from '@/stores/settings-store';

type Step = 'verify' | 'draw' | 'confirm';

export default function PatternSetupScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const disable = mode === 'disable';
  const { lockPattern, setLockPattern } = useSettingsStore();

  const [step, setStep] = useState<Step>(lockPattern ? 'verify' : 'draw');
  const [firstDraw, setFirstDraw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hint =
    step === 'verify'
      ? '请先绘制当前图案验证身份'
      : step === 'draw'
        ? '绘制新图案(至少连 4 个点)'
        : '再绘制一次确认';

  const onComplete = async (pattern: string) => {
    setError(null);
    if (step === 'verify') {
      if (pattern !== lockPattern) {
        setError('图案不对,再试一次');
        return;
      }
      if (disable) {
        await setLockPattern(null);
        router.back();
        return;
      }
      setStep('draw');
      return;
    }
    if (step === 'draw') {
      setFirstDraw(pattern);
      setStep('confirm');
      return;
    }
    // confirm
    if (pattern !== firstDraw) {
      setError('两次图案不一致,请重新绘制');
      setFirstDraw(null);
      setStep('draw');
      return;
    }
    await setLockPattern(pattern);
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: disable ? '关闭手势锁' : '设置手势锁' }} />
      <ThemedText style={styles.hint}>{hint}</ThemedText>
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}
      <PatternLock onComplete={onComplete} />
      <ThemedText style={styles.note}>
        手势锁只存在这台设备上,用于打开「仅自己」可见的日记。忘记图案时,重新登录即可重置。
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 32, paddingHorizontal: 24 },
  hint: { textAlign: 'center', fontSize: 16, marginBottom: 8 },
  error: { textAlign: 'center', fontSize: 13, color: '#c60', marginBottom: 8 },
  note: { fontSize: 12, opacity: 0.45, textAlign: 'center', marginTop: 28, lineHeight: 18 },
});
