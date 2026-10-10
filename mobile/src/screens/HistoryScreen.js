import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme';
import { Button, Card, Chip } from '../components/ui';
import SolutionView from '../components/SolutionView';

function dayLabel(iso) {
  const d = new Date(iso);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export default function HistoryScreen({ history, activeId, onOpen, onDelete, onClear, onScan }) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? history.filter((e) =>
          [e.title, e.subject, e.fileName, ...e.questions.map((x) => x.text)].join(' ').toLowerCase().includes(q)
        )
      : history;
    const out = [];
    for (const e of matches) {
      const label = dayLabel(e.updatedAt);
      if (out.length && out[out.length - 1].label === label) out[out.length - 1].items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [history, query]);

  if (!history.length) {
    return (
      <View style={styles.empty}>
        <Feather name="clock" size={32} color={colors.muted} />
        <Text style={styles.h2}>No history yet</Text>
        <Text style={[styles.muted, { textAlign: 'center' }]}>
          Every paper you scan and every question you ask appears here automatically. Your history is stored in your account.
        </Text>
        <Button title="Scan or ask a question" icon="camera" variant="primary" onPress={onScan} />
      </View>
    );
  }

  const confirmClear = () =>
    Alert.alert('Clear history?', 'This removes your whole history. Saved answers are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: onClear },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>History</Text>
          <Text style={styles.muted}>
            {history.length} {history.length === 1 ? 'session' : 'sessions'} · in your account
          </Text>
        </View>
        <Button title="Clear" icon="trash-2" variant="danger" size="sm" onPress={confirmClear} />
      </View>

      <View style={styles.search}>
        <Feather name="search" size={16} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search papers and questions"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {groups.map((g) => (
        <View key={g.label} style={{ gap: 10 }}>
          <Text style={styles.day}>{g.label.toUpperCase()}</Text>
          {g.items.map((e) => {
            const open = openId === e.id;
            const typed = e.kind === 'typed';
            const solved = e.questions.filter((q) => q.solution).length;
            return (
              <Card key={e.id} style={[{ gap: 12 }, e.id === activeId && { borderColor: 'rgba(91,140,255,0.45)' }]}>
                <Pressable style={styles.itemHead} onPress={() => setOpenId(open ? null : e.id)}>
                  <View style={styles.icon}>
                    <Feather name={typed ? 'message-square' : 'file-text'} size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle} numberOfLines={open ? undefined : 1}>
                      {typed ? e.questions[0]?.text : e.title}
                    </Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      {[typed ? 'Typed question' : `${solved}/${e.questions.length} solved`, e.subject, timeOf(e.updatedAt)]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
                </Pressable>

                {open &&
                  e.questions.map((q) => (
                    <View key={q.id} style={styles.question}>
                      <View style={styles.qHead}>
                        <View style={styles.qNumber}>
                          <Text style={styles.qNumberText}>Q{q.number}</Text>
                        </View>
                        {q.marks != null && <Chip label={`${q.marks} marks`} />}
                        {!q.solution && <Chip label="Not solved" />}
                      </View>
                      <Text style={styles.qText}>{q.text}</Text>
                      {q.solution && <SolutionView solution={q.solution} />}
                    </View>
                  ))}

                <View style={styles.actions}>
                  <Button
                    title={solved < e.questions.length ? 'Continue' : 'Open'}
                    icon="arrow-right"
                    size="sm"
                    onPress={() => onOpen(e)}
                  />
                  <Button title="Delete" icon="trash-2" variant="danger" size="sm" onPress={() => onDelete(e.id)} />
                </View>
              </Card>
            );
          })}
        </View>
      ))}
      {!groups.length && <Text style={styles.muted}>Nothing in your history matches “{query}”.</Text>}
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
  day: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
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
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  question: { gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  qHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qNumber: { paddingHorizontal: 8, height: 24, borderRadius: 7, backgroundColor: colors.accentSoft, justifyContent: 'center' },
  qNumberText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  qText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
