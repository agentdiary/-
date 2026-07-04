import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/stores/auth-store';

export default function LoginScreen() {
  const scheme = useColorScheme() ?? 'light';
  const tint = Colors[scheme].tint;
  const onTint = scheme === 'dark' ? '#151718' : '#fff';
  const { login, register } = useAuthStore();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!username.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          AgentDiary
        </ThemedText>
        <ThemedText style={styles.subtitle}>写日记,养一个像你的化身</ThemedText>

        <TextInput
          style={[styles.input, { color: Colors[scheme].text }]}
          placeholder="用户名"
          placeholderTextColor="rgba(127,127,127,0.6)"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={[styles.input, { color: Colors[scheme].text }]}
          placeholder={mode === 'register' ? '密码(至少 6 位)' : '密码'}
          placeholderTextColor="rgba(127,127,127,0.6)"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, { backgroundColor: tint, opacity: busy ? 0.6 : 1 }]}
          disabled={busy}
          onPress={submit}>
          {busy ? (
            <ActivityIndicator color={onTint} />
          ) : (
            <Text style={[styles.buttonText, { color: onTint }]}>
              {mode === 'login' ? '登录' : '注册'}
            </Text>
          )}
        </Pressable>

        <Pressable
          style={styles.switchMode}
          onPress={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}>
          <ThemedText style={styles.switchText}>
            {mode === 'login' ? '没有账号?注册一个' : '已有账号?去登录'}
          </ThemedText>
        </Pressable>

        <View style={styles.notice}>
          <ThemedText style={styles.noticeText}>
            日记是最高敏感级数据:仅用于训练你自己的化身;别人和你的化身对话时,不会看到日记原文。
          </ThemedText>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 32 },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', opacity: 0.6, marginTop: 8, marginBottom: 32 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(127,127,127,0.3)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  error: { color: '#c00', marginBottom: 12, textAlign: 'center' },
  button: {
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  switchMode: { marginTop: 16, alignItems: 'center' },
  switchText: { opacity: 0.7, fontSize: 14 },
  notice: { marginTop: 40, paddingHorizontal: 8 },
  noticeText: { fontSize: 12, opacity: 0.45, textAlign: 'center', lineHeight: 18 },
});
