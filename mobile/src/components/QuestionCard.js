import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { haptics } from '../haptics';
import { useToast } from './Toast';
import { useTheme, useThemedStyles } from '../theme';
import { Button, Card, Chip, ErrorBox, Gradient } from './ui';
import SolutionView from './SolutionView';
import { BotMessage } from './Bot';
import { ListenButton } from './VoiceButtons';
import RichText from './RichText';
import FollowUps from './FollowUps';

/** The solution as plain text, for pasting into notes or a chat. */
function solutionToText(question, solution) {
  const lines = [`Q${question.number}: ${question.text}`, '', `Answer: ${solution.answer}`];
  if (solution.steps?.length) {
    lines.push('', 'Steps:');
    solution.steps.forEach((s, i) => lines.push(`${i + 1}. ${s.title}`, `   ${s.detail}`));
  }
  if (solution.explanation) lines.push('', `Why it works: ${solution.explanation}`);
  if (solution.tips?.length) lines.push('', 'Exam tips:', ...solution.tips.map((t) => `- ${t}`));
  return lines.join('\n');
}

export default function QuestionCard({ question: q, onSolve, onEdit, isSaved, onToggleSave, onDownload, onFollowUp }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(q.text);
  const toast = useToast();

  const copy = async () => {
    await Clipboard.setStringAsync(solutionToText(q, q.solution));
    haptics.tap();
    toast({ message: 'Answer copied', icon: 'copy', tone: 'success' });
  };

  const toggleSave = () => {
    if (!isSaved) {
      haptics.success();
      toast({ message: 'Saved — find it in the Saved tab', icon: 'bookmark', tone: 'success' });
    }
    onToggleSave();
  };

  // A new solution starts a new conversation, so check first when there are follow-ups to lose.
  const redo = () => {
    if (!q.followups?.length) return onSolve();
    Alert.alert('Solve again?', 'A new answer replaces this one and clears its follow-up questions.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Solve again', style: 'destructive', onPress: onSolve },
    ]);
  };

  const saveEdit = () => {
    const text = draft.trim();
    if (text && text !== q.text) onEdit(text);
    setEditing(false);
  };

  const status = {
    idle: { color: colors.borderStrong, label: null },
    solving: { color: colors.accent, label: ['loader', 'Solving', 'accent'] },
    done: { color: colors.success, label: ['check', 'Solved', 'success'] },
    error: { color: colors.danger, label: null },
  }[q.status] || { color: colors.borderStrong, label: null };

  return (
    <Card style={[styles.card, q.status === 'done' && { borderColor: colors.doneBorder }]}>
      <View style={[styles.stripe, { backgroundColor: status.color }]} />
      <View style={styles.head}>
        <Gradient style={styles.qNumber}>
          <Text style={styles.qNumberText}>Q{q.number}</Text>
        </Gradient>
        {q.marks != null && <Chip label={`${q.marks} marks`} icon="award" />}
        {status.label && <Chip icon={status.label[0]} label={status.label[1]} tone={status.label[2]} />}
        <View style={{ flex: 1 }} />
        {!editing && q.status !== 'solving' && (
          <Pressable
            hitSlop={10}
            onPress={() => {
              setDraft(q.text);
              setEditing(true);
            }}
            accessibilityLabel="Edit question"
            style={styles.edit}
          >
            <Feather name="edit-2" size={14} color={colors.muted} />
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
        <RichText text={q.text} style={styles.qText} />
      )}

      {q.status === 'idle' && !editing && (
        <Button
          title="Ask StudySync Bot"
          icon="cpu"
          variant="primary"
          size="sm"
          onPress={() => {
            haptics.tap();
            onSolve();
          }}
          style={styles.start}
        />
      )}

      {q.status === 'solving' && <BotMessage thinking />}

      {q.status === 'error' && (
        <BotMessage>
          <ErrorBox message={q.error} />
          <Button title="Retry" icon="rotate-ccw" size="sm" onPress={onSolve} style={styles.start} />
        </BotMessage>
      )}

      {q.status === 'done' && q.solution && (
        <BotMessage actions={<ListenButton solution={q.solution} question={q.text} id={`q:${q.id}:${q.text.length}`} />}>
          <SolutionView solution={q.solution} />
          <View style={styles.row}>
            <Button
              title={isSaved ? 'Saved' : 'Save'}
              icon={isSaved ? 'check' : 'bookmark'}
              variant={isSaved ? 'saved' : 'default'}
              size="sm"
              onPress={toggleSave}
            />
            <Button title="Copy" icon="copy" size="sm" onPress={copy} />
            <Button title="PDF" icon="download" size="sm" onPress={onDownload} />
            <Button title="Redo" icon="rotate-ccw" variant="ghost" size="sm" onPress={redo} />
          </View>
        </BotMessage>
      )}

      {q.status === 'done' && q.solution && (
        <FollowUps
          followups={q.followups}
          pending={q.followupPending}
          failed={q.followupFailed}
          onAsk={onFollowUp}
          questionNumber={q.number}
          questionText={q.text}
        />
      )}
    </Card>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
  card: { gap: 12, paddingLeft: 20, overflow: 'hidden' },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qNumber: { paddingHorizontal: 10, height: 26, borderRadius: 9, justifyContent: 'center' },
  qNumberText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  edit: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  qText: { color: colors.text, fontSize: 15.5, lineHeight: 23 },
  input: {
    minHeight: 100,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  start: { alignSelf: 'flex-start' },
});
