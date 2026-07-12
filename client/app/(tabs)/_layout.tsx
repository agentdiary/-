import { router, usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// 导航收进右下角 + 号:点按写日记,长按弹出 日记/对话/设置 菜单。
// TabList 仍必须挂在 Tabs 下(display:none 隐藏):trigger 一旦不在
// children 里,navigator 零屏幕会启动即崩(v3.1 的教训);实际跳转走 router。
const MENU_ITEMS = [
  { key: '/', label: '日记', icon: 'book.fill' as const },
  { key: '/chats', label: '对话', icon: 'bubble.left.and.bubble.right.fill' as const },
  { key: '/settings', label: '设置', icon: 'gearshape.fill' as const },
];

export default function TabLayout() {
  const scheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const dark = scheme === 'dark';
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (key: string) => {
    setMenuOpen(false);
    if (key === pathname) return;
    if (key === '/settings') {
      router.push('/settings');
    } else {
      // tab 间切换:navigate 会命中 tab 路由器的 switch,replace 在
      // headless tabs 下切不动(实测)
      router.navigate(key as '/' | '/chats');
    }
  };

  return (
    // FAB/菜单必须是 Tabs 的兄弟而非子节点:Tabs 会把非 TabList/TabSlot
    // 的子节点塞进一条 0×0 的包装链,绝对定位会整个跑出屏幕
    <View style={styles.root}>
      <Tabs style={styles.root}>
        <TabList style={styles.hiddenTabList}>
          <TabTrigger name="index" href="/" />
          <TabTrigger name="chats" href="/chats" />
        </TabList>
        <TabSlot style={styles.slot} />
      </Tabs>

      {/* 全局悬浮 + 号:点按写日记,长按呼出导航菜单 */}
      <Pressable
        style={[
          styles.fab,
          {
            backgroundColor: dark ? '#f4f5f8' : '#ffffff',
            bottom: insets.bottom + 24,
          },
        ]}
        onPress={() => router.push('/diary-editor')}
        onLongPress={() => setMenuOpen(true)}
        delayLongPress={280}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {/* 导航菜单:普通绝对定位覆盖层,不用 RN Modal——tabs 布局本身全屏,
          覆盖层足够;Modal 的 portal 在 web 上还会吞事件 */}
      {menuOpen && (
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View
            style={[
              styles.menuPanel,
              {
                bottom: insets.bottom + 24 + 84,
                backgroundColor: dark ? '#1c1e22' : '#fff',
              },
            ]}>
            {MENU_ITEMS.map((item) => {
              const active = pathname === item.key;
              const color = active ? Colors[scheme].tint : Colors[scheme].icon;
              return (
                <Pressable key={item.key} style={styles.menuItem} onPress={() => go(item.key)}>
                  <IconSymbol size={22} name={item.icon} color={color} />
                  <Text
                    style={[
                      styles.menuLabel,
                      { color: active ? Colors[scheme].tint : Colors[scheme].text },
                      active && styles.menuLabelActive,
                    ]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hiddenTabList: { display: 'none' },
  slot: { flex: 1 },
  fab: {
    position: 'absolute',
    right: 28,
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  fabText: { color: '#0b0c12', fontSize: 42, lineHeight: 48, fontWeight: '300' },
  menuOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  menuPanel: {
    position: 'absolute',
    right: 28,
    minWidth: 168,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  menuLabel: { fontSize: 16, fontWeight: '600' },
  menuLabelActive: { fontWeight: '800' },
});
