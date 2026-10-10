import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, useThemedStyles } from '../theme';
import { api } from '../api';
import { sharePdf } from '../pdf';
import { savedId } from '../saved';
import { sectionContext } from '../context';
import { BotAvatar } from '../components/Bot';
import { MicButton } from '../components/VoiceButtons';
import { parseRichText, summarize } from '../richtext';

const looksLikeCode = (text) => parseRichText(text).some((p) => p.type === 'code');
import { Button, Card, Chip, ErrorBox } from '../components/ui';
import QuestionCard from '../components/QuestionCard';

const SOLVE_CONCURRENCY = 3;
const METHOD_LABEL = { 'pdf-text': 'Text PDF', ocr: 'OCR', 'pdf-text+ocr': 'Text PDF + OCR' };

export default function ScanScreen({ paper, setPaper, updatePaper, startPaper, saved, onSave, onUnsave }) {
  if (!paper) return <UploadPanel onExtracted={startPaper} />;
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

function UploadPanel({ onExtracted }) {
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

  if (fileName) {
    return (
      <View style={styles.processing}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.h2}>Reading “{fileName}”</Text>
        <Text style={styles.muted}>
          {elapsed < 6
            ? 'Extracting text with OCR…'
            : elapsed < 20
              ? 'Identifying individual questions…'
              : 'Still working. Long or scanned papers can take a minute.'}
        </Text>
        <Text style={styles.muted}>{elapsed}s</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.h1}>Scan an exam paper</Text>
      <Text style={styles.muted}>Take a photo, or pick an image or PDF. StudySync extracts every question for you.</Text>

      <Card style={styles.uploadCard}>
        <View style={styles.uploadIcon}>
          <Feather name="upload" size={26} color={colors.accent} />
        </View>
        <Button title="Take a photo" icon="camera" variant="primary" onPress={takePhoto} style={styles.full} />
        <Button title="Choose an image" icon="image" onPress={pickImage} style={styles.full} />
        <Button title="Choose a PDF" icon="file-text" onPress={pickPdf} style={styles.full} />
        <Text style={[styles.muted, { fontSize: 12 }]}>PDF, PNG, JPG, WEBP · up to 20 MB</Text>
      </Card>

      <ErrorBox message={error} />

      <Card style={{ gap: 10 }}>
        <View style={styles.askLabel}>
          <BotAvatar size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.howTitle}>Ask StudySync Bot</Text>
            <Text style={styles.muted}>Type or speak a question. I'll explain it step by step.</Text>
          </View>
        </View>
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
          <Button title="Ask" icon="send" variant="primary" size="sm" onPress={askTyped} disabled={!typed.trim()} />
        </View>
      </Card>

      {[
        ['1', 'Upload', 'A typed PDF, a scanned paper, or a phone photo.'],
        ['2', 'Extract', 'OCR reads the paper and splits it into questions.'],
        ['3', 'Understand', 'Get step-by-step solutions, then save or download them.'],
      ].map(([n, title, body]) => (
        <View key={n} style={styles.how}>
          <View style={styles.howN}>
            <Text style={styles.howNText}>{n}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.howTitle}>{title}</Text>
            <Text style={styles.muted}>{body}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
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

  const solve = async (q) => {
    update(q.id, { status: 'solving', error: '' });
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

  const toggleSave = (q) => {
    const id = savedId(paper.title, q);
    if (savedIds.has(id)) {
      onUnsave(id);
    } else {
      onSave({
        id,
        paperTitle: paper.title,
        subject: paper.subject,
        number: q.number,
        text: q.text,
        marks: q.marks,
        solution: q.solution,
        savedAt: new Date().toISOString(),
      });
    }
  };

  const solvedCount = paper.questions.filter((q) => q.status === 'done').length;
  const total = paper.questions.length;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Card style={{ gap: 14 }}>
        <Text style={styles.h1}>{typed ? 'Your question' : paper.title}</Text>
        <View style={styles.chips}>
          {typed ? (
            <Chip label="Typed question" />
          ) : (
            <>
              {!!paper.subject && <Chip label={paper.subject} />}
              <Chip label={`${total} questions`} />
              {paper.pages > 0 && <Chip label={`${paper.pages} page${paper.pages === 1 ? '' : 's'}`} />}
              {!!paper.method && <Chip label={METHOD_LABEL[paper.method] || paper.method} />}
            </>
          )}
        </View>

        {!typed && (
          <View style={styles.progressRow}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${(solvedCount / total) * 100}%` }]} />
            </View>
            <Text style={styles.muted}>
              {solvedCount}/{total} solved
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          {!typed && (
            <Button
              title={solvingAll ? 'Solving…' : solvedCount === total ? 'All solved' : 'Solve all'}
              icon="zap"
              variant="primary"
              size="sm"
              onPress={solveAll}
              loading={solvingAll}
              disabled={solvedCount === total}
            />
          )}
          <Button
            title="Download PDF"
            icon="download"
            size="sm"
            loading={downloading}
            disabled={solvedCount === 0}
            onPress={() =>
              download({ title: paper.title, subject: paper.subject, items: paper.questions.filter((q) => q.solution) })
            }
          />
          <Button
            title={typed ? 'New question' : 'New paper'}
            icon="file-plus"
            variant="ghost"
            size="sm"
            onPress={() => setPaper(null)}
          />
        </View>
      </Card>

      {paper.questions.map((q) => (
        <QuestionCard
          key={q.id}
          question={q}
          onSolve={() => solve(q)}
          onEdit={(text) => update(q.id, { text, status: 'idle', solution: null, error: '' })}
          isSaved={savedIds.has(savedId(paper.title, q))}
          onToggleSave={() => toggleSave(q)}
          onDownload={() => download({ title: `${paper.title} - Q${q.number}`, subject: paper.subject, items: [q] })}
        />
      ))}
    </ScrollView>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 40 },
  h1: { color: colors.text, fontSize: 22, fontWeight: '800' },
  h2: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  processing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  uploadCard: { alignItems: 'center', gap: 10, paddingVertical: 28, borderStyle: 'dashed', borderColor: colors.borderStrong },
  uploadIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  full: { alignSelf: 'stretch' },
  how: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  howN: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howNText: { color: colors.accent, fontWeight: '700' },
  howTitle: { color: colors.text, fontWeight: '700', marginBottom: 2 },
  askLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  askActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  codeInput: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 13 },
  askInput: {
    minHeight: 80,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { flex: 1, height: 6, borderRadius: 6, backgroundColor: colors.surface3, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.success },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
