import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  type ImageSourcePropType,
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

interface Message {
  id: string;
  text: string;
  from: 'me' | 'avatar';
}

export function AgentChat({
  targetUserId,
  emptyHint,
  avatarImage,
  keyboardOffset,
  onMessageSent,
}: {
  targetUserId?: string;
  emptyHint: string;
  avatarImage?: ImageSourcePropType;
  keyboardOffset?: number;
  // 一轮问答落库后回调(裁判入口用它刷新可评估的轮次数)
  onMessageSent?: () => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const tint = Colors[scheme].tint;
  const onTint = scheme === 'dark' ? '#151718' : '#fff';

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Android + 带导航头的页面(传了 keyboardOffset):KAV 在 react-native-screens
  // 的带头容器里计算不可靠(偏高/偏低反复),改为监听键盘高度手动垫底
  const manualPad = Platform.OS === 'android' && keyboardOffset !== undefined;
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    // 两个平台都监听:manualPad 用高度值;其余场景用"键盘是否弹出"
    // 来切换底栏留白(键盘弹出时 KAV 已接管,叠加底栏留白会悬空)
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
      const items = await api.getChatHistory(targetUserId);
      setMessages(
        items
          .map((i) => ({
            id: i.id,
            text: i.content,
            from: i.role === 'user' ? ('me' as const) : ('avatar' as const),
          }))
          .reverse(),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [targetUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setSending(true);
    setError(null);
    setMessages((prev) => [{ id: `me-${Date.now()}`, text, from: 'me' }, ...prev]);
    try {
      const reply = await api.sendToAgent(text, targetUserId);
      setMessages((prev) => [{ id: reply.id, text: reply.content, from: 'avatar' }, ...prev]);
      onMessageSent?.();
    } catch (e) {
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
        ListEmptyComponent={<ThemedText style={styles.empty}>{emptyHint}</ThemedText>}
        renderItem={({ item }) =>
          item.from === 'me' ? (
            <View style={[styles.bubble, styles.bubbleMe, { backgroundColor: tint }]}>
              <Text style={[styles.bubbleText, { color: onTint }]}>{item.text}</Text>
            </View>
          ) : (
            <View style={styles.avatarRow}>
              {avatarImage && <Image source={avatarImage} style={styles.portrait} />}
              <View style={[styles.bubble, styles.bubbleAvatar]}>
                <Text style={[styles.bubbleText, { color: Colors[scheme].text }]}>
                  {item.text}
                </Text>
              </View>
            </View>
          )
        }
      />

      {sending && (
        <View style={styles.typing}>
          <ActivityIndicator size="small" />
          <ThemedText style={styles.typingText}>化身正在思考，约 10~30 秒...</ThemedText>
        </View>
      )}
      {error && <Text style={styles.error}>出错了：{error}</Text>}

      <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TextInput
          style={[styles.input, { color: Colors[scheme].text }]}
          placeholder="说点什么..."
          placeholderTextColor="rgba(127,127,127,0.62)"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          returnKeyType="send"
          editable={!sending}
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
  bubbleAvatar: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 5,
    backgroundColor: 'rgba(127,127,127,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  portrait: { width: 28, height: 28, borderRadius: 14, marginBottom: 6 },
  bubbleText: { fontSize: 16, lineHeight: 22 },
  typing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  typingText: { fontSize: 13, opacity: 0.6 },
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
