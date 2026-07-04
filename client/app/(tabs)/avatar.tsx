// 说明:CLAUDE.md 约定聊天 UI 优先 gifted-chat,但其 3.x 依赖的
// react-native-keyboard-controller 原生模块不在 Expo Go 中,导入即崩溃。
// Phase 0 依赖 Expo Go 真机预览,故改用轻量自绘聊天界面;
// 后续转 EAS dev build 后可再评估换回 gifted-chat。

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { type ChatMessage, useChatStore } from '@/stores/chat-store';

export default function AvatarChatScreen() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() ?? 'light';
  const tint = Colors[scheme].tint;
  // 深色模式 tint 是白色,气泡/按钮上的文字要用深色才可见
  const onTint = scheme === 'dark' ? '#151718' : '#fff';
  const { messages, sending, error, send, load } = useChatStore();
  const [draft, setDraft] = useState('');

  useEffect(() => {
    load();
  }, [load]);

  const submit = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    send(text);
  };

  const renderItem = ({ item }: { item: ChatMessage }) => (
    <View
      style={[
        styles.bubble,
        item.from === 'me'
          ? [styles.bubbleMe, { backgroundColor: tint }]
          : styles.bubbleAvatar,
      ]}>
      <Text style={[styles.bubbleText, { color: item.from === 'me' ? onTint : Colors[scheme].text }]}>
        {item.text}
      </Text>
    </View>
  );

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        {/* v2 为临时版本标记,用于确认真机加载了新 bundle;问题定位后移除 */}
        <ThemedText type="title">化身 v2</ThemedText>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.bottom + 48}>
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ThemedText style={styles.empty}>
              这是你的数字化身,由你的日记喂养。说点什么试试——写的日记越多,它越像你。
            </ThemedText>
          }
        />

        {sending && (
          <View style={styles.typing}>
            <ActivityIndicator size="small" />
            <ThemedText style={styles.typingText}>化身正在思考(本地推理约 10~30 秒)…</ThemedText>
          </View>
        )}
        {error && <Text style={styles.error}>发送失败:{error}</Text>}

        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { color: Colors[scheme].text }]}
            placeholder="和你的化身聊聊…"
            placeholderTextColor="rgba(127,127,127,0.6)"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submit}
            returnKeyType="send"
            editable={!sending}
          />
          <Pressable
            style={[styles.sendBtn, { backgroundColor: tint, opacity: draft.trim() && !sending ? 1 : 0.4 }]}
            disabled={!draft.trim() || sending}
            onPress={submit}>
            <Text style={[styles.sendText, { color: onTint }]}>发送</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  list: { paddingHorizontal: 16, paddingVertical: 8, flexGrow: 1 },
  empty: {
    opacity: 0.5,
    textAlign: 'center',
    paddingHorizontal: 40,
    // inverted 列表里空态会被上下翻转,翻回来
    transform: [{ scaleY: -1 }],
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
  bubbleText: { fontSize: 16, lineHeight: 22 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 4 },
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
  },
  sendBtn: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  sendText: { fontSize: 15, fontWeight: '600' },
});
