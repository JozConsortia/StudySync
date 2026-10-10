import { useCallback, useEffect, useState } from "react";

// Dark is the default; the choice is remembered on this device.
const KEY = "studysync.theme";
const THEME_COLOR = { dark: "#000000", light: "#f4f5f8" };

export function savedTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    /* storage unavailable */
  }
  return "dark";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable */
  }
}

/** Returns [theme, toggleTheme]. */
export function useTheme() {
  const [theme, setTheme] = useState(savedTheme);
  useEffect(() => applyTheme(theme), [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return [theme, toggle];
}
