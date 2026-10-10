import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme';
import { Button, Card, Chip, ErrorBox } from './ui';
import SolutionView from './SolutionView';

export default function QuestionCard({ question: q, onSolve, onEdit, isSaved, onToggleSave, onDownload }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(q.text);

  const saveEdit = () => {
    const text = draft.trim();
    if (text && text !== q.text) onEdit(text);
    setEditing(false);
  };

  return (
    <Card style={[styles.card, q.status === 'done' && { borderColor: '#1f2a24' }]}>
      <View style={styles.head}>
        <View style={styles.qNumber}>
          <Text style={styles.qNumberText}>Q{q.number}</Text>
        </View>
        {q.marks != null && <Chip label={`${q.marks} marks`} />}
        <View style={{ flex: 1 }} />
        {!editing && q.status !== 'solving' && (
          <Pressable
            hitSlop={10}
            onPress={() => {
              setDraft(q.text);
              setEditing(true);
            }}
            accessibilityLabel="Edit question"
          >
            <Feather name="edit-2" size={16} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {editing ? (
        <View style={{ gap: 10 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            style={styles.input}
            placeholderTextColor={colors.muted}
          />
          <View style={styles.row}>
            <Button title="Save question" variant="primary" size="sm" onPress={saveEdit} />
            <Button title="Cancel" variant="ghost" size="sm" onPress={() => setEditing(false)} />
          </View>
        </View>
      ) : (
        <Text style={styles.qText}>{q.text}</Text>
      )}

      {q.status === 'idle' && !editing && (
        <Button title="Solve with AI" icon="zap" variant="primary" size="sm" onPress={onSolve} style={styles.start} />
      )}

      {q.status === 'solving' && (
        <View style={styles.row}>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.muted }}>Working out the solution…</Text>
        </View>
      )}

      {q.status === 'error' && (
        <View style={{ gap: 8 }}>
          <ErrorBox message={q.error} />
          <Button title="Retry" icon="rotate-ccw" size="sm" onPress={onSolve} style={styles.start} />
        </View>
      )}

      {q.status === 'done' && q.solution && (
        <>
          <SolutionView solution={q.solution} />
          <View style={styles.row}>
            <Button
              title={isSaved ? 'Saved' : 'Save'}
              icon={isSaved ? 'check' : 'bookmark'}
              variant={isSaved ? 'saved' : 'default'}
              size="sm"
              onPress={onToggleSave}
            />
            <Button title="Download" icon="download" size="sm" onPress={onDownload} />
            <Button title="Redo" icon="rotate-ccw" variant="ghost" size="sm" onPress={onSolve} />
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qNumber: { paddingHorizontal: 8, height: 24, borderRadius: 7, backgroundColor: colors.accentSoft, justifyContent: 'center' },
  qNumberText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  qText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  input: {
    minHeight: 100,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: '#050505',
    color: colors.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  start: { alignSelf: 'flex-start' },
});
