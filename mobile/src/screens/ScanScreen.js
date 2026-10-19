import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, useThemedStyles } from '../theme';
import KeyboardAwareScrollView from '../components/KeyboardAware';
import { api } from '../api';
import { sharePdf } from '../pdf';
import { savedId } from '../saved';
import { toFollowupsPayload } from '../followups';
import { sectionContext } from '../context';
import { BotAvatar } from '../components/Bot';
import { MicButton } from '../components/VoiceButtons';
import { parseRichText, summarize } from '../richtext';

const looksLikeCode = (text) => parseRichText(text).some((p) => p.type === 'code');
import { Button, Card, Chip, ErrorBox, Gradient, IconTile } from '../components/ui';
import QuestionCard from '../components/QuestionCard';

const SOLVE_CONCURRENCY = 3;
const SUGGESTIONS = [
  'Solve 3x + 7 = 22 and show each step',
  'Explain photosynthesis in simple terms',
  'Write a Python program that adds the numbers 1 to 10',
  'What is the difference between speed and velocity?',
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
const METHOD_LABEL = { 'pdf-text': 'Text PDF', ocr: 'RapidOCR', 'pdf-text+ocr': 'Text PDF + RapidOCR' };

export default function ScanScreen({ user, stats, paper, setPaper, updatePaper, startPaper, saved, onSave, onUnsave }) {
  if (!paper) return <UploadPanel user={user} stats={stats} onExtracted={startPaper} />;
  return (
    <PaperView
      key={paper.historyId}
      paper={paper}
      setPaper={setPaper}
      updatePaper={updatePaper}
      saved={saved}
      onSave={onSave}
      onUnsave={onUnsave}
    />
  );
}

function UploadPanel({ user, stats, onExtracted }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [fileName, setFileName] = useState(null);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [typed, setTyped] = useState('');
  const voiceBase = useRef(''); // text already in the box when recording started

  const askTyped = () => {
    // Keep leading indentation (pasted code); only drop blank lines around the question.
    const text = typed.replace(/^\s*\n/, '').trimEnd();
    if (!text.trim()) return;
    const summary = summarize(text);
    onExtracted({
      kind: 'typed',
      title: summary.length > 70 ? `${summary.slice(0, 70).trim()}…` : summary,
      subject: '',
      fileName: null,
      method: 'typed',
      pages: 0,
      autoSolve: true,
      questions: [{ id: 'q1', number: '1', text, marks: null, status: 'idle', solution: null, error: '' }],
    });
  };

  useEffect(() => {
    if (!fileName) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(t);
  }, [fileName]);

  const upload = async (file) => {
    setError('');
    setElapsed(0);
    setFileName(file.name);
    try {
      const result = await api.extract(file);
      if (!result.questions.length) {
        setError('No questions were found in this file. Try a clearer scan.');
        return;
      }
      onExtracted({
        ...result,
        kind: 'paper',
        questions: result.questions.map((q) => ({ ...q, status: 'idle', solution: null, error: '' })),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setFileName(null);
    }
  };

  const fromImageResult = (res) => {
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    upload({ uri: a.uri, name: a.fileName || 'exam-photo.jpg', mimeType: a.mimeType || 'image/jpeg' });
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Allow camera access in Settings to photograph exam papers.');
      return;
    }
    fromImageResult(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 }));
  };

  const pickImage = async () => {
    fromImageResult(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 }));
  };

  const pickPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    upload({ uri: a.uri, name: a.name || 'exam.pdf', mimeType: a.mimeType || 'application/pdf' });
  };

  if (fileName) return <Processing fileName={fileName} elapsed={elapsed} />;

  const firstName = (user?.fullName || '').trim().split(/\s+/)[0];

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.page}>
      <Gradient style={styles.hero}>
        <View style={[styles.ring, { width: 220, height: 220, borderRadius: 110, top: -90, right: -70 }]} />
        <View style={[styles.ring, { width: 140, height: 140, borderRadius: 70, bottom: -60, left: -40 }]} />
        <View style={styles.heroTop}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.heroKicker}>
              {greeting()}
              {firstName ? `, ${firstName}` : ''} 👋
            </Text>
            <Text style={styles.heroTitle}>What are we studying today?</Text>
          </View>
          <View style={styles.heroBot}>
            <BotAvatar size={58} />
          </View>
        </View>
        <Button title="Snap an exam paper" icon="camera" variant="light" size="lg" onPress={takePhoto} />
        {!!stats && (
          <View style={styles.heroStats}>
            <Chip tone="glass" icon="clock" label={`${stats.history} in history`} />
            <Chip tone="glass" icon="bookmark" label={`${stats.saved} saved`} />
          </View>
        )}
      </Gradient>

      <View style={styles.tiles}>
        <Tile icon="image" tone="violet" title="Gallery" body="Pick a photo of a paper" onPress={pickImage} />
        <Tile icon="file-text" tone="cyan" title="PDF file" body="Typed or scanned" onPress={pickPdf} />
      </View>
      <Text style={styles.formats}>PDF · PNG · JPG · WEBP — up to 20 MB</Text>

      <ErrorBox message={error} />

      <Card style={styles.askCard}>
        <View style={styles.askLabel}>
          <BotAvatar size={42} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Ask StudySync Bot</Text>
            <Text style={styles.muted}>Type or speak a question. I'll explain it step by step.</Text>
          </View>
        </View>
        <View style={styles.composer}>
          <TextInput
            style={[styles.askInput, looksLikeCode(typed) && styles.codeInput]}
            autoCapitalize={looksLikeCode(typed) ? 'none' : 'sentences'}
            autoCorrect={!looksLikeCode(typed)}
            multiline
            maxLength={8000}
            placeholder="e.g. A car travels 150 km in 2.5 hours. Calculate its average speed."
            placeholderTextColor={colors.muted}
            value={typed}
            onChangeText={setTyped}
          />
          <View style={styles.askActions}>
            <MicButton
              onStart={() => {
                voiceBase.current = typed.trimEnd();
                setError('');
              }}
              onText={(text) => setTyped(voiceBase.current ? `${voiceBase.current} ${text}` : text)}
              onError={setError}
            />
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={askTyped}
              disabled={!typed.trim()}
              accessibilityLabel="Ask"
              style={({ pressed }) => [!typed.trim() && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.94 }] }]}
            >
              <Gradient style={styles.send}>
                <Feather name="arrow-up" size={20} color="#fff" />
              </Gradient>
            </Pressable>
          </View>
        </View>
        {!typed && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestions}>
            {SUGGESTIONS.map((t) => (
              <Pressable key={t} onPress={() => setTyped(t)} style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.7 }]}>
                <Feather name="zap" size={12} color={colors.accent} />
                <Text style={styles.suggestionText} numberOfLines={1}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Card>

      <Text style={styles.section}>How it works</Text>
      <View style={styles.steps}>
        {[
          ['upload-cloud', 'accent', 'Upload', 'A PDF, a scan or a phone photo'],
          ['cpu', 'violet', 'Extract', 'OCR splits it into questions'],
          ['award', 'success', 'Understand', 'Step-by-step worked answers'],
        ].map(([icon, tone, title, body], i) => (
          <View key={title} style={styles.stepCol}>
            {i < 2 && <View style={styles.connector} />}
            <IconTile icon={icon} tone={tone} size={46} />
            <Text style={styles.stepTitle}>{title}</Text>
            <Text style={styles.stepBody}>{body}</Text>
          </View>
        ))}
      </View>
    </KeyboardAwareScrollView>
  );
}

