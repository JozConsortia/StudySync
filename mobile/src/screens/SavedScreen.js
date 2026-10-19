import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme';
import KeyboardAwareScrollView from '../components/KeyboardAware';
import { sharePdf } from '../pdf';
import { Button, Card, EmptyState, Gradient, ScreenHeader, SearchBar } from '../components/ui';
import SolutionView from '../components/SolutionView';
import { SyncStatus, useSyncRefreshControl } from '../components/SyncStatus';
import { BotMessage } from '../components/Bot';
import { ListenButton } from '../components/VoiceButtons';
import { FollowUpThread } from '../components/FollowUps';
import RichText from '../components/RichText';
import { summarize } from '../richtext';

export default function SavedScreen({ saved, onUnsave, onScan, syncedAt, onRefresh }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const refreshControl = useSyncRefreshControl(onRefresh);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return saved;
    return saved.filter((s) => `${s.paperTitle} ${s.subject} ${s.text}`.toLowerCase().includes(q));
  }, [saved, query]);

  const download = (args) => sharePdf(args).catch((err) => Alert.alert('Download failed', err.message));

  if (!saved.length) {
    return (
      <EmptyState
        icon="bookmark"
        title="No saved answers yet"
        body="Solve a question and tap Save to keep it here. Your saved answers follow you to every device."
        action={<Button title="Scan a paper" icon="camera" variant="primary" onPress={onScan} />}
      />
    );
  }

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.page} refreshControl={refreshControl}>
      <ScreenHeader
        kicker={`${saved.length} saved`}
        title="Saved answers"
        subtitle={<SyncStatus syncedAt={syncedAt} />}
      />

      <View style={styles.searchRow}>
        <View style={{ flex: 1 }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search saved answers" />
        </View>
        <Button
          title={query ? 'Results' : 'All'}
          icon="download"
          variant="primary"
          size="sm"
          onPress={() => download({ title: 'My saved answers', items: filtered })}
        />
      </View>

      {filtered.map((s) => {
        const open = openId === s.id;
        return (
          <Card key={s.id} style={[{ gap: 12 }, open && { borderColor: colors.accentBorder }]}>
            <Pressable style={styles.itemHead} onPress={() => setOpenId(open ? null : s.id)}>
              <Gradient style={styles.qNumber}>
                <Feather name="bookmark" size={13} color="#fff" />
                <Text style={styles.qNumberText}>Q{s.number}</Text>
              </Gradient>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.itemTitle} numberOfLines={open ? undefined : 2}>
                  {summarize(s.text)}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[s.paperTitle, s.subject].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={styles.chevron}>
                <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </View>
            </Pressable>

            {open && (
              <>
                <RichText text={s.text} style={styles.qText} />
                <BotMessage actions={<ListenButton solution={s.solution} question={s.text} id={`s:${s.id}`} />}>
                  <SolutionView solution={s.solution} />
                </BotMessage>
                <FollowUpThread followups={s.followups} />
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
      {!filtered.length && <Text style={styles.noMatch}>No saved answers match “{query}”.</Text>}
    </KeyboardAwareScrollView>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
  page: { padding: 16, paddingTop: 12, gap: 14, paddingBottom: 40 },
  noMatch: { color: colors.muted, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemTitle: { color: colors.text, fontWeight: '700', fontSize: 15, lineHeight: 21 },
  meta: { color: colors.muted, fontSize: 12.5 },
  qText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  qNumber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 10,
  },
  qNumberText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
