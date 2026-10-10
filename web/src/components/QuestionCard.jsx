import { useState } from "react";
import { Bookmark, BookmarkCheck, Download, LoaderCircle, Pencil, RotateCcw, Sparkles } from "lucide-react";
import SolutionView from "./SolutionView.jsx";

export default function QuestionCard({ question: q, onSolve, onEdit, isSaved, onToggleSave, onDownload }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(q.text);

  const saveEdit = () => {
    const text = draft.trim();
    if (text && text !== q.text) onEdit(text);
    setEditing(false);
  };

  return (
    <article className={`card question ${q.status}`}>
      <header className="question-head">
        <span className="q-number">Q{q.number}</span>
        {q.marks != null && <span className="chip">{q.marks} marks</span>}
        <div className="spacer" />
        {!editing && q.status !== "solving" && (
          <button
            className="icon-btn"
            onClick={() => {
              setDraft(q.text);
              setEditing(true);
            }}
            title="Fix OCR mistakes in this question"
            aria-label="Edit question"
          >
            <Pencil size={15} />
          </button>
        )}
      </header>

      {editing ? (
        <div className="edit-box">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.min(12, draft.split("\n").length + 2)} />
          <div className="actions">
            <button className="btn btn-primary btn-sm" onClick={saveEdit}>
              Save question
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="q-text">{q.text}</p>
      )}

      {q.status === "idle" && !editing && (
        <button className="btn btn-primary btn-sm" onClick={onSolve}>
          <Sparkles size={15} /> Solve with AI
        </button>
      )}

      {q.status === "solving" && (
        <div className="solving muted">
          <LoaderCircle size={16} className="spin accent" /> Working out the solution…
        </div>
      )}

      {q.status === "error" && (
        <div className="alert alert-row">
          <span>{q.error}</span>
          <button className="btn btn-sm" onClick={onSolve}>
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      )}

      {q.status === "done" && q.solution && (
        <>
          <SolutionView solution={q.solution} />
          <div className="actions">
            <button className={isSaved ? "btn btn-sm btn-saved" : "btn btn-sm"} onClick={onToggleSave}>
              {isSaved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
              {isSaved ? "Saved" : "Save"}
            </button>
            <button className="btn btn-sm" onClick={onDownload}>
              <Download size={15} /> Download
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onSolve}>
              <RotateCcw size={15} /> Regenerate
            </button>
          </div>
        </>
      )}
    </article>
  );
}
