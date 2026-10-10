import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { ThemeProvider, useTheme, useThemedStyles } from './src/theme';
import { api, tokenStore } from './src/api';
import { toSavedPayload } from './src/saved';
import { newHistoryId, paperFromHistory, toHistoryPayload, upsertHistory } from './src/history';
import { createSyncQueue } from './src/sync';
import { clearLegacyData, readLegacyData } from './src/legacy';
import { Button } from './src/components/ui';
import Logo from './src/components/Logo';
import { stopSpeaking } from './src/speech';
import AuthScreen from './src/screens/AuthScreen';
import ScanScreen from './src/screens/ScanScreen';
import SavedScreen from './src/screens/SavedScreen';
import HistoryScreen from './src/screens/HistoryScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const { colors, mode } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <>
      {/* Light status bar text on the dark theme, dark text on the bright theme. */}
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} backgroundColor={colors.bg} />
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
        <Main />
      </SafeAreaView>
    </>
  );
}

// Keeps items created on this screen that the server list doesn't include yet (their save may still be in flight).
function mergeById(local, server) {
  const ids = new Set(server.map((x) => x.id));
  return [...local.filter((x) => !ids.has(x.id)), ...server];
}

function Main() {
  const { colors, mode, toggle } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState('scan');
  const [paper, setPaper] = useState(null);
  const [saved, setSaved] = useState([]);
  const [history, setHistory] = useState([]);
  const [dataStatus, setDataStatus] = useState('idle'); // idle | loading | ready | error
  const [dataError, setDataError] = useState('');
  const [syncError, setSyncError] = useState('');

  const historyRef = useRef(history);
  historyRef.current = history;
  const paperRef = useRef(paper);
  paperRef.current = paper;

  const syncRef = useRef(null);
  if (!syncRef.current) {
    syncRef.current = createSyncQueue((err) =>
      setSyncError(
        err.status === 401
          ? 'Your session has expired, so your latest changes were not saved. Please sign out and sign in again.'
          : `Couldn't save your latest changes to your account. ${err.message}`
      )
    );
  }
  const sync = syncRef.current;

  useEffect(() => {
    (async () => {
      try {
        if (await tokenStore.get()) setUser((await api.me()).user);
      } catch {
        await tokenStore.set(null);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const loadAccountData = useCallback(async (userId) => {
    setDataStatus('loading');
    setDataError('');
    try {
      let [serverHistory, serverSaved] = await Promise.all([api.history.list(), api.saved.list()]);

      // One-time upload of anything an older version kept only on this phone.
      const legacy = await readLegacyData(userId);
      if (legacy.history.length || legacy.saved.length) {
        const historyIds = new Set(serverHistory.map((e) => e.id));
        const savedIds = new Set(serverSaved.map((s) => s.id));
        for (const e of legacy.history) {
          if (e?.id && Array.isArray(e.questions) && !historyIds.has(e.id)) {
            await api.history.put(e.id, toHistoryPayload(e));
          }
        }
        for (const s of legacy.saved) {
          if (s?.id && s.solution && !savedIds.has(s.id)) await api.saved.add(toSavedPayload(s));
        }
        await clearLegacyData(userId);
        [serverHistory, serverSaved] = await Promise.all([api.history.list(), api.saved.list()]);
      }

      setHistory((prev) => mergeById(prev, serverHistory));
      setSaved((prev) => mergeById(prev, serverSaved));
      setDataStatus('ready');
    } catch (err) {
      setDataError(err.message);
      setDataStatus('error');
    }
  }, []);

  useEffect(() => {
    setHistory([]);
    setSaved([]);
    setSyncError('');
    if (user) loadAccountData(user.id);
    else setDataStatus('idle');
  }, [user, loadAccountData]);

  // ---------- history

  const persistEntry = useCallback(
    (entry) => sync.enqueue(`h:${entry.id}`, () => api.history.put(entry.id, toHistoryPayload(entry))),
    [sync]
  );

  // Records a paper in history (state + database). No-op if nothing changed.
  const recordPaper = useCallback(
    (p) => {
      const prev = historyRef.current;
      const next = upsertHistory(prev, p);
      if (next === prev) return;
      historyRef.current = next;
      setHistory(next);
      persistEntry(next[0]);
    },
    [persistEntry]
  );

  // Every paper and every solved question is recorded in history automatically.
  useEffect(() => {
    if (user && paper?.historyId) recordPaper(paper);
  }, [paper, user, recordPaper]);

  // Applies a change to a specific paper; if it is no longer open (e.g. a solve finished after
  // the student started a new paper), the change goes into history instead.
  const updatePaper = useCallback(
    (historyId, fn) => {
      if (paperRef.current?.historyId === historyId) {
        setPaper((p) => (p?.historyId === historyId ? fn(p) : p));
      } else {
        const entry = historyRef.current.find((e) => e.id === historyId);
        if (entry) recordPaper(fn(paperFromHistory(entry)));
      }
    },
    [recordPaper]
  );

  const startPaper = (p) => setPaper({ ...p, historyId: newHistoryId(), createdAt: new Date().toISOString() });

  const openFromHistory = (entry) => {
    setPaper(paperFromHistory(entry));
    setTab('scan');
  };

  // Deleting the paper that is open also closes it, otherwise the next solve would re-add it.
  const deleteHistory = (id) => {
    setHistory((list) => list.filter((e) => e.id !== id));
    if (paperRef.current?.historyId === id) setPaper(null);
    sync.enqueue(`h:${id}`, () => api.history.remove(id));
  };

  const clearHistory = () => {
    setHistory([]);
    setPaper(null);
    sync.dropPending('h:');
    sync.enqueue('h:*', () => api.history.clear());
  };

  // ---------- saved answers

  const saveAnswer = (item) => {
    setSaved((list) => [item, ...list.filter((s) => s.id !== item.id)]);
    sync.enqueue(`s:${item.id}`, () => api.saved.add(toSavedPayload(item)));
  };

  const unsaveAnswer = (key) => {
    setSaved((list) => list.filter((s) => s.id !== key));
    sync.enqueue(`s:${key}`, () => api.saved.remove(key));
  };

  // ---------- auth

  const onAuth = async ({ token, user }) => {
    await tokenStore.set(token);
    setUser(user);
  };

  const signOut = async () => {
    stopSpeaking();
    await tokenStore.set(null);
    setUser(null);
    setPaper(null);
    setTab('scan');
  };

  const logout = () => {
    if (!sync.busy()) return signOut();
    Alert.alert('Still saving', 'Your latest changes are still being saved. Sign out anyway?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  if (booting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!user) return <AuthScreen onAuth={onAuth} />;

  const dataGate =
    dataStatus === 'loading' ? (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.gateText}>Loading your {tab === 'history' ? 'history' : 'saved answers'}…</Text>
      </View>
    ) : dataStatus === 'error' ? (
      <View style={styles.center}>
        <Text style={styles.gateTitle}>Couldn't load your account data</Text>
        <Text style={styles.gateText}>{dataError}</Text>
        <Button title="Try again" icon="rotate-ccw" variant="primary" onPress={() => loadAccountData(user.id)} />
      </View>
    ) : null;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.topbar}>
        <Logo />
        <View style={{ flex: 1 }} />
        <Pressable onPress={toggle} hitSlop={10} accessibilityLabel={mode === 'dark' ? 'Switch to bright mode' : 'Switch to dark mode'}>
          <Feather name={mode === 'dark' ? 'sun' : 'moon'} size={18} color={colors.muted} />
        </Pressable>
        <Text style={styles.userName} numberOfLines={1}>
          {user.fullName}
        </Text>
        <Pressable onPress={logout} hitSlop={10} accessibilityLabel="Sign out">
          <Feather name="log-out" size={18} color={colors.muted} />
        </Pressable>
      </View>

      {!!syncError && (
        <Pressable style={styles.syncError} onPress={() => setSyncError('')} accessibilityRole="alert">
          <Text style={styles.syncErrorText}>{syncError}</Text>
          <Feather name="x" size={16} color="#ffb3b3" />
        </Pressable>
      )}

      <View style={{ flex: 1 }}>
        {tab === 'scan' && (
          <ScanScreen
            paper={paper}
            setPaper={setPaper}
            updatePaper={updatePaper}
            startPaper={startPaper}
            saved={saved}
            onSave={saveAnswer}
            onUnsave={unsaveAnswer}
          />
        )}
        {tab === 'history' &&
          (dataGate || (
            <HistoryScreen
              history={history}
              activeId={paper?.historyId}
              onOpen={openFromHistory}
              onDelete={deleteHistory}
              onClear={clearHistory}
              onScan={() => setTab('scan')}
            />
          ))}
        {tab === 'saved' &&
          (dataGate || <SavedScreen saved={saved} onUnsave={unsaveAnswer} onScan={() => setTab('scan')} />)}
      </View>

      <View style={styles.tabbar}>
        <TabButton icon="camera" label="Scan" active={tab === 'scan'} onPress={() => setTab('scan')} />
        <TabButton icon="clock" label="History" active={tab === 'history'} onPress={() => setTab('history')} />
        <TabButton
          icon="bookmark"
          label="Saved"
          badge={saved.length}
          active={tab === 'saved'}
          onPress={() => setTab('saved')}
        />
      </View>
    </View>
  );
}

function TabButton({ icon, label, active, onPress, badge }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const color = active ? colors.text : colors.muted;
  return (
    <Pressable style={styles.tab} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <View>
        <Feather name={icon} size={20} color={active ? colors.accent : colors.muted} />
        {!!badge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.tabLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: colors.bg },
  gateTitle: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  gateText: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  syncError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: 12,
    marginBottom: 0,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.alertBorder,
  },
  syncErrorText: { flex: 1, color: colors.alertText, fontSize: 13 },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  userName: { color: colors.muted, fontSize: 14, maxWidth: 150 },
  tabbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    paddingTop: 8,
    paddingBottom: 6,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  tabLabel: { fontSize: 12, fontWeight: '600' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 18,
    paddingHorizontal: 4,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
