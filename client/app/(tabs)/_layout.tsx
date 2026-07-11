import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        // 左侧竖排导航:RN v7 的侧边位置要求 material 变体
        tabBarPosition: 'left',
        tabBarVariant: 'material',
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: {
          borderRightWidth: StyleSheet.hairlineWidth,
          borderRightColor: 'rgba(127,127,127,0.25)',
          backgroundColor: dark ? 'rgba(21,23,24,0.92)' : 'rgba(255,255,255,0.82)',
        },
        // 显式 lineHeight 且上调:安卓对小号粗体的默认行高偏紧,会裁掉字底
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', lineHeight: 17 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '日记',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="book.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: '对话',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="bubble.left.and.bubble.right.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
