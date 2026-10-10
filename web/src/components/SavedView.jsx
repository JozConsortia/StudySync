import { useMemo, useState } from "react";
import { BookmarkX, ChevronDown, Download, ScanText, Search } from "lucide-react";
import { downloadPdf } from "../lib/pdf.js";
import SolutionView from "./SolutionView.jsx";
import RichText from "./RichText.jsx";
import { summarize } from "../lib/richtext.js";
import BotMessage from "./BotMessage.jsx";
import { ListenButton } from "./VoiceButtons.jsx";

export default function SavedView({ saved, onUnsave, onScan }) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return saved;
    return saved.filter((s) => `${s.paperTitle} ${s.subject} ${s.text}`.toLowerCase().includes(q));
  }, [saved, query]);

  if (!saved.length) {
    return (
      <div className="card empty">
        <BookmarkX size={32} className="muted" />
        <h2>No saved answers yet</h2>
        <p className="muted">Solve a question and press Save to keep it here. Saved answers are stored in your account.</p>
        <button className="btn btn-primary" onClick={onScan}>
          <ScanText size={16} /> Scan a paper
        </button>
      </div>
    );
  }

  return (
    <div className="saved">
      <div className="page-head row">
        <div>
          <h1>Saved answers</h1>
          <p className="muted">{saved.length} saved to your account</p>
        </div>
        <button
          className="btn"
          onClick={() =>
            downloadPdf({ title: "My saved answers", items: filtered, fileName: "studysync-saved-answers.pdf" })
          }
        >
          <Download size={16} /> Download {query ? "results" : "all"}
        </button>
      </div>

      <label className="search">
        <Search size={16} />
        <input placeholder="Search saved answers" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      <div className="question-list">
        {filtered.map((s) => {
          const open = openId === s.id;
          return (
            <article key={s.id} className="card question">
              <button className="saved-head" onClick={() => setOpenId(open ? null : s.id)} aria-expanded={open}>
                <span className="q-number">Q{s.number}</span>
                <div className="saved-summary">
                  <strong>{s.paperTitle}</strong>
                  <span className="muted">{summarize(s.text)}</span>
                </div>
                <ChevronDown size={18} className={open ? "chev open" : "chev"} />
              </button>

              {open && (
                <>
                  <RichText text={s.text} className="q-text" />
                  <BotMessage actions={<ListenButton solution={s.solution} question={s.text} id={`s:${s.id}`} />}>
                    <SolutionView solution={s.solution} />
                  </BotMessage>
                  <div className="actions">
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        downloadPdf({ title: `${s.paperTitle} - Q${s.number}`, subject: s.subject, items: [s] })
                      }
                    >
                      <Download size={15} /> Download
                    </button>
                    <button
                      className="btn btn-ghost btn-sm danger"
                      onClick={() => onUnsave(s.id)}
                    >
                      <BookmarkX size={15} /> Remove
                    </button>
                  </div>
                </>
              )}
            </article>
          );
        })}
        {!filtered.length && <p className="muted">No saved answers match “{query}”.</p>}
      </div>
    </div>
  );
}
