import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/lib/api';
import type { DirectMessageItem } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';

// 没有推送通道,靠前台轮询拿对方的新消息;页面退出即停
const POLL_MS = 4000;

export function DirectChat({
  userId,
  username,
  keyboardOffset,
}: {
  userId: string;
  username: string;
  keyboardOffset?: number;
}) {
  const scheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const tint = Colors[scheme].tint;
  const onTint = scheme === 'dark' ? '#151718' : '#fff';
  const myId = useAuthStore((s) => s.userId);

  const [messages, setMessages] = useState<DirectMessageItem[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 乐观插入的临时消息在下一次轮询返回前保留,防止发送后闪没
  const optimistic = useRef<DirectMessageItem[]>([]);

  // Android + 带导航头的页面:KAV 计算不可靠,监听键盘高度手动垫底(同 AgentChat)
  const manualPad = Platform.OS === 'android' && keyboardOffset !== undefined;
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const kbVisible = kbHeight > 0;

  const load = useCallback(async () => {
    try {
      const items = await api.listDirectMessages(userId);
      const got = new Set(items.map((i) => i.id));
      optimistic.current = optimistic.current.filter((m) => !got.has(m.id));
      setMessages([...optimistic.current, ...items]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [userId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setSending(true);
    const temp: DirectMessageItem = {
      id: `local-${Date.now()}`,
      sender_id: myId ?? '',
      content: text,
      created_at: new Date().toISOString(),
    };
    optimistic.current = [temp, ...optimistic.current];
    setMessages((prev) => [temp, ...prev]);
    try {
      const saved = await api.sendDirectMessage(userId, text);
      optimistic.current = optimistic.current.filter((m) => m.id !== temp.id);
      setMessages((prev) => prev.map((m) => (m.id === temp.id ? saved : m)));
      setError(null);
    } catch (e) {
      optimistic.current = optimistic.current.filter((m) => m.id !== temp.id);
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
      setDraft(text); // 发送失败把草稿还回去
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.flex,
        manualPad && kbVisible && { paddingBottom: Math.max(0, kbHeight - insets.bottom) },
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : manualPad ? undefined : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? (keyboardOffset ?? 0) : 0}>
      <FlatList
        inverted={messages.length > 0}
        data={messages}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, messages.length === 0 && styles.listEmpty]}
        ListEmptyComponent={
          <ThemedText style={styles.empty}>
            AI 裁判觉得你们聊得来,真人对话已解锁。这里是 {username} 本人——说句话吧。
          </ThemedText>
        }
        renderItem={({ item }) =>
          item.sender_id === myId ? (
            <View style={[styles.bubble, styles.bubbleMe, { backgroundColor: tint }]}>
              <Text style={[styles.bubbleText, { color: onTint }]}>{item.content}</Text>
            </View>
          ) : (
            <View style={[styles.bubble, styles.bubblePeer]}>
              <Text style={[styles.bubbleText, { color: Colors[scheme].text }]}>
                {item.content}
              </Text>
            </View>
          )
        }
      />

      {error && <Text style={styles.error}>出错了:{error}</Text>}

      <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TextInput
          style={[styles.input, { color: Colors[scheme].text }]}
          placeholder={`给 ${username} 发消息...`}
          placeholderTextColor="rgba(127,127,127,0.62)"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          returnKeyType="send"
        />
        <Pressable
          style={[
            styles.sendBtn,
            { backgroundColor: tint, opacity: draft.trim() && !sending ? 1 : 0.4 },
          ]}
          disabled={!draft.trim() || sending}
          onPress={submit}>
          <Text style={[styles.sendText, { color: onTint }]}>发送</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: 16, paddingVertical: 8, flexGrow: 1 },
  listEmpty: { justifyContent: 'center' },
  empty: {
    opacity: 0.5,
    textAlign: 'center',
    paddingHorizontal: 40,
    fontSize: 18,
    lineHeight: 28,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 11,
    marginVertical: 4,
  },
  bubbleMe: { alignSelf: 'flex-end', borderBottomRightRadius: 5 },
  bubblePeer: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 5,
    backgroundColor: 'rgba(127,127,127,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  bubbleText: { fontSize: 16, lineHeight: 22 },
  error: { color: '#c44', paddingHorizontal: 20, paddingVertical: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: 'rgba(10,10,14,0.02)',
  },
  input: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: 'rgba(127,127,127,0.3)',
    borderRadius: 23,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: 'rgba(127,127,127,0.08)',
  },
  sendBtn: {
    minWidth: 70,
    minHeight: 46,
    borderRadius: 23,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendText: { fontSize: 15, fontWeight: '600' },
});
