import { router } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import React, { type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useUiStore } from '@/stores/ui-store';

// 自绘常驻左侧栏:material 侧边变体在窄屏真机上会自动收起,
// 改用 headless tabs(expo-router/ui)完全接管布局,栏永远可见。
// 注意:TabTrigger 必须放在「作为 Tabs 直接子节点的 TabList」里,
// 包一层 View 会让 trigger 解析不到 → navigator 零屏幕 → 启动即崩
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
  const railVisible = useUiStore((s) => s.railVisible);
  const hideRail = useUiStore((s) => s.hideRail);

  return (
    <Tabs style={styles.root}>
      {/* 收起时用 display:none 而不是条件渲染:TabList 一旦不在 children 里,
          trigger 解析不到会让 navigator 零屏幕直接崩(v3.1 的教训) */}
      <TabList
        style={[
          styles.rail,
          {
            paddingTop: insets.top + 14,
            paddingBottom: insets.bottom + 14,
            paddingLeft: insets.left,
            backgroundColor: dark ? 'rgba(21,23,24,0.96)' : 'rgba(248,249,251,0.96)',
          },
          !railVisible && styles.railHidden,
        ]}>
        <TabTrigger name="index" href="/" asChild>
          <RailButton icon="book.fill" label="日记" />
        </TabTrigger>
        <TabTrigger name="chats" href="/chats" asChild>
          <RailButton icon="bubble.left.and.bubble.right.fill" label="对话" />
        </TabTrigger>

        {/* 空白区点按收起左栏 */}
        <Pressable style={styles.spacer} onPress={hideRail} />

        {/* 设置(账号信息/退出登录)固定在栏底;非 trigger 子节点只渲染不参与路由 */}
        <Pressable style={styles.item} hitSlop={6} onPress={() => router.push('/settings')}>
          <IconSymbol size={25} name="gearshape.fill" color={Colors[scheme].icon} />
          <Text style={[styles.label, { color: Colors[scheme].icon }]}>设置</Text>
        </Pressable>
      </TabList>
      <TabSlot style={styles.slot} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Tabs 的 style 会整体覆盖其默认样式,flex:1 必须自带
  root: { flex: 1, flexDirection: 'row' },
  rail: {
    // 覆盖 TabList 默认的 row/space-between
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'center',
    width: RAIL_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(127,127,127,0.25)',
  },
  railHidden: { display: 'none' },
  spacer: { flex: 1, alignSelf: 'stretch' },
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
