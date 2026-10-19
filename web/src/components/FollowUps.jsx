import { useRef, useState } from "react";
import { ArrowUp, MessageCircleQuestion, RotateCcw, Sparkles } from "lucide-react";
import RichText from "./RichText.jsx";
import BotMessage from "./BotMessage.jsx";
import { MicButton } from "./VoiceButtons.jsx";
import { FOLLOWUP_SUGGESTIONS, MAX_FOLLOWUPS } from "../lib/followups.js";

/** The conversation so far: the student's follow-up questions and StudySync Bot's replies. */
export function FollowUpThread({ followups }) {
  if (!followups?.length) return null;
  return (
    <div className="followup-thread">
      {followups.map((f, i) => (
        <div key={i} className="followup-turn">
          <UserMessage text={f.question} />
          <BotMessage>
            <RichText text={f.answer} />
          </BotMessage>
        </div>
      ))}
    </div>
  );
}

function UserMessage({ text }) {
  return (
    <div className="user-row">
      <div className="user-bubble">{text}</div>
    </div>
  );
}

/**
 * Follow-up questions under a solved question: the thread, a "thinking" reply while waiting,
 * and a box to ask the next question (typed or spoken).
 * pending: the question being answered right now; failed: { question, error } when the last one failed.
 */
export default function FollowUps({ followups = [], pending, failed, onAsk }) {
  const [draft, setDraft] = useState("");
  const voiceBase = useRef("");
  const [voiceError, setVoiceError] = useState("");
  const full = followups.length >= MAX_FOLLOWUPS;

  const send = (text = draft) => {
    const message = text.trim();
    if (!message || pending || full) return;
    setDraft("");
    onAsk(message);
  };

  return (
    <section className="followups" aria-label="Follow-up questions">
      <div className="followups-head">
        <MessageCircleQuestion size={16} />
        <span>Follow-up questions</span>
        {followups.length > 0 && <span className="chip">{followups.length}</span>}
      </div>

      <FollowUpThread followups={followups} />

      {pending && (
        <div className="followup-turn">
          <UserMessage text={pending} />
          <BotMessage thinking thinkingText="Thinking about your question" />
        </div>
      )}

      {failed && !pending && (
        <div className="alert alert-row">
          <span>{failed.error}</span>
          <button className="btn btn-sm" onClick={() => onAsk(failed.question)}>
            <RotateCcw size={14} /> Try again
          </button>
        </div>
      )}
      {voiceError && <div className="alert">{voiceError}</div>}

      {!followups.length && !pending && (
        <div className="followup-suggestions">
          {FOLLOWUP_SUGGESTIONS.map((s) => (
            <button key={s} className="suggestion" onClick={() => send(s)}>
              <Sparkles size={13} /> {s}
            </button>
          ))}
        </div>
      )}

      {full ? (
        <p className="muted small">This question has reached {MAX_FOLLOWUPS} follow-ups. Ask a new question to keep going.</p>
      ) : (
        <form
          className="followup-composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift + Enter starts a new line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={followups.length ? "Ask another follow-up…" : "Ask a follow-up question about this answer…"}
            aria-label="Follow-up question"
          />
          <MicButton
            onStart={() => {
              voiceBase.current = draft.trimEnd();
              setVoiceError("");
            }}
            onText={(text) => setDraft(voiceBase.current ? `${voiceBase.current} ${text}` : text)}
            onError={setVoiceError}
            disabled={!!pending}
          />
          <button className="send-btn" type="submit" disabled={!draft.trim() || !!pending} aria-label="Send follow-up">
            <ArrowUp size={18} />
          </button>
        </form>
      )}
    </section>
  );
}
