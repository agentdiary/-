import { useHeaderHeight } from '@react-navigation/elements';
import { Stack, useLocalSearchParams } from 'expo-router';

import { AgentChat } from '@/components/agent-chat';
import { ScreenBackground } from '@/components/screen-background';
import { CELEBRITY_PORTRAITS } from '@/lib/celebrity-portraits';
import { useSettingsStore } from '@/stores/settings-store';

export default function VisitAgentScreen() {
  const { userId, username } = useLocalSearchParams<{ userId: string; username?: string }>();
  const chatBg = useSettingsStore((s) => s.chatBg);
  const portrait = username ? CELEBRITY_PORTRAITS[username] : undefined;
  // 此页有导航头:键盘规避需要加上 header 高度(含状态栏)
  const headerHeight = useHeaderHeight();

  return (
    <ScreenBackground setting={chatBg}>
      <Stack.Screen options={{ title: `${username ?? 'TA'} 的化身` }} />
      <AgentChat
        targetUserId={userId}
        avatarImage={portrait}
        keyboardOffset={headerHeight}
        emptyHint={`这是 ${username ?? 'TA'} 的数字化身,由 TA 的日记喂养。打个招呼吧——它会以 TA 的口吻和你聊。`}
      />
    </ScreenBackground>
  );
}
