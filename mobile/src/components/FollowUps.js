import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme';
import { FOLLOWUP_SUGGESTIONS, MAX_FOLLOWUPS } from '../followups';
import { BotMessage } from './Bot';
import { MicButton } from './VoiceButtons';
import { Button, Chip, ErrorBox, Gradient } from './ui';
import RichText from './RichText';

function UserMessage({ text }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.userRow}>
      <Gradient style={styles.userBubble}>
        <Text style={styles.userText}>{text}</Text>
      </Gradient>
    </View>
  );
}

/** The conversation so far: the student's follow-up questions and StudySync Bot's replies (read-only). */
export function FollowUpThread({ followups }) {
  const styles = useThemedStyles(makeStyles);
  if (!followups?.length) return null;
  return (
    <View style={styles.thread}>
      {followups.map((f, i) => (
        <View key={i} style={styles.turn}>
          <UserMessage text={f.question} />
          <BotMessage>
            <RichText text={f.answer} style={styles.answer} />
          </BotMessage>
        </View>
      ))}
    </View>
  );
}

/**
 * Under a solved question: the follow-ups so far, quick suggestions and a button that opens the chat.
 * pending: the question being answered now; failed: { question, error } when the last one failed.
 */
export default function FollowUps({ followups = [], pending, failed, onAsk, questionNumber, questionText }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);

  const ask = (message) => {
    setOpen(true);
    onAsk(message);
  };

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Feather name="message-circle" size={15} color={colors.accent} />
        <Text style={styles.headText}>Follow-up questions</Text>
        {followups.length > 0 && <Chip tone="accent" label={String(followups.length)} />}
      </View>

      <FollowUpThread followups={followups} />
      {!!pending && (
        <View style={styles.turn}>
          <UserMessage text={pending} />
          <BotMessage thinking />
        </View>
      )}
      {!!failed && !pending && <ErrorBox message={failed.error} />}

      {!followups.length && !pending && (
        <View style={styles.suggestions}>
          {FOLLOWUP_SUGGESTIONS.slice(0, 3).map((s) => (
            <Pressable key={s} onPress={() => ask(s)} style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.7 }]}>
              <Feather name="zap" size={12} color={colors.accent} />
              <Text style={styles.suggestionText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Button
        title={followups.length ? 'Ask another follow-up' : 'Ask a follow-up question'}
        icon="message-circle"
        size="sm"
        onPress={() => setOpen(true)}
        style={{ alignSelf: 'flex-start' }}
      />

      <FollowUpChat
        visible={open}
        onClose={() => setOpen(false)}
        followups={followups}
        pending={pending}
        failed={failed}
        onAsk={onAsk}
        questionNumber={questionNumber}
        questionText={questionText}
      />
    </View>
  );
}

/** Full-screen chat about one question, with the composer above the keyboard. */
function FollowUpChat({ visible, onClose, followups, pending, failed, onAsk, questionNumber, questionText }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const voiceBase = useRef('');
  const [draft, setDraft] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [showQuestion, setShowQuestion] = useState(false);
  const full = followups.length >= MAX_FOLLOWUPS;

  // Keep the newest message in view.
  useEffect(() => {
    if (visible) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, [visible, followups.length, pending, failed]);

  const send = (text = draft) => {
    const message = text.trim();
    if (!message || pending || full) return;
    setDraft('');
    onAsk(message);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={[styles.sheet, { paddingTop: insets.top }]} behavior="padding">
        <View style={styles.sheetHead}>
          <Gradient style={styles.sheetBadge}>
            <Text style={styles.sheetBadgeText}>Q{questionNumber}</Text>
          </Gradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>Follow-up questions</Text>
            <Pressable onPress={() => setShowQuestion((v) => !v)}>
              <Text style={styles.sheetSub} numberOfLines={showQuestion ? undefined : 1}>
                {questionText}
              </Text>
            </Pressable>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="Close follow-up questions">
            <Feather name="x" size={20} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.chat}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <BotMessage>
            <Text style={styles.answer}>
              Ask me anything about this answer — why a step works, an easier explanation, or a similar question to
              practise.
            </Text>
          </BotMessage>
          <FollowUpThread followups={followups} />
          {!!pending && (
            <View style={styles.turn}>
              <UserMessage text={pending} />
              <BotMessage thinking />
            </View>
          )}
          {!!failed && !pending && (
            <View style={{ gap: 8 }}>
              <ErrorBox message={failed.error} />
              <Button title="Try again" icon="rotate-ccw" size="sm" onPress={() => onAsk(failed.question)} style={{ alignSelf: 'flex-start' }} />
            </View>
          )}
          <ErrorBox message={voiceError} />
          {!followups.length && !pending && (
            <View style={styles.suggestions}>
              {FOLLOWUP_SUGGESTIONS.map((s) => (
                <Pressable key={s} onPress={() => send(s)} style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.7 }]}>
                  <Feather name="zap" size={12} color={colors.accent} />
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>

        {full ? (
          <Text style={[styles.note, { paddingBottom: insets.bottom + 12 }]}>
            This question has reached {MAX_FOLLOWUPS} follow-ups. Ask a new question to keep going.
          </Text>
        ) : (
          <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={4000}
                placeholder={followups.length ? 'Ask another follow-up…' : 'Ask a follow-up question…'}
                placeholderTextColor={colors.muted}
              />
              <View style={styles.composerActions}>
                <MicButton
                  onStart={() => {
                    voiceBase.current = draft.trimEnd();
                    setVoiceError('');
                  }}
                  onText={(text) => setDraft(voiceBase.current ? `${voiceBase.current} ${text}` : text)}
                  onError={setVoiceError}
                />
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={() => send()}
                  disabled={!draft.trim() || !!pending}
                  accessibilityLabel="Send follow-up"
                  style={({ pressed }) => [(!draft.trim() || pending) && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.94 }] }]}
                >
                  <Gradient style={styles.send}>
                    <Feather name="arrow-up" size={20} color="#fff" />
                  </Gradient>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    section: { gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, borderStyle: 'dashed' },
    head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    headText: { color: colors.accent, fontWeight: '800', fontSize: 13 },
    thread: { gap: 10 },
    turn: { gap: 8 },
    userRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingLeft: 40 },
    userBubble: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, borderBottomRightRadius: 4 },
    userText: { color: '#fff', fontSize: 15, lineHeight: 21 },
    answer: { color: colors.textSoft, fontSize: 14.5, lineHeight: 21 },
    suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    suggestion: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: colors.accentSoft,
    },
    suggestionText: { color: colors.textSoft, fontSize: 13, fontWeight: '600' },

    sheet: { flex: 1, backgroundColor: colors.bg },
    sheetHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sheetBadge: { paddingHorizontal: 10, height: 30, borderRadius: 10, justifyContent: 'center' },
    sheetBadgeText: { color: '#fff', fontWeight: '800', fontSize: 13 },
    sheetTitle: { color: colors.text, fontWeight: '800', fontSize: 17 },
    sheetSub: { color: colors.muted, fontSize: 13, marginTop: 1 },
    close: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface2,
    },
    chat: { padding: 16, gap: 14, paddingBottom: 24 },
    note: { color: colors.muted, fontSize: 13, textAlign: 'center', paddingHorizontal: 24, paddingTop: 12 },
    composerWrap: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
    composer: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.inputBg,
      padding: 6,
    },
    input: {
      minHeight: 40,
      maxHeight: 140,
      paddingHorizontal: 10,
      paddingTop: 8,
      color: colors.text,
      fontSize: 15,
      lineHeight: 21,
      textAlignVertical: 'top',
    },
    composerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 2 },
    send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  });
