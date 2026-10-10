// StudySync Bot: a small robot face. While it is "thinking" its eyes blink and the antenna glows.
export default function BotAvatar({ size = 36, thinking = false, className = "" }) {
  return (
    <span
      className={`bot-avatar ${thinking ? "thinking" : ""} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <defs>
          <linearGradient id="botHead" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent-hover)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        {/* antenna */}
        <line x1="32" y1="6" x2="32" y2="15" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
        <circle className="bot-antenna" cx="32" cy="6" r="4" fill="var(--accent-hover)" />
        {/* ears */}
        <rect x="5" y="28" width="6" height="14" rx="3" fill="var(--accent)" />
        <rect x="53" y="28" width="6" height="14" rx="3" fill="var(--accent)" />
        {/* head */}
        <rect x="10" y="15" width="44" height="40" rx="12" fill="url(#botHead)" />
        {/* face screen */}
        <rect x="16" y="22" width="32" height="24" rx="8" fill="#0b1020" />
        <g className="bot-eyes">
          <circle cx="25" cy="32" r="3.6" fill="#8fe3ff" />
          <circle cx="39" cy="32" r="3.6" fill="#8fe3ff" />
        </g>
        <path d="M25 40 Q32 44.5 39 40" stroke="#8fe3ff" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </svg>
    </span>
  );
}
