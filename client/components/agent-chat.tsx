// 通用化身聊天组件:targetUserId 不传 = 和自己的化身;传 = 访问他人化身。
// 历史与上下文全部由后端持久化和组装,组件只管展示与收发。

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  type ImageSourcePropType,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

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
}: {
  targetUserId?: string;
  emptyHint: string;
  // 化身消息旁的小头像(名人肖像);不传则不显示
  avatarImage?: ImageSourcePropType;
}) {
  const scheme = useColorScheme() ?? 'light';
  const tint = Colors[scheme].tint;
  // 深色模式 tint 是白色,气泡/按钮上的文字要用深色才可见
  const onTint = scheme === 'dark' ? '#151718' : '#fff';

  // 倒序存储(最新在前),配合 inverted FlatList
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>
      <FlatList
        // 空列表时不启用 inverted:各平台对空态组件的翻转行为不一致,会把提示文字翻转
        inverted={messages.length > 0}
        data={messages}
        keyExtractor={(m) => m.id}
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
          <ThemedText style={styles.typingText}>化身正在思考(约 10~30 秒)…</ThemedText>
        </View>
      )}
      {error && <Text style={styles.error}>出错了:{error}</Text>}

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { color: Colors[scheme].text }]}
          placeholder="说点什么…"
          placeholderTextColor="rgba(127,127,127,0.6)"
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
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginVertical: 4,
  },
  bubbleMe: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleAvatar: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    backgroundColor: 'rgba(127,127,127,0.15)',
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
  error: { color: '#c00', paddingHorizontal: 20, paddingVertical: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(127,127,127,0.3)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    // 略微填充,保证在图片背景上可读
    backgroundColor: 'rgba(127,127,127,0.08)',
  },
  sendBtn: { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
  sendText: { fontSize: 15, fontWeight: '600' },
});
