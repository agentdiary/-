import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDiaryStore } from '@/stores/diary-store';

export default function DiaryEditorScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const add = useDiaryStore((s) => s.add);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const text = content.trim();
    if (!text) return;
    setSaving(true);
    try {
      await add(text);
      router.back();
    } catch (e) {
      Alert.alert('保存失败', String(e));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={styles.container}>
        <TextInput
          style={[styles.input, { color: Colors[colorScheme].text }]}
          multiline
          autoFocus
          placeholder="今天发生了什么?你怎么想?"
          placeholderTextColor="rgba(127,127,127,0.6)"
          value={content}
          onChangeText={setContent}
        />
        <Pressable
          style={[
            styles.saveButton,
            { backgroundColor: Colors[colorScheme].tint, opacity: content.trim() ? 1 : 0.4 },
          ]}
          disabled={!content.trim() || saving}
          onPress={save}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>保存</Text>
          )}
        </Pressable>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, padding: 20 },
  input: { flex: 1, fontSize: 17, lineHeight: 26, textAlignVertical: 'top' },
  saveButton: {
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
