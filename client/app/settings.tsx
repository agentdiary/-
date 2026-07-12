import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/stores/auth-store';

// 手动改:每次发 OTA 前 +1,真机在设置页看这个号确认更新到没到
const APP_VERSION = 'v3.5';

export default function SettingsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const { username, logout } = useAuthStore();
  const [checking, setChecking] = useState(false);

  const checkUpdate = async () => {
    if (checking) return;
    // 开发模式(expo start)没有 updates 运行时,直接跳过
    if (!Updates.isEnabled) {
      Alert.alert('开发模式', '当前不是发布版,无法检查 OTA 更新。');
      return;
    }
    setChecking(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
        Alert.alert('新版本已下载', '重启应用即可生效。', [
          { text: '稍后' },
          { text: '立即重启', onPress: () => Updates.reloadAsync() },
        ]);
      } else {
        Alert.alert('已是最新版本', `当前 ${APP_VERSION}`);
      }
    } catch (e) {
      Alert.alert('检查更新失败', e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert('退出登录?', '本机的离线日记队列会保留,下次登录后继续同步。', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: async () => {
          await logout();
          // 关掉设置弹层并直接回登录页(tabs 的 Redirect 只在其获得焦点时生效)
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      {/* 账号卡片 */}
      <View style={styles.accountCard}>
        <View style={[styles.avatar, { backgroundColor: Colors[scheme].tint }]}>
          <Text style={styles.avatarInitial}>
            {(username ?? '?').slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View>
          <ThemedText style={styles.accountName}>{username}</ThemedText>
          <ThemedText style={styles.accountHint}>当前登录的账号</ThemedText>
        </View>
      </View>

      <Pressable style={styles.rowItem} onPress={() => router.push('/appearance')}>
        <IconSymbol size={20} name="paintbrush.fill" color={Colors[scheme].icon} />
        <ThemedText style={styles.rowText}>外观</ThemedText>
      </Pressable>

      <Pressable
        style={styles.rowItem}
        onPress={() => router.push({ pathname: '/pattern-setup', params: { mode: 'set' } })}>
        <IconSymbol size={20} name="lock.fill" color={Colors[scheme].icon} />
        <ThemedText style={styles.rowText}>手势锁图案</ThemedText>
      </Pressable>

      <Pressable style={styles.rowItem} onPress={checkUpdate}>
        <IconSymbol size={20} name="arrow.clockwise" color={Colors[scheme].icon} />
        <ThemedText style={styles.rowText}>
          {checking ? '正在检查更新...' : '检查更新'}
        </ThemedText>
        <ThemedText style={styles.versionText}>{APP_VERSION}</ThemedText>
      </Pressable>

      <Pressable style={[styles.rowItem, styles.logoutItem]} onPress={confirmLogout}>
        <IconSymbol size={20} name="rectangle.portrait.and.arrow.right" color="#ca4543" />
        <Text style={[styles.rowText, styles.logoutText]}>退出登录</Text>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 10 },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(127,127,127,0.10)',
    marginBottom: 8,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 21, fontWeight: '700' },
  accountName: { fontSize: 19, fontWeight: '700' },
  accountHint: { fontSize: 12, opacity: 0.5, marginTop: 3 },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(127,127,127,0.08)',
  },
  rowText: { fontSize: 15, fontWeight: '600' },
  versionText: { fontSize: 12, opacity: 0.45, marginLeft: 'auto' },
  logoutItem: { marginTop: 14, backgroundColor: 'rgba(202,69,67,0.10)' },
  logoutText: { color: '#ca4543' },
});
