export default function Logo({ large = false }) {
  return (
    <div className={large ? "logo logo-lg" : "logo"}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#111" />
        <path d="M18 22h28M18 32h20M18 42h12" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />
        <circle cx="46" cy="42" r="6" fill="var(--accent)" />
      </svg>
      <span>StudySync</span>
    </div>
  );
}
