import { parseRichText } from "./richtext.js";

const INDENT = "    ";

/**
 * Tab / Shift+Tab in a textarea indents / outdents the current line(s) by 4 spaces instead of moving
 * focus, so students can type or correct code with proper indentation.
 * Call from onKeyDown; `setValue` receives the new text.
 */
export function handleIndentKey(e, setValue) {
  if (e.key !== "Tab" || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  const el = e.currentTarget;
  const { value, selectionStart: start, selectionEnd: end } = el;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;

  let next, selStart, selEnd;
  if (!e.shiftKey && start === end) {
    next = value.slice(0, start) + INDENT + value.slice(end);
    selStart = selEnd = start + INDENT.length;
  } else {
    const block = value.slice(lineStart, end);
    const lines = block.split("\n");
    const changed = lines.map((ln) => (e.shiftKey ? ln.replace(/^ {1,4}/, "") : INDENT + ln));
    next = value.slice(0, lineStart) + changed.join("\n") + value.slice(end);
    const firstDelta = changed[0].length - lines[0].length;
    selStart = Math.max(lineStart, start + firstDelta);
    selEnd = end + (changed.join("\n").length - block.length);
  }
  setValue(next);
  requestAnimationFrame(() => el.setSelectionRange(selStart, selEnd));
}

/** True when the text contains code, so its editor can switch to a monospace font. */
export function looksLikeCode(text) {
  return parseRichText(text).some((p) => p.type === "code");
}
