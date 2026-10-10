import { Moon, Sun } from "lucide-react";

export default function ThemeToggle({ theme, onToggle, className = "" }) {
  const toLight = theme === "dark";
  return (
    <button
      type="button"
      className={`icon-btn theme-toggle ${className}`}
      onClick={onToggle}
      title={toLight ? "Switch to bright mode" : "Switch to dark mode"}
      aria-label={toLight ? "Switch to bright mode" : "Switch to dark mode"}
    >
      {toLight ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
