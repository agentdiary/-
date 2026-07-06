// 九宫格手势锁:纯 RN 自绘(PanResponder),零新依赖。
// 手指划过的点按顺序连成图案,松手回调 onComplete("0-4-8" 形式)。

import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const GRID = 264;
const CELL = GRID / 3;
const HIT_RADIUS = 34;
export const MIN_DOTS = 4;

function dotCenter(index: number) {
  const row = Math.floor(index / 3);
  const col = index % 3;
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

export function PatternLock({
  onComplete,
  disabled = false,
}: {
  // 松手时回调;少于 MIN_DOTS 个点不回调(误触)
  onComplete: (pattern: string) => void;
  disabled?: boolean;
}) {
  const scheme = useColorScheme() ?? 'light';
  const tint = Colors[scheme].tint;
  const [selected, setSelected] = useState<number[]>([]);
  const selRef = useRef<number[]>([]);

  const tryAdd = (x: number, y: number) => {
    for (let i = 0; i < 9; i++) {
      if (selRef.current.includes(i)) continue;
      const c = dotCenter(i);
      if (Math.hypot(x - c.x, y - c.y) <= HIT_RADIUS) {
        selRef.current = [...selRef.current, i];
        setSelected(selRef.current);
        return;
      }
    }
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (e) => {
        selRef.current = [];
        setSelected([]);
        tryAdd(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
      onPanResponderMove: (e) => {
        tryAdd(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
      onPanResponderRelease: () => {
        const pattern = selRef.current;
        selRef.current = [];
        setSelected([]);
        if (pattern.length >= MIN_DOTS) {
          onComplete(pattern.join('-'));
        }
      },
    }),
  ).current;

  return (
    <View style={styles.grid} {...responder.panHandlers}>
      {Array.from({ length: 9 }, (_, i) => {
        const c = dotCenter(i);
        const active = selected.includes(i);
        const order = selected.indexOf(i);
        return (
          <View
            key={i}
            style={[
              styles.dot,
              { left: c.x - 14, top: c.y - 14, borderColor: active ? tint : 'rgba(127,127,127,0.45)' },
              active && { backgroundColor: tint },
            ]}>
            {active && order >= 0 && <View style={styles.dotInner} />}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { width: GRID, height: GRID, alignSelf: 'center' },
  dot: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
});
