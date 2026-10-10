import { useCallback, useEffect, useRef, useState } from "react";
import { BookmarkCheck, History, LoaderCircle, LogOut, RotateCcw, ScanText, X } from "lucide-react";
import { api, getToken, setToken } from "./lib/api.js";
import { toSavedPayload } from "./lib/saved.js";
import { newHistoryId, paperFromHistory, toHistoryPayload, upsertHistory } from "./lib/history.js";
import { createSyncQueue } from "./lib/sync.js";
import { clearLegacyData, readLegacyData } from "./lib/legacy.js";
import AuthScreen from "./components/AuthScreen.jsx";
import ScanView from "./components/ScanView.jsx";
import SavedView from "./components/SavedView.jsx";
import HistoryView from "./components/HistoryView.jsx";
import Logo from "./components/Logo.jsx";
import Avatar from "./components/Avatar.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import { useTheme } from "./lib/theme.js";
import { stopSpeaking } from "./lib/speech.js";

// Keeps items created on this screen that the server list doesn't include yet (their save may still be in flight).
function mergeById(local, server) {
  const ids = new Set(server.map((x) => x.id));
  return [...local.filter((x) => !ids.has(x.id)), ...server];
}

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(Boolean(getToken()));
  const [tab, setTab] = useState("scan");
  const [paper, setPaper] = useState(null);
  const [saved, setSaved] = useState([]);
  const [history, setHistory] = useState([]);
  const [dataStatus, setDataStatus] = useState("idle"); // idle | loading | ready | error
  const [dataError, setDataError] = useState("");
  const [syncError, setSyncError] = useState("");

  const historyRef = useRef(history);
  historyRef.current = history;
  const paperRef = useRef(paper);
  paperRef.current = paper;

  const syncRef = useRef(null);
  if (!syncRef.current) {
    syncRef.current = createSyncQueue((err) =>
      setSyncError(
        err.status === 401
          ? "Your session has expired, so your latest changes were not saved. Please sign out and sign in again."
          : `Couldn't save your latest changes to your account. ${err.message}`
      )
    );
  }
  const sync = syncRef.current;

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setToken(null))
      .finally(() => setBooting(false));
  }, []);

  // Warn before closing the tab while changes are still being saved.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (sync.busy()) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [sync]);

  const loadAccountData = useCallback(async (userId) => {
    setDataStatus("loading");
    setDataError("");
    try {
      let [serverHistory, serverSaved] = await Promise.all([api.history.list(), api.saved.list()]);

      // One-time upload of anything an older version kept only in this browser.
      const legacy = readLegacyData(userId);
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
        clearLegacyData(userId);
        [serverHistory, serverSaved] = await Promise.all([api.history.list(), api.saved.list()]);
      }

      setHistory((prev) => mergeById(prev, serverHistory));
      setSaved((prev) => mergeById(prev, serverSaved));
      setDataStatus("ready");
    } catch (err) {
      setDataError(err.message);
      setDataStatus("error");
    }
  }, []);

  useEffect(() => {
    setHistory([]);
    setSaved([]);
    setSyncError("");
    if (user) loadAccountData(user.id);
    else setDataStatus("idle");
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

  // Applies a change to a specific paper. If the student has since moved to another paper
  // (e.g. a solve finished after they clicked "New paper"), the change goes into history instead.
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

  // A freshly extracted paper or typed question gets a history id before it is shown.
  const startPaper = (p) => setPaper({ ...p, historyId: newHistoryId(), createdAt: new Date().toISOString() });

  const openFromHistory = (entry) => {
    setPaper(paperFromHistory(entry));
    setTab("scan");
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
    sync.dropPending("h:");
    sync.enqueue("h:*", () => api.history.clear());
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

  const onAuth = ({ token, user }) => {
    setToken(token);
    setUser(user);
  };

  const logout = () => {
    if (sync.busy() && !window.confirm("Your latest changes are still being saved. Sign out anyway?")) return;
    stopSpeaking();
    setToken(null);
    setUser(null);
    setPaper(null);
    setTab("scan");
  };

  if (booting) {
    return (
      <div className="center-screen">
        <LoaderCircle className="spin" size={28} />
      </div>
    );
  }

  if (!user) return <AuthScreen onAuth={onAuth} theme={theme} onToggleTheme={toggleTheme} />;

  const dataGate =
    dataStatus === "loading" ? (
      <div className="card empty">
        <LoaderCircle size={28} className="spin accent" />
        <p className="muted">Loading your {tab === "history" ? "history" : "saved answers"}…</p>
      </div>
    ) : dataStatus === "error" ? (
      <div className="card empty">
        <h2>Couldn't load your account data</h2>
        <p className="muted">{dataError}</p>
        <button className="btn btn-primary" onClick={() => loadAccountData(user.id)}>
          <RotateCcw size={16} /> Try again
        </button>
      </div>
    ) : null;

  return (
    <div className="app">
      <header className="topbar">
        <Logo />
        <nav className="tabs" aria-label="Main">
          <button className={tab === "scan" ? "tab active" : "tab"} onClick={() => setTab("scan")}>
            <ScanText size={16} /> Scan
          </button>
          <button className={tab === "history" ? "tab active" : "tab"} onClick={() => setTab("history")}>
            <History size={16} /> History
          </button>
          <button className={tab === "saved" ? "tab active" : "tab"} onClick={() => setTab("saved")}>
            <BookmarkCheck size={16} /> Saved
            {saved.length > 0 && <span className="badge">{saved.length}</span>}
          </button>
        </nav>
        <div className="account">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <Avatar user={user} />
          <span className="account-name" title={user.email}>
            {user.fullName}
          </span>
          <button className="icon-btn" onClick={logout} title="Sign out" aria-label="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <main className="content">
        {syncError && (
          <div className="alert alert-row sync-error" role="alert">
            <span>{syncError}</span>
            <button className="icon-btn" onClick={() => setSyncError("")} aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        )}

        {tab === "scan" && (
          <ScanView
            paper={paper}
            setPaper={setPaper}
            updatePaper={updatePaper}
            startPaper={startPaper}
            saved={saved}
            onSave={saveAnswer}
            onUnsave={unsaveAnswer}
          />
        )}
        {tab === "history" &&
          (dataGate || (
            <HistoryView
              history={history}
              activeId={paper?.historyId}
              onOpen={openFromHistory}
              onDelete={deleteHistory}
              onClear={clearHistory}
              onScan={() => setTab("scan")}
            />
          ))}
        {tab === "saved" &&
          (dataGate || <SavedView saved={saved} onUnsave={unsaveAnswer} onScan={() => setTab("scan")} />)}
      </main>
    </div>
  );
}
