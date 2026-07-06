import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        // 悬浮半透明底栏:页面背景(含自定义渐变/图片)从底下透出,天然统一。
        // 高度显式加上底部安全区:安卓 edge-to-edge 下绝对定位的栏拿不到
        // 系统手势条补偿,不加会把标签下半截压在手势条底下
        tabBarStyle: {
          position: 'absolute',
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 10),
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: 'rgba(127,127,127,0.25)',
          backgroundColor: dark ? 'rgba(21,23,24,0.78)' : 'rgba(255,255,255,0.60)',
          elevation: 0,
        },
        // 显式 lineHeight 且上调:安卓对小号粗体的默认行高偏紧,会裁掉字底
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', lineHeight: 17 },
        tabBarItemStyle: { paddingVertical: 0 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '日记',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="book.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="avatar"
        options={{
          title: '化身',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="bubble.left.and.bubble.right.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: '发现',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="person.2.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
