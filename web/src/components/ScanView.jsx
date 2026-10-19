import { useEffect, useRef, useState } from "react";
import { Download, FilePlus2, FileText, LoaderCircle, MessageSquareText, Send, Sparkles, Upload } from "lucide-react";
import { api } from "../lib/api.js";
import { downloadPdf } from "../lib/pdf.js";
import { savedId } from "../lib/saved.js";
import { toFollowupsPayload } from "../lib/followups.js";
import { sectionContext } from "../lib/context.js";
import { handleIndentKey, looksLikeCode } from "../lib/editor.js";
import { summarize } from "../lib/richtext.js";
import BotAvatar from "./BotAvatar.jsx";
import { MicButton } from "./VoiceButtons.jsx";
import QuestionCard from "./QuestionCard.jsx";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff";
const SOLVE_CONCURRENCY = 3;

const METHOD_LABEL = {
  "pdf-text": "Text PDF",
  ocr: "RapidOCR",
  "pdf-text+ocr": "Text PDF + RapidOCR",
};

export default function ScanView({ paper, setPaper, updatePaper, startPaper, saved, onSave, onUnsave }) {
  if (!paper) return <UploadPanel onStart={startPaper} />;
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

function UploadPanel({ onStart }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [typed, setTyped] = useState("");
  const voiceBase = useRef(""); // text already in the box when the microphone was started

  useEffect(() => {
    if (!file) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(t);
  }, [file]);

  const start = async (f) => {
    if (!f) return;
    setError("");
    setElapsed(0);
    setFile(f);
    try {
      const result = await api.extract(f);
      if (!result.questions.length) {
        setError("No questions were found in this file. Try a clearer scan.");
        return;
      }
      onStart({
        ...result,
        kind: "paper",
        questions: result.questions.map((q) => ({ ...q, status: "idle", solution: null, error: "" })),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setFile(null);
    }
  };

  const askTyped = (e) => {
    e.preventDefault();
    // Keep leading indentation (pasted code); only drop blank lines around the question.
    const text = typed.replace(/^\s*\n/, "").trimEnd();
    if (!text.trim()) return;
    const summary = summarize(text);
    onStart({
      kind: "typed",
      title: summary.length > 70 ? `${summary.slice(0, 70).trim()}…` : summary,
      subject: "",
      fileName: null,
      method: "typed",
      pages: 0,
      rawText: "",
      autoSolve: true,
      questions: [{ id: "q1", number: "1", text, marks: null, status: "idle", solution: null, error: "" }],
    });
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    start(e.dataTransfer.files?.[0]);
  };

  if (file) {
    return (
      <div className="card processing">
        <LoaderCircle size={36} className="spin accent" />
        <h2>Reading “{file.name}”</h2>
        <p className="muted">
          {elapsed < 6
            ? "Extracting text with OCR…"
            : elapsed < 20
              ? "Identifying individual questions…"
              : "Still working. Long or scanned papers can take a minute."}
        </p>
        <div className="progress">
          <div className="progress-bar" />
        </div>
        <small className="muted">{elapsed}s</small>
      </div>
    );
  }

  return (
    <div className="upload-wrap">
      <div className="page-head">
        <h1>Scan an exam paper</h1>
        <p className="muted">Upload a PDF or image. StudySync extracts every question so you can solve and review them.</p>
      </div>

      <div
        className={dragging ? "dropzone dragging" : "dropzone"}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      >
        <div className="dropzone-icon">
          <Upload size={26} />
        </div>
        <strong>Drop your paper here, or click to browse</strong>
        <span className="muted">PDF, PNG, JPG, WEBP, BMP or TIFF · up to 20 MB</span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            start(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {error && <div className="alert">{error}</div>}

      <form className="card ask-card" onSubmit={askTyped}>
        <div className="ask-intro">
          <BotAvatar size={44} />
          <div>
            <label className="ask-label" htmlFor="ask">
              Ask StudySync Bot
            </label>
            <p className="muted">Type or speak a single question. I&apos;ll explain the answer step by step.</p>
          </div>
        </div>
        <textarea
          id="ask"
          rows={Math.min(16, Math.max(3, typed.split("\n").length + 1))}
          placeholder={"e.g. A car travels 150 km in 2.5 hours. Calculate its average speed.\nYou can also paste code, e.g. \"What does this Python code print?\" followed by the code."}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) askTyped(e);
            else handleIndentKey(e, setTyped);
          }}
          className={looksLikeCode(typed) ? "code-input" : undefined}
          spellCheck={!looksLikeCode(typed)}
          maxLength={8000}
        />
        <div className="ask-row">
          <small className="muted">Ctrl + Enter to send · Tab indents code</small>
          <div className="actions">
            <MicButton
              onStart={() => {
                voiceBase.current = typed.trimEnd();
                setError("");
              }}
              onText={(text) => setTyped(voiceBase.current ? `${voiceBase.current} ${text}` : text)}
              onError={setError}
            />
            <button className="btn btn-primary btn-sm" disabled={!typed.trim()}>
              <Send size={15} /> Ask
            </button>
          </div>
        </div>
      </form>

      <div className="how">
        <div>
          <span className="how-n">1</span>
          <strong>Upload</strong>
          <p className="muted">A typed PDF, a scanned paper, or a phone photo.</p>
        </div>
        <div>
          <span className="how-n">2</span>
          <strong>Extract</strong>
          <p className="muted">OCR reads the paper and splits it into questions.</p>
        </div>
        <div>
          <span className="how-n">3</span>
          <strong>Understand</strong>
          <p className="muted">Get step-by-step solutions, then save or download them.</p>
        </div>
      </div>
    </div>
  );
}

function PaperView({ paper, setPaper, updatePaper, saved, onSave, onUnsave }) {
  const [solvingAll, setSolvingAll] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const savedIds = new Set(saved.map((s) => s.id));
  const historyId = paper.historyId;
  const typed = paper.kind === "typed";

  const update = (id, patch) =>
    updatePaper(historyId, (p) => ({
      ...p,
      questions: p.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    }));

  // A new solution starts a new conversation, so earlier follow-ups are cleared.
  const solve = async (q) => {
    update(q.id, { status: "solving", error: "", followups: [], followupFailed: null });
    try {
      const solution = await api.solve(q, paper.subject, sectionContext(paper.questions, q));
      update(q.id, { status: "done", solution });
    } catch (err) {
      update(q.id, { status: "error", error: err.message });
    }
  };

  // A typed question is solved straight away (once, even under React StrictMode).
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
    const queue = paper.questions.filter((q) => q.status !== "done");
    const worker = async () => {
      while (queue.length) await solve(queue.shift());
    };
    await Promise.all(Array.from({ length: SOLVE_CONCURRENCY }, worker));
    setSolvingAll(false);
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

  const solvedCount = paper.questions.filter((q) => q.status === "done").length;
  const total = paper.questions.length;

  return (
    <div className="paper">
      <div className="paper-head card">
        <div className="paper-title">
          <div className="file-icon">{typed ? <MessageSquareText size={22} /> : <FileText size={22} />}</div>
          <div>
            <h1>{typed ? "Your question" : paper.title}</h1>
            <div className="meta">
              {typed ? (
                <span className="chip">Typed question</span>
              ) : (
                <>
                  {paper.subject && <span className="chip">{paper.subject}</span>}
                  <span className="chip">{total} questions</span>
                  {paper.pages > 0 && (
                    <span className="chip">
                      {paper.pages} page{paper.pages === 1 ? "" : "s"}
                    </span>
                  )}
                  {paper.method && <span className="chip">{METHOD_LABEL[paper.method] || paper.method}</span>}
                  {paper.fileName && (
                    <span className="muted file-name" title={paper.fileName}>
                      {paper.fileName}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {!typed && (
          <div className="progress-line">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${(solvedCount / total) * 100}%` }} />
            </div>
            <span className="muted">
              {solvedCount}/{total} solved
            </span>
          </div>
        )}

        <div className="actions">
          {!typed && (
            <button className="btn btn-primary" onClick={solveAll} disabled={solvingAll || solvedCount === total}>
              {solvingAll ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
              {solvingAll ? "Solving…" : solvedCount === total ? "All solved" : "Solve all"}
            </button>
          )}
          <button
            className="btn"
            disabled={solvedCount === 0}
            onClick={() =>
              downloadPdf({
                title: paper.title,
                subject: paper.subject,
                items: paper.questions.filter((q) => q.solution),
              })
            }
          >
            <Download size={16} /> Download PDF
          </button>
          {paper.rawText && (
            <button className="btn btn-ghost" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? "Hide" : "Show"} extracted text
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => setPaper(null)}>
            <FilePlus2 size={16} /> {typed ? "New question" : "New paper"}
          </button>
        </div>

        {showRaw && <pre className="raw-text">{paper.rawText}</pre>}
      </div>

      <div className="question-list">
        {paper.questions.map((q) => (
          <QuestionCard
            key={q.id}
            question={q}
            onSolve={() => solve(q)}
            onEdit={(text) => update(q.id, { text, status: "idle", solution: null, error: "", followups: [] })}
            isSaved={savedIds.has(savedId(paper.title, q))}
            onToggleSave={() => toggleSave(q)}
            onFollowUp={(message) => askFollowUp(q, message)}
            onDownload={() =>
              downloadPdf({
                title: typed ? "StudySync answer" : `${paper.title} - Q${q.number}`,
                subject: paper.subject,
                items: [q],
              })
            }
          />
        ))}
      </div>
    </div>
  );
}
