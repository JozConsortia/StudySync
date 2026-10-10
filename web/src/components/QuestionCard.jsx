import { useState } from "react";
import { Bookmark, BookmarkCheck, Bot, Download, Pencil, RotateCcw } from "lucide-react";
import SolutionView from "./SolutionView.jsx";
import RichText from "./RichText.jsx";
import BotMessage from "./BotMessage.jsx";
import { ListenButton } from "./VoiceButtons.jsx";
import { handleIndentKey, looksLikeCode } from "../lib/editor.js";

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
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => handleIndentKey(e, setDraft)}
            className={looksLikeCode(draft) ? "code-input" : undefined}
            rows={Math.min(18, draft.split("\n").length + 2)}
            spellCheck={!looksLikeCode(draft)}
          />
          <small className="muted">Tip: Tab indents a line by 4 spaces, Shift + Tab removes indentation.</small>
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
        <RichText text={q.text} className="q-text" />
      )}

      {q.status === "idle" && !editing && (
        <button className="btn btn-primary btn-sm ask-bot-btn" onClick={onSolve}>
          <Bot size={16} /> Ask StudySync Bot
        </button>
      )}

      {q.status === "solving" && <BotMessage thinking />}

      {q.status === "error" && (
        <BotMessage label="StudySync Bot">
          <div className="alert alert-row">
            <span>{q.error}</span>
            <button className="btn btn-sm" onClick={onSolve}>
              <RotateCcw size={14} /> Retry
            </button>
          </div>
        </BotMessage>
      )}

      {q.status === "done" && q.solution && (
        <BotMessage actions={<ListenButton solution={q.solution} question={q.text} id={`q:${q.id}:${q.text.length}`} />}>
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
        </BotMessage>
      )}
    </article>
  );
}
