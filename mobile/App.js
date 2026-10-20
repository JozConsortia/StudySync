import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { ThemeProvider, useTheme, useThemedStyles } from './src/theme';
import { api, tokenStore } from './src/api';
import { toSavedPayload } from './src/saved';
import { newHistoryId, paperFromHistory, toHistoryPayload, upsertHistory } from './src/history';
import { createSyncQueue } from './src/sync';
import { clearLegacyData, readLegacyData } from './src/legacy';
import { Backdrop, Button, Gradient, IconButton } from './src/components/ui';
import Logo from './src/components/Logo';
import { stopSpeaking } from './src/speech';
import { haptics } from './src/haptics';
import { ToastProvider, useToast } from './src/components/Toast';
import AuthScreen from './src/screens/AuthScreen';
import ScanScreen from './src/screens/ScanScreen';
import SavedScreen from './src/screens/SavedScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ChallengesScreen from './src/screens/ChallengesScreen';
import AccountScreen from './src/screens/AccountScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      {/* Tracks the keyboard so text boxes can move above it (see components/KeyboardAware.js). */}
      <KeyboardProvider>
        <ThemeProvider>
          <Shell />
        </ThemeProvider>
      </KeyboardProvider>
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
        {/* Toasts sit just above the floating tab bar. */}
        <ToastProvider bottom={92}>
          <Main />
        </ToastProvider>
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
  const [tab, setTabState] = useState('scan');
  // Tabs stay mounted once opened, so a half-typed question, a scroll position or a challenge
  // in progress is still there after a look at another tab.
  const [visited, setVisited] = useState(() => new Set(['scan']));
  const setTab = useCallback((next) => {
    setTabState((current) => {
      if (current !== next) haptics.select();
      return next;
    });
    setVisited((v) => (v.has(next) ? v : new Set(v).add(next)));
  }, []);
  const toast = useToast();
  const [challengeStats, setChallengeStats] = useState(null);
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
      } catch (err) {
        // Only forget the sign-in when the server rejects it, not when the server can't be reached.
        if (err.status === 401) await tokenStore.set(null);
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

  // ---------- sync across devices
  // History and saved answers live in the database, so whatever is done on the web, the desktop app or
  // another phone shows up here: the lists are re-read when the app comes back to the foreground, when
  // History or Saved is opened, every 20 seconds while the app is open, and on pull-to-refresh.
  const [syncedAt, setSyncedAt] = useState(null);
  const refreshing = useRef(false);

  const refreshFromServer = useCallback(async () => {
    if (!user || refreshing.current || sync.busy() || AppState.currentState !== 'active') return;
    refreshing.current = true;
    const changesBefore = sync.changeCount();
    try {
      const [serverHistory, serverSaved] = await Promise.all([api.history.list(), api.saved.list()]);
      // A local change made while fetching wins; the next refresh will include it.
      if (sync.busy() || sync.changeCount() !== changesBefore) return;
      historyRef.current = serverHistory;
      setHistory(serverHistory);
      setSaved(serverSaved);
      setSyncedAt(new Date());
    } catch {
      // offline or the server is restarting: try again on the next refresh
    } finally {
      refreshing.current = false;
    }
  }, [user, sync]);

  useEffect(() => {
    if (dataStatus !== 'ready') return;
    setSyncedAt(new Date());
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refreshFromServer());
    const timer = setInterval(refreshFromServer, 20000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [dataStatus, refreshFromServer]);

  useEffect(() => {
    if (tab !== 'scan' && dataStatus === 'ready') refreshFromServer();
  }, [tab, dataStatus, refreshFromServer]);

  // Android back button: other tabs go back to Scan, an open paper closes (it stays in History),
  // and only then does the app close.
  useEffect(() => {
    if (!user) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab !== 'scan') {
        setTab('scan');
        return true;
      }
      if (paperRef.current) {
        setPaper(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [user, tab, setTab]);

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
  // An Undo puts the entry back (in date order) and saves it again.
  const deleteHistory = (id) => {
    const entry = historyRef.current.find((e) => e.id === id);
    const next = historyRef.current.filter((e) => e.id !== id);
    historyRef.current = next;
    setHistory(next);
    if (paperRef.current?.historyId === id) setPaper(null);
    sync.enqueue(`h:${id}`, () => api.history.remove(id));
    haptics.warning();
    if (!entry) return;
    toast({
      message: 'Removed from history',
      icon: 'trash-2',
      action: {
        label: 'Undo',
        onPress: () => {
          const restored = [...historyRef.current.filter((e) => e.id !== id), entry].sort(
            (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
          );
          historyRef.current = restored;
          setHistory(restored);
          persistEntry(entry);
        },
      },
    });
  };

  const clearHistory = () => {
    haptics.warning();
    historyRef.current = [];
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

  const savedRef = useRef(saved);
  savedRef.current = saved;

  // An Undo puts the answer back where it was and saves it again.
  const unsaveAnswer = (key) => {
    const index = savedRef.current.findIndex((s) => s.id === key);
    const item = savedRef.current[index];
    setSaved((list) => list.filter((s) => s.id !== key));
    sync.enqueue(`s:${key}`, () => api.saved.remove(key));
    haptics.tap();
    if (!item) return;
    toast({
      message: 'Removed from Saved',
      icon: 'bookmark',
      action: {
        label: 'Undo',
        onPress: () => {
          setSaved((list) => {
            const rest = list.filter((s) => s.id !== key);
            return [...rest.slice(0, index), item, ...rest.slice(index)];
          });
          sync.enqueue(`s:${key}`, () => api.saved.add(toSavedPayload(item)));
        },
      },
    });
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
    setTabState('scan');
    setVisited(new Set(['scan']));
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

  const initials = (user.fullName || user.email || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <View style={styles.topbar}>
        <Logo />
        <View style={{ flex: 1 }} />
        <IconButton
          icon={mode === 'dark' ? 'sun' : 'moon'}
          onPress={toggle}
          label={mode === 'dark' ? 'Switch to bright mode' : 'Switch to dark mode'}
        />
        <Pressable onPress={() => setTab('me')} hitSlop={6} accessibilityLabel="Your account">
          <Gradient style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </Gradient>
        </Pressable>
      </View>

      {!!syncError && (
        <Pressable style={styles.syncError} onPress={() => setSyncError('')} accessibilityRole="alert">
          <Text style={styles.syncErrorText}>{syncError}</Text>
          <Feather name="x" size={16} color={colors.alertText} />
        </Pressable>
      )}

      <View style={{ flex: 1 }}>
        <Pane name="scan" tab={tab} visited={visited}>
          <ScanScreen
            user={user}
            stats={{ history: history.length, saved: saved.length }}
            paper={paper}
            setPaper={setPaper}
            updatePaper={updatePaper}
            startPaper={startPaper}
            saved={saved}
            onSave={saveAnswer}
            onUnsave={unsaveAnswer}
          />
        </Pane>
        <Pane name="history" tab={tab} visited={visited}>
          {dataGate || (
            <HistoryScreen
              history={history}
              activeId={paper?.historyId}
              onOpen={openFromHistory}
              onDelete={deleteHistory}
              onClear={clearHistory}
              onScan={() => setTab('scan')}
              syncedAt={syncedAt}
              onRefresh={refreshFromServer}
            />
          )}
        </Pane>
        <Pane name="saved" tab={tab} visited={visited}>
          {dataGate || (
            <SavedScreen
              saved={saved}
              onUnsave={unsaveAnswer}
              onScan={() => setTab('scan')}
              syncedAt={syncedAt}
              onRefresh={refreshFromServer}
            />
          )}
        </Pane>
        <Pane name="challenges" tab={tab} visited={visited}>
          <ChallengesScreen onStats={setChallengeStats} />
        </Pane>
        <Pane name="me" tab={tab} visited={visited}>
          <AccountScreen
            user={user}
            active={tab === 'me'}
            stats={challengeStats}
            onAuth={onAuth}
            onSignOut={logout}
            onOpenChallenges={() => setTab('challenges')}
          />
        </Pane>
      </View>

      {/* Floating tab bar; Scan sits in the middle as a raised gradient button. */}
      <View style={styles.tabbar}>
        <TabButton icon="award" label="Daily" active={tab === 'challenges'} onPress={() => setTab('challenges')} />
        <TabButton icon="clock" label="History" active={tab === 'history'} onPress={() => setTab('history')} />
        <Pressable
          style={styles.scanTab}
          onPress={() => setTab('scan')}
          accessibilityRole="tab"
          accessibilityLabel="Scan"
          accessibilityState={{ selected: tab === 'scan' }}
        >
          <Gradient style={[styles.scanButton, tab === 'scan' && styles.scanButtonActive]}>
            <Feather name="camera" size={24} color="#fff" />
          </Gradient>
          <Text style={[styles.tabLabel, { color: tab === 'scan' ? colors.text : colors.muted }]}>Scan</Text>
        </Pressable>
        <TabButton
          icon="bookmark"
          label="Saved"
          badge={saved.length}
          active={tab === 'saved'}
          onPress={() => setTab('saved')}
        />
        <TabButton icon="user" label="Me" active={tab === 'me'} onPress={() => setTab('me')} />
      </View>
    </View>
  );
}

/** A tab's screen: mounted the first time it is opened, then hidden (not unmounted) while another tab shows. */
function Pane({ name, tab, visited, children }) {
  if (tab !== name && !visited.has(name)) return null;
  return <View style={[{ flex: 1 }, tab !== name && { display: 'none' }]}>{children}</View>;
}

function TabButton({ icon, label, active, onPress, badge }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8 }}
      accessibilityRole="tab"
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.tabIcon, active && styles.tabIconActive]}>
        <Feather name={icon} size={20} color={active ? colors.accent : colors.muted} />
        {!!badge && (
          <Gradient style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </Gradient>
        )}
      </View>
      <Text style={[styles.tabLabel, { color: active ? colors.text : colors.muted }]}>{label}</Text>
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
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  tabbar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: 16,
    marginBottom: 8,
    marginTop: 4,
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.tabBar,
    boxShadow: `0 10px 30px ${colors.shadow}33`,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabIcon: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  tabIconActive: { backgroundColor: colors.accentSoft },
  tabLabel: { fontSize: 11.5, fontWeight: '700' },
  scanTab: { flex: 1, alignItems: 'center', gap: 4, marginTop: -30 },
  scanButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.bg,
    boxShadow: `0 8px 22px ${colors.glow1}66`,
  },
  scanButtonActive: { transform: [{ scale: 1.06 }] },
  badge: {
    position: 'absolute',
    top: -2,
    right: 4,
    minWidth: 18,
    paddingHorizontal: 4,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
