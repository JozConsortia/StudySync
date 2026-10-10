import BotAvatar from "./BotAvatar.jsx";

/** A chat message from StudySync Bot: robot avatar on the left, answer bubble on the right. */
export default function BotMessage({ thinking = false, label = "StudySync Bot", actions = null, children }) {
  return (
    <div className="bot-row">
      <BotAvatar thinking={thinking} />
      <div className="bot-bubble">
        <div className="bot-name">
          <span>{label}</span>
          {actions}
        </div>
        {thinking ? <TypingIndicator /> : children}
      </div>
    </div>
  );
}

export function TypingIndicator({ text = "Working it out step by step" }) {
  return (
    <div className="typing" role="status" aria-live="polite">
      <span className="typing-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {text}…
    </div>
  );
}
