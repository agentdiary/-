import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import { AgentChat } from '@/components/agent-chat';
import { ThemedView } from '@/components/themed-view';

export default function VisitAgentScreen() {
  const { userId, username } = useLocalSearchParams<{ userId: string; username?: string }>();

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: `${username ?? 'TA'} 的化身` }} />
      <AgentChat
        targetUserId={userId}
        emptyHint={`这是 ${username ?? 'TA'} 的数字化身,由 TA 的日记喂养。打个招呼吧——它会以 TA 的口吻和你聊。`}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
