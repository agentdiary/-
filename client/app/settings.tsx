import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api, avatarUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

// 手动改:每次发 OTA 前 +1,真机在设置页看这个号确认更新到没到
const APP_VERSION = 'v3.9';

export default function SettingsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const tint = Colors[scheme].tint;
  const onTint = scheme === 'dark' ? '#151718' : '#fff';
  const { username, userId, avatarTs, logout, setUsername, setAvatarTs } = useAuthStore();
  const [checking, setChecking] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  // 展开的编辑面板:一次只开一个
  const [editing, setEditing] = useState<'name' | 'password' | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [saving, setSaving] = useState(false);

  // 更换头像:选图(方形裁剪)→ base64 上传;服务端时间戳兼作缓存指纹
  const pickAvatar = async () => {
    if (avatarBusy) return;
    setAvatarBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      const b64 = result.assets?.[0]?.base64;
      if (result.canceled || !b64) return;
      const r = await api.uploadAvatar(b64);
      await setAvatarTs(r.avatar_updated_at);
    } catch (e) {
      Alert.alert('头像更新失败', e instanceof Error ? e.message : String(e));
    } finally {
      setAvatarBusy(false);
    }
  };

  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const r = await api.changeUsername(name);
      await setUsername(r.username);
      setEditing(null);
      Alert.alert('账号名已修改', `现在叫「${r.username}」。`);
    } catch (e) {
      Alert.alert('修改失败', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    if (!oldPwd || newPwd.length < 6 || saving) return;
    setSaving(true);
    try {
      await api.changePassword(oldPwd, newPwd);
      setOldPwd('');
      setNewPwd('');
      setEditing(null);
      Alert.alert('密码已修改', '其他设备上的登录已全部退出。');
    } catch (e) {
      Alert.alert('修改失败', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

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
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* 账号卡片:点头像即可更换 */}
        <View style={styles.accountCard}>
          <Pressable onPress={pickAvatar} hitSlop={6}>
            {userId && avatarTs ? (
              <Image source={{ uri: avatarUrl(userId, avatarTs) }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: tint }]}>
                <Text style={styles.avatarInitial}>
                  {(username ?? '?').slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.avatarBadge}>
              <Text style={styles.avatarBadgeText}>{avatarBusy ? '…' : '✎'}</Text>
            </View>
          </Pressable>
          <View>
            <ThemedText style={styles.accountName}>{username}</ThemedText>
            <ThemedText style={styles.accountHint}>当前登录的账号 · 点头像更换</ThemedText>
          </View>
        </View>

        {/* 修改账号名 */}
        <Pressable
          style={styles.rowItem}
          onPress={() => {
            setNameDraft(username ?? '');
            setEditing(editing === 'name' ? null : 'name');
          }}>
          <IconSymbol size={20} name="person.2.fill" color={Colors[scheme].icon} />
          <ThemedText style={styles.rowText}>修改账号名</ThemedText>
        </Pressable>
        {editing === 'name' && (
          <View style={styles.editPanel}>
            <TextInput
              style={[styles.input, { color: Colors[scheme].text }]}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="新账号名(2~20 字)"
              placeholderTextColor="rgba(127,127,127,0.6)"
              maxLength={20}
              autoFocus
            />
            <Pressable
              style={[
                styles.saveBtn,
                { backgroundColor: tint, opacity: nameDraft.trim() && !saving ? 1 : 0.4 },
              ]}
              disabled={!nameDraft.trim() || saving}
              onPress={saveName}>
              <Text style={[styles.saveBtnText, { color: onTint }]}>
                {saving ? '保存中...' : '保存'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* 修改密码 */}
        <Pressable
          style={styles.rowItem}
          onPress={() => {
            setOldPwd('');
            setNewPwd('');
            setEditing(editing === 'password' ? null : 'password');
          }}>
          <IconSymbol size={20} name="lock.fill" color={Colors[scheme].icon} />
          <ThemedText style={styles.rowText}>修改密码</ThemedText>
        </Pressable>
        {editing === 'password' && (
          <View style={styles.editPanel}>
            <TextInput
              style={[styles.input, { color: Colors[scheme].text }]}
              value={oldPwd}
              onChangeText={setOldPwd}
              placeholder="当前密码"
              placeholderTextColor="rgba(127,127,127,0.6)"
              secureTextEntry
              autoFocus
            />
            <TextInput
              style={[styles.input, { color: Colors[scheme].text }]}
              value={newPwd}
              onChangeText={setNewPwd}
              placeholder="新密码(至少 6 位)"
              placeholderTextColor="rgba(127,127,127,0.6)"
              secureTextEntry
            />
            <ThemedText style={styles.editHint}>修改后,其他设备的登录会全部退出。</ThemedText>
            <Pressable
              style={[
                styles.saveBtn,
                {
                  backgroundColor: tint,
                  opacity: oldPwd && newPwd.length >= 6 && !saving ? 1 : 0.4,
                },
              ]}
              disabled={!oldPwd || newPwd.length < 6 || saving}
              onPress={savePassword}>
              <Text style={[styles.saveBtnText, { color: onTint }]}>
                {saving ? '保存中...' : '保存'}
              </Text>
            </Pressable>
          </View>
        )}

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
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 20, gap: 10 },
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
  avatarBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(127,127,127,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBadgeText: { color: '#fff', fontSize: 11, lineHeight: 13 },
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
  editPanel: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(127,127,127,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(127,127,127,0.25)',
  },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: 'rgba(127,127,127,0.3)',
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    backgroundColor: 'rgba(127,127,127,0.08)',
  },
  editHint: { fontSize: 12, opacity: 0.5 },
  saveBtn: {
    minHeight: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 14, fontWeight: '700' },
  logoutItem: { marginTop: 14, backgroundColor: 'rgba(202,69,67,0.10)' },
  logoutText: { color: '#ca4543' },
});
