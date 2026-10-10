import { useMemo, useState } from "react";
import { ChevronDown, FileText, History, MessageSquareText, ScanText, Search, Trash2, ArrowRight } from "lucide-react";
import SolutionView from "./SolutionView.jsx";

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export default function HistoryView({ history, activeId, onOpen, onDelete, onClear, onScan }) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? history.filter((e) =>
          [e.title, e.subject, e.fileName, ...e.questions.map((x) => x.text)].join(" ").toLowerCase().includes(q)
        )
      : history;
    const out = [];
    for (const e of matches) {
      const label = dayLabel(e.updatedAt);
      if (out.at(-1)?.label === label) out.at(-1).items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [history, query]);

  if (!history.length) {
    return (
      <div className="card empty">
        <History size={32} className="muted" />
        <h2>No history yet</h2>
        <p className="muted">
          Every paper you scan and every question you ask appears here automatically, so you can come back to it
          later. Your history is stored in your account.
        </p>
        <button className="btn btn-primary" onClick={onScan}>
          <ScanText size={16} /> Scan a paper or ask a question
        </button>
      </div>
    );
  }

  const totalQuestions = history.reduce((n, e) => n + e.questions.length, 0);

  return (
    <div className="saved">
      <div className="page-head row">
        <div>
          <h1>History</h1>
          <p className="muted">
            {history.length} {history.length === 1 ? "session" : "sessions"} · {totalQuestions} questions · stored in
            your account
          </p>
        </div>
        <button
          className="btn btn-ghost danger"
          onClick={() => {
            if (window.confirm("Clear your whole history? Saved answers are kept.")) onClear();
          }}
        >
          <Trash2 size={16} /> Clear history
        </button>
      </div>

      <label className="search">
        <Search size={16} />
        <input placeholder="Search papers and questions" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      {groups.map((g) => (
        <section key={g.label} className="history-group">
          <h3 className="history-day">{g.label}</h3>
          <div className="question-list">
            {g.items.map((e) => {
              const open = openId === e.id;
              const solved = e.questions.filter((q) => q.solution);
              const typed = e.kind === "typed";
              return (
                <article key={e.id} className={e.id === activeId ? "card question history-active" : "card question"}>
                  <div className="history-head">
                    <button className="saved-head" onClick={() => setOpenId(open ? null : e.id)} aria-expanded={open}>
                      <span className="history-icon">{typed ? <MessageSquareText size={18} /> : <FileText size={18} />}</span>
                      <div className="saved-summary">
                        <strong>{typed ? e.questions[0]?.text : e.title}</strong>
                        <span className="muted">
                          {[
                            typed ? "Typed question" : `${solved.length}/${e.questions.length} solved`,
                            e.subject,
                            !typed && e.fileName,
                            timeOf(e.updatedAt),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                      <ChevronDown size={18} className={open ? "chev open" : "chev"} />
                    </button>
                  </div>

                  {open && (
                    <>
                      {e.questions.map((q) => (
                        <div key={q.id} className="history-question">
                          <div className="question-head">
                            <span className="q-number">Q{q.number}</span>
                            {q.marks != null && <span className="chip">{q.marks} marks</span>}
                            {!q.solution && <span className="chip">Not solved</span>}
                          </div>
                          <p className="q-text">{q.text}</p>
                          {q.solution && <SolutionView solution={q.solution} />}
                        </div>
                      ))}
                    </>
                  )}

                  <div className="actions">
                    <button className="btn btn-sm" onClick={() => onOpen(e)}>
                      <ArrowRight size={15} /> {solved.length < e.questions.length ? "Continue" : "Open"}
                    </button>
                    <button className="btn btn-ghost btn-sm danger" onClick={() => onDelete(e.id)}>
                      <Trash2 size={15} /> Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {!groups.length && <p className="muted">Nothing in your history matches “{query}”.</p>}
    </div>
  );
}
