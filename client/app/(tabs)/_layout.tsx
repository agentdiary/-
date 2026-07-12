import { router } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import React, { type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// 自绘常驻左侧栏:material 侧边变体在窄屏真机上会自动收起,
// 改用 headless tabs(expo-router/ui)完全接管布局,栏永远可见
const RAIL_WIDTH = 74;

type RailButtonProps = ComponentProps<typeof Pressable> & {
  icon: ComponentProps<typeof IconSymbol>['name'];
  label: string;
  isFocused?: boolean;
};

// TabTrigger asChild 会把 onPress/isFocused 注入到这个组件
function RailButton({ icon, label, isFocused, ...rest }: RailButtonProps) {
  const scheme = useColorScheme() ?? 'light';
  const color = isFocused ? Colors[scheme].tint : Colors[scheme].icon;
  return (
    <Pressable {...rest} style={styles.item} hitSlop={6}>
      <IconSymbol size={26} name={icon} color={color} />
      <Text style={[styles.label, { color, fontWeight: isFocused ? '700' : '600' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function TabLayout() {
  const scheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const dark = scheme === 'dark';

  return (
    <Tabs>
      <View style={styles.row}>
        <View
          style={[
            styles.rail,
            {
              paddingTop: insets.top + 14,
              paddingBottom: insets.bottom + 14,
              paddingLeft: insets.left,
              backgroundColor: dark ? 'rgba(21,23,24,0.96)' : 'rgba(248,249,251,0.96)',
            },
          ]}>
          <TabList style={styles.tabList}>
            <TabTrigger name="index" href="/" asChild>
              <RailButton icon="book.fill" label="日记" />
            </TabTrigger>
            <TabTrigger name="chats" href="/chats" asChild>
              <RailButton icon="bubble.left.and.bubble.right.fill" label="对话" />
            </TabTrigger>
          </TabList>

          <View style={styles.spacer} />

          {/* 设置(账号信息/退出登录)固定在栏底 */}
          <Pressable style={styles.item} hitSlop={6} onPress={() => router.push('/settings')}>
            <IconSymbol size={25} name="gearshape.fill" color={Colors[scheme].icon} />
            <Text style={[styles.label, { color: Colors[scheme].icon }]}>设置</Text>
          </Pressable>
        </View>
        <TabSlot style={styles.slot} />
      </View>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  rail: {
    width: RAIL_WIDTH,
    alignItems: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(127,127,127,0.25)',
  },
  tabList: { flexDirection: 'column', gap: 6 },
  spacer: { flex: 1 },
  item: {
    width: RAIL_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 3,
  },
  // 显式 lineHeight:安卓对小号粗体的默认行高偏紧,会裁掉字底
  label: { fontSize: 11, lineHeight: 15 },
  slot: { flex: 1 },
});
