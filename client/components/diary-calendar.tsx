// 自绘月历:标出有日记的日期,点选过滤,再点取消。零第三方依赖。

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function monthMatrix(year: number, month: number): (number | null)[][] {
  // month: 0-11;周一为一周之首
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // 周一=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function DiaryCalendar({
  marked,
  selected,
  onSelect,
}: {
  marked: Set<string>; // 有日记的日期(YYYY-MM-DD,本地时区)
  selected: string | null;
  onSelect: (date: string | null) => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const tint = Colors[scheme].tint;
  const onTint = scheme === 'dark' ? '#151718' : '#fff';

  const initial = selected ? new Date(selected) : new Date();
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const todayKey = dateKey(new Date());

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => shift(-1)} hitSlop={10} style={styles.navBtn}>
          <ThemedText style={styles.navText}>‹</ThemedText>
        </Pressable>
        <ThemedText style={styles.monthTitle}>
          {year} 年 {month + 1} 月
        </ThemedText>
        <Pressable onPress={() => shift(1)} hitSlop={10} style={styles.navBtn}>
          <ThemedText style={styles.navText}>›</ThemedText>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <ThemedText key={w} style={styles.weekday}>
            {w}
          </ThemedText>
        ))}
      </View>

      {monthMatrix(year, month).map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((day, di) => {
            if (day === null) {
              return <View key={di} style={styles.cell} />;
            }
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelected = selected === key;
            const hasEntry = marked.has(key);
            const isToday = key === todayKey;
            return (
              <Pressable
                key={di}
                style={[styles.cell, isSelected && { backgroundColor: tint, borderRadius: 17 }]}
                onPress={() => onSelect(isSelected ? null : key)}>
                <Text
                  style={[
                    styles.dayText,
                    { color: isSelected ? onTint : Colors[scheme].text },
                    isToday && !isSelected && { color: tint, fontWeight: '700' },
                    !hasEntry && !isSelected && styles.dayMuted,
                  ]}>
                  {day}
                </Text>
                {hasEntry && (
                  <View
                    style={[styles.dot, { backgroundColor: isSelected ? onTint : tint }]}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(127,127,127,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(127,127,127,0.2)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  navBtn: { width: 36, alignItems: 'center' },
  navText: { fontSize: 22, opacity: 0.7 },
  monthTitle: { fontSize: 15, fontWeight: '600' },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, opacity: 0.45, marginBottom: 4 },
  cell: {
    flex: 1,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontSize: 14 },
  dayMuted: { opacity: 0.45 },
  dot: { position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2 },
});
