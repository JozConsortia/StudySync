import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme';
import KeyboardAwareScrollView from '../components/KeyboardAware';
import { Button, Card, Chip, EmptyState, Gradient, IconTile, ScreenHeader, SearchBar } from '../components/ui';
import SolutionView from '../components/SolutionView';
import { SyncStatus, useSyncRefreshControl } from '../components/SyncStatus';
import { BotMessage } from '../components/Bot';
import { ListenButton } from '../components/VoiceButtons';
import { FollowUpThread } from '../components/FollowUps';
import RichText from '../components/RichText';
import { summarize } from '../richtext';

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

export default function HistoryScreen({ history, activeId, onOpen, onDelete, onClear, onScan, syncedAt, onRefresh }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const refreshControl = useSyncRefreshControl(onRefresh);

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
      <EmptyState
        icon="clock"
        title="No history yet"
        body="Every paper you scan and every question you ask appears here automatically, on all your devices."
        action={<Button title="Scan or ask a question" icon="camera" variant="primary" onPress={onScan} />}
      />
    );
  }

  const confirmClear = () =>
    Alert.alert('Clear history?', 'This removes your whole history. Saved answers are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: onClear },
    ]);

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.page} refreshControl={refreshControl}>
      <ScreenHeader
        kicker={`${history.length} ${history.length === 1 ? 'session' : 'sessions'}`}
        title="History"
        subtitle={<SyncStatus syncedAt={syncedAt} />}
        right={<Button title="Clear" icon="trash-2" variant="danger" size="sm" onPress={confirmClear} />}
      />

      <SearchBar value={query} onChangeText={setQuery} placeholder="Search papers and questions" />

      {groups.map((g) => (
        <View key={g.label} style={{ gap: 10 }}>
          <View style={styles.dayRow}>
            <Gradient style={styles.dayDot} />
            <Text style={styles.day}>{g.label}</Text>
            <View style={styles.dayLine} />
          </View>
          {g.items.map((e) => {
            const open = openId === e.id;
            const typed = e.kind === 'typed';
            const solved = e.questions.filter((q) => q.solution).length;
            return (
              <Card key={e.id} style={[{ gap: 12 }, e.id === activeId && { borderColor: colors.accentBorder }]}>
                <Pressable style={styles.itemHead} onPress={() => setOpenId(open ? null : e.id)}>
                  <IconTile icon={typed ? 'message-circle' : 'file-text'} tone={typed ? 'violet' : 'accent'} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle} numberOfLines={open ? undefined : 1}>
                      {typed ? summarize(e.questions[0]?.text) : e.title}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[typed ? 'Asked the bot' : e.subject, timeOf(e.updatedAt)].filter(Boolean).join(' · ')}
                    </Text>
                    {!typed && (
                      <View style={styles.miniRow}>
                        <View style={styles.miniTrack}>
                          <View
                            style={[
                              styles.miniFill,
                              { width: `${(solved / Math.max(1, e.questions.length)) * 100}%` },
                              solved === e.questions.length && { backgroundColor: colors.success },
                            ]}
                          />
                        </View>
                        <Text style={styles.miniText}>
                          {solved}/{e.questions.length} solved
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.chevron}>
                    <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
                  </View>
                </Pressable>

                {open &&
                  e.questions.map((q) => (
                    <View key={q.id} style={styles.question}>
                      <View style={styles.qHead}>
                        <Gradient style={styles.qNumber}>
                          <Text style={styles.qNumberText}>Q{q.number}</Text>
                        </Gradient>
                        {q.marks != null && <Chip label={`${q.marks} marks`} />}
                        {!q.solution && <Chip label="Not solved" />}
                      </View>
                      <RichText text={q.text} style={styles.qText} />
                      {q.solution && (
                        <BotMessage actions={<ListenButton solution={q.solution} question={q.text} id={`h:${e.id}:${q.id}`} />}>
                          <SolutionView solution={q.solution} />
                        </BotMessage>
                      )}
                      {q.solution && <FollowUpThread followups={q.followups} />}
                    </View>
                  ))}

                <View style={styles.actions}>
                  <Button
                    title={solved < e.questions.length ? 'Continue' : 'Open'}
                    icon="arrow-right"
                    variant="primary"
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
      {!groups.length && <Text style={styles.noMatch}>Nothing in your history matches “{query}”.</Text>}
    </KeyboardAwareScrollView>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
  page: { padding: 16, paddingTop: 12, gap: 14, paddingBottom: 40 },
  noMatch: { color: colors.muted, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  dayDot: { width: 10, height: 10, borderRadius: 5 },
  day: { color: colors.text, fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  dayLine: { flex: 1, height: 1, backgroundColor: colors.border },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemTitle: { color: colors.text, fontWeight: '700', fontSize: 15.5 },
  meta: { color: colors.muted, fontSize: 13, marginTop: 1 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  miniTrack: { flex: 1, height: 5, borderRadius: 5, backgroundColor: colors.surface3, overflow: 'hidden' },
  miniFill: { height: '100%', borderRadius: 5, backgroundColor: colors.accent },
  miniText: { color: colors.muted, fontSize: 11.5, fontWeight: '700' },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  question: { gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  qHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qNumber: { paddingHorizontal: 10, height: 26, borderRadius: 9, justifyContent: 'center' },
  qNumberText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  qText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
