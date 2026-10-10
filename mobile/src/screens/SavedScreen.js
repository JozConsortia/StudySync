import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme';
import { sharePdf } from '../pdf';
import { Button, Card } from '../components/ui';
import SolutionView from '../components/SolutionView';

export default function SavedScreen({ saved, onUnsave, onScan }) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return saved;
    return saved.filter((s) => `${s.paperTitle} ${s.subject} ${s.text}`.toLowerCase().includes(q));
  }, [saved, query]);

  const download = (args) => sharePdf(args).catch((err) => Alert.alert('Download failed', err.message));

  if (!saved.length) {
    return (
      <View style={styles.empty}>
        <Feather name="bookmark" size={32} color={colors.muted} />
        <Text style={styles.h2}>No saved answers yet</Text>
        <Text style={[styles.muted, { textAlign: 'center' }]}>
          Solve a question and tap Save to keep it here. Saved answers are stored in your account.
        </Text>
        <Button title="Scan a paper" icon="camera" variant="primary" onPress={onScan} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Saved answers</Text>
          <Text style={styles.muted}>{saved.length} saved to your account</Text>
        </View>
        <Button
          title={query ? 'Download results' : 'Download all'}
          icon="download"
          size="sm"
          onPress={() => download({ title: 'My saved answers', items: filtered })}
        />
      </View>

      <View style={styles.search}>
        <Feather name="search" size={16} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search saved answers"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {filtered.map((s) => {
        const open = openId === s.id;
        return (
          <Card key={s.id} style={{ gap: 12 }}>
            <Pressable style={styles.itemHead} onPress={() => setOpenId(open ? null : s.id)}>
              <View style={styles.qNumber}>
                <Text style={styles.qNumberText}>Q{s.number}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {s.paperTitle}
                </Text>
                <Text style={styles.muted} numberOfLines={open ? undefined : 1}>
                  {s.text}
                </Text>
              </View>
              <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
            </Pressable>

            {open && (
              <>
                <SolutionView solution={s.solution} />
                <View style={styles.actions}>
                  <Button
                    title="Download"
                    icon="download"
                    size="sm"
                    onPress={() => download({ title: `${s.paperTitle} - Q${s.number}`, subject: s.subject, items: [s] })}
                  />
                  <Button
                    title="Remove"
                    icon="trash-2"
                    variant="danger"
                    size="sm"
                    onPress={() => onUnsave(s.id)}
                  />
                </View>
              </>
            )}
          </Card>
        );
      })}
      {!filtered.length && <Text style={styles.muted}>No saved answers match “{query}”.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 40 },
  h1: { color: colors.text, fontSize: 22, fontWeight: '800' },
  h2: { color: colors.text, fontSize: 18, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: '#050505',
  },
  searchInput: { flex: 1, color: colors.text, paddingVertical: 11, fontSize: 15 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  qNumber: { paddingHorizontal: 8, height: 24, borderRadius: 7, backgroundColor: colors.accentSoft, justifyContent: 'center' },
  qNumberText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