function Tile({ icon, tone, title, body, onPress }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.97 }], opacity: 0.85 }]}>
      <View style={styles.tileTop}>
        <IconTile icon={icon} tone={tone} size={44} />
        <Feather name="arrow-up-right" size={18} color={colors.muted} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.small}>{body}</Text>
    </Pressable>
  );
}

// Shown while a paper is uploaded and read: the bot "thinks" inside pulsing rings, with a checklist of stages.
function Processing({ fileName, elapsed }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ring = (offset) => {
    const v = Animated.modulo(Animated.add(pulse, offset), 1);
    return (
      <Animated.View
        style={[
          styles.pulse,
          {
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.7] }) }],
          },
        ]}
      />
    );
  };

  const stages = [
    ['Uploading your paper', 0],
    ['Reading the text with OCR', 6],
    ['Finding each question', 20],
  ];

  return (
    <View style={styles.processing}>
      <View style={styles.pulseWrap}>
        {ring(0)}
        {ring(0.5)}
        <View style={styles.pulseCore}>
          <BotAvatar size={72} thinking />
        </View>
      </View>
      <Text style={styles.h2} numberOfLines={2}>
        Reading “{fileName}”
      </Text>
      <Chip tone="accent" icon="clock" label={`${elapsed}s`} />
      <Card style={styles.stages}>
        {stages.map(([label, from], i) => {
          const next = stages[i + 1]?.[1] ?? Infinity;
          const state = elapsed >= next ? 'done' : elapsed >= from ? 'active' : 'todo';
          return (
            <View key={label} style={styles.stage}>
              <View
                style={[
                  styles.stageDot,
                  state === 'done' && { backgroundColor: colors.success, borderColor: colors.success },
                  state === 'active' && { borderColor: colors.accent },
                ]}
              >
                {state === 'done' && <Feather name="check" size={12} color="#fff" />}
                {state === 'active' && <View style={styles.stageActive} />}
              </View>
              <Text style={[styles.stageText, state === 'todo' && { color: colors.muted }]}>{label}</Text>
            </View>
          );
        })}
      </Card>
      {elapsed >= 30 && <Text style={styles.muted}>Long or scanned papers can take a minute.</Text>}
    </View>
  );
}

