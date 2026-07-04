import { Redirect } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AgentChat } from '@/components/agent-chat';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';

export default function MyAvatarScreen() {
  const insets = useSafeAreaInsets();
  const { token, username, logout } = useAuthStore();
  const chatBg = useSettingsStore((s) => s.chatBg);

  if (!token) {
    return <Redirect href="/login" />;
  }

  return (
    <ScreenBackground setting={chatBg}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <ThemedText type="title">我的化身</ThemedText>
          <Pressable onPress={logout}>
            <ThemedText style={styles.logout}>{username} · 退出</ThemedText>
          </Pressable>
        </View>
        <AgentChat emptyHint="这是你的数字化身,由你的日记喂养。说点什么试试——写的日记越多,它越像你。" />
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
  logout: { fontSize: 13, opacity: 0.5 },
});