function PaperView({ paper, setPaper, updatePaper, saved, onSave, onUnsave }) {
  const styles = useThemedStyles(makeStyles);
  const [solvingAll, setSolvingAll] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const savedIds = new Set(saved.map((s) => s.id));
  const historyId = paper.historyId;
  const typed = paper.kind === 'typed';

  const update = (id, patch) =>
    updatePaper(historyId, (p) => ({
      ...p,
      questions: p.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    }));

  // A new solution starts a new conversation, so earlier follow-ups are cleared.
  const solve = async (q) => {
    update(q.id, { status: 'solving', error: '', followups: [], followupFailed: null });
    try {
      update(q.id, { status: 'done', solution: await api.solve(q, paper.subject, sectionContext(paper.questions, q)) });
    } catch (err) {
      update(q.id, { status: 'error', error: err.message });
    }
  };

  // A typed question is solved straight away (once).
  const autoSolved = useRef(false);
  useEffect(() => {
    if (!paper.autoSolve || autoSolved.current) return;
    autoSolved.current = true;
    setPaper((p) => ({ ...p, autoSolve: false }));
    solve(paper.questions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const solveAll = async () => {
    setSolvingAll(true);
    const queue = paper.questions.filter((q) => q.status !== 'done');
    const worker = async () => {
      while (queue.length) await solve(queue.shift());
    };
    await Promise.all(Array.from({ length: SOLVE_CONCURRENCY }, worker));
    setSolvingAll(false);
  };

  const download = async (args) => {
    setDownloading(true);
    try {
      await sharePdf(args);
    } catch (err) {
      Alert.alert('Download failed', err.message);
    } finally {
      setDownloading(false);
    }
  };

  const savedItem = (q) => ({
    id: savedId(paper.title, q),
    paperTitle: paper.title,
    subject: paper.subject,
    number: q.number,
    text: q.text,
    marks: q.marks,
    solution: q.solution,
    followups: q.followups || [],
    savedAt: new Date().toISOString(),
  });

  const toggleSave = (q) => {
    const id = savedId(paper.title, q);
    if (savedIds.has(id)) onUnsave(id);
    else onSave(savedItem(q));
  };

  // Follow-up questions are answered in the context of the question, its solution and earlier follow-ups.
  // The reply is added to the question (and to its saved copy, if it is saved).
  const askFollowUp = async (q, message) => {
    update(q.id, { followupPending: message, followupFailed: null });
    try {
      const { answer } = await api.followup(q, paper.subject, toFollowupsPayload(q.followups), message);
      const turn = { question: message, answer, askedAt: new Date().toISOString() };
      const followups = [...(q.followups || []), turn];
      update(q.id, { followups, followupPending: null });
      if (savedIds.has(savedId(paper.title, q))) onSave(savedItem({ ...q, followups }));
    } catch (err) {
      update(q.id, { followupPending: null, followupFailed: { question: message, error: err.message } });
    }
  };

  const solvedCount = paper.questions.filter((q) => q.status === 'done').length;
  const total = paper.questions.length;

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.page}>
      <Gradient style={styles.paperHero}>
        <View style={[styles.ring, { width: 180, height: 180, borderRadius: 90, top: -80, right: -50 }]} />
        <Text style={styles.heroKicker}>{typed ? 'ASKED STUDYSYNC BOT' : 'EXAM PAPER'}</Text>
        <Text style={styles.paperTitle}>{typed ? 'Your question' : paper.title}</Text>
        <View style={styles.chips}>
          {typed ? (
            <Chip tone="glass" icon="message-square" label="Typed question" />
          ) : (
            <>
              {!!paper.subject && <Chip tone="glass" icon="book-open" label={paper.subject} />}
              <Chip tone="glass" icon="hash" label={`${total} questions`} />
              {paper.pages > 0 && <Chip tone="glass" icon="layers" label={`${paper.pages} page${paper.pages === 1 ? '' : 's'}`} />}
              {!!paper.method && <Chip tone="glass" icon="eye" label={METHOD_LABEL[paper.method] || paper.method} />}
            </>
          )}
        </View>

        {!typed && (
          <View style={{ gap: 6 }}>
            <View style={styles.progressLabels}>
              <Text style={styles.heroSmall}>
                {solvedCount} of {total} solved
              </Text>
              <Text style={styles.heroPercent}>{Math.round((solvedCount / total) * 100)}%</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${(solvedCount / total) * 100}%` }]} />
            </View>
          </View>
        )}

        <View style={styles.actions}>
          {!typed && (
            <Button
              title={solvingAll ? 'Solving…' : solvedCount === total ? 'All solved' : 'Solve all'}
              icon={solvedCount === total ? 'check' : 'zap'}
              variant="light"
              size="sm"
              onPress={solveAll}
              loading={solvingAll}
              disabled={solvedCount === total}
            />
          )}
          <Button
            title="Download PDF"
            icon="download"
            variant="glass"
            size="sm"
            loading={downloading}
            disabled={solvedCount === 0}
            onPress={() =>
              download({ title: paper.title, subject: paper.subject, items: paper.questions.filter((q) => q.solution) })
            }
          />
          <Button
            title={typed ? 'New question' : 'New paper'}
            icon="plus"
            variant="glass"
            size="sm"
            onPress={() => setPaper(null)}
          />
        </View>
      </Gradient>

      {paper.questions.map((q) => (
        <QuestionCard
          key={q.id}
          question={q}
          onSolve={() => solve(q)}
          onEdit={(text) => update(q.id, { text, status: 'idle', solution: null, error: '', followups: [] })}
          isSaved={savedIds.has(savedId(paper.title, q))}
          onToggleSave={() => toggleSave(q)}
          onFollowUp={(message) => askFollowUp(q, message)}
          onDownload={() => download({ title: `${paper.title} - Q${q.number}`, subject: paper.subject, items: [q] })}
        />
      ))}
    </KeyboardAwareScrollView>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
  page: { padding: 16, paddingTop: 8, gap: 14, paddingBottom: 40 },
  h2: { color: colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  small: { color: colors.muted, fontSize: 12.5, lineHeight: 17 },
  cardTitle: { color: colors.text, fontWeight: '800', fontSize: 16, marginBottom: 2 },
  section: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 6 },

  // hero
  hero: { borderRadius: 28, padding: 20, gap: 18, overflow: 'hidden' },
  ring: { position: 'absolute', borderWidth: 26, borderColor: 'rgba(255,255,255,0.07)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroKicker: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  heroTitle: { color: '#fff', fontSize: 27, lineHeight: 32, fontWeight: '800', letterSpacing: -0.5 },
  heroBot: {
    width: 78,
    height: 78,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 8, 40, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    transform: [{ rotate: '6deg' }],
  },
  heroStats: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  heroSmall: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  heroPercent: { color: '#fff', fontSize: 13, fontWeight: '800' },

  // upload tiles
  tiles: { flexDirection: 'row', gap: 12 },
  tile: {
    flex: 1,
    gap: 4,
    padding: 16,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: `0 8px 24px ${colors.shadow}14`,
  },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  formats: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: -4 },

  // ask the bot
  askCard: { gap: 14 },
  askLabel: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  composer: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.inputBg,
    padding: 6,
  },
  askInput: {
    minHeight: 76,
    paddingHorizontal: 10,
    paddingTop: 8,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  codeInput: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 13 },
  askActions: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 4 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  suggestions: { gap: 8, paddingRight: 4 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 260,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
  suggestionText: { color: colors.textSoft, fontSize: 13, fontWeight: '600', flexShrink: 1 },

  // how it works
  steps: { flexDirection: 'row', gap: 8 },
  stepCol: { flex: 1, alignItems: 'center', gap: 6 },
  connector: {
    position: 'absolute',
    top: 22,
    left: '62%',
    right: '-38%',
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.borderStrong,
  },
  stepTitle: { color: colors.text, fontWeight: '800', fontSize: 14, marginTop: 4 },
  stepBody: { color: colors.muted, fontSize: 12, lineHeight: 16, textAlign: 'center' },

  // processing
  processing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  pulseWrap: { width: 170, height: 170, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  pulse: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  pulseCore: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  stages: { alignSelf: 'stretch', gap: 14, marginTop: 6 },
  stage: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stageDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageActive: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  stageText: { color: colors.text, fontSize: 15, fontWeight: '600' },

  // paper header
  paperHero: { borderRadius: 26, padding: 20, gap: 14, overflow: 'hidden' },
  paperTitle: { color: '#fff', fontSize: 23, lineHeight: 29, fontWeight: '800', letterSpacing: -0.3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 8, backgroundColor: '#fff' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
