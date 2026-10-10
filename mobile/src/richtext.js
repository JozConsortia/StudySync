// Same parser as the web app (web/src/lib/richtext.js); keep the two in sync.
// Splits question and answer text into plain text and code blocks so code can be shown with its
// indentation. Code arrives in ```language fences from the server; code a student pastes into a typed
// question (without fences) is detected by the same rules the server uses.

const FENCE_RE = /```([^\n`]*)\n?([\s\S]*?)(?:```|$)/g;

// Lines that are almost certainly code. Plain assignments ("x = 4") are not listed, so maths working
// is never shown as code.
const STRONG_CODE_RE = new RegExp(
  "^\\s*(" +
    "def \\w+\\s*\\(|class \\w+|import \\w+|from [\\w.]+ import |" +
    "(if|elif|while|for|with|try|except|else|finally)\\b.*:\\s*(#.*)?$|" +
    "return\\b|print\\s*\\(|input\\s*\\(|" +
    "#include|public |private |static |void \\w+\\s*\\(|function \\w*\\s*\\(|const |let |var |" +
    "console\\.log|System\\.out|SELECT |INSERT |UPDATE |DELETE |CREATE TABLE" +
    ")",
  "i"
);

// Statements that count as code when they sit next to clear code ("total = 0" just above a loop).
const WEAK_CODE_RE = /^\s*([A-Za-z_][\w.[\]'"]*\s*(=|\+=|-=|\*=|\/=|\/\/=|%=)\s*\S.*|[A-Za-z_][\w.]*\(.*\)\s*;?\s*)$/;

const isIndented = (line) => line.startsWith("  ") || line.startsWith("\t");

function guessLanguage(code) {
  if (/^\s*#include/m.test(code)) return "c";
  if (/\b(public|private) (static )?(class|void)|System\.out/.test(code)) return "java";
  if (/^\s*(function \w*\(|const |let |var )|console\.log/m.test(code)) return "javascript";
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE)\b/im.test(code)) return "sql";
  if (/^\s*(def |class |import |from \w+ import|print\(|for .+:|while .+:|if .+:)/m.test(code)) return "python";
  return "";
}

function cleanCode(code) {
  const lines = code.replace(/\t/g, "    ").replace(/\s+$/, "").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  return lines.join("\n");
}

function pushText(out, text) {
  const lines = text.split("\n");
  let buffer = [];
  const flush = () => {
    const t = buffer.join("\n").replace(/^\n+|\n+$/g, "");
    if (t.trim()) out.push({ type: "text", content: t });
    buffer = [];
  };
  let i = 0;
  while (i < lines.length) {
    if (!(STRONG_CODE_RE.test(lines[i]) || isIndented(lines[i]))) {
      buffer.push(lines[i++]);
      continue;
    }
    let j = i;
    while (j < lines.length && (STRONG_CODE_RE.test(lines[j]) || isIndented(lines[j]) || ["", "}", "};"].includes(lines[j].trim()))) j++;
    while (j > i && !lines[j - 1].trim()) j--;
    const run = lines.slice(i, j);
    const strong = run.filter((l) => STRONG_CODE_RE.test(l)).length;
    if (run.filter((l) => l.trim()).length >= 2 && strong >= 1) {
      // Pull in neighbouring statements such as "total = 0" before a loop or "main()" after it.
      while (buffer.length && WEAK_CODE_RE.test(buffer[buffer.length - 1])) run.unshift(buffer.pop());
      while (j < lines.length && (STRONG_CODE_RE.test(lines[j]) || WEAK_CODE_RE.test(lines[j]))) run.push(lines[j++]);
      flush();
      const code = run.join("\n");
      out.push({ type: "code", lang: guessLanguage(code), content: cleanCode(code) });
      i = j;
    } else {
      buffer.push(lines[i++]);
    }
  }
  flush();
}

/** Returns [{ type: "text", content }, { type: "code", lang, content }, ...]. */
export function parseRichText(text) {
  const s = String(text ?? "").replace(/\r\n/g, "\n");
  const out = [];
  let last = 0;
  FENCE_RE.lastIndex = 0;
  let m;
  while ((m = FENCE_RE.exec(s)) && m[0].length) {
    if (m.index > last) pushText(out, s.slice(last, m.index));
    const content = cleanCode(m[2]);
    if (content.trim()) out.push({ type: "code", lang: m[1].trim().toLowerCase(), content });
    last = FENCE_RE.lastIndex;
  }
  if (last < s.length) pushText(out, s.slice(last));
  return out;
}

const HASH_COMMENT_LANGS = new Set(["python", "py", "python3", "ruby", "bash", "sh", "shell", "r", "perl", "yaml", "powershell"]);
const SLASH_COMMENT_LANGS = new Set(["javascript", "js", "typescript", "ts", "java", "c", "cpp", "c++", "csharp", "cs", "c#", "go", "kotlin", "swift", "php", "rust", "dart", "scala"]);

/** Splits one line of code into [code, comment] so comments can be shown in a different colour. */
export function splitComment(line, lang) {
  const markers = HASH_COMMENT_LANGS.has(lang)
    ? ["#"]
    : SLASH_COMMENT_LANGS.has(lang)
      ? ["//"]
      : lang === "sql"
        ? ["--"]
        : ["#", "//"];
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    for (const mk of markers) {
      if (line.startsWith(mk, i) && !(mk === "#" && lang === "c" && /^\s*$/.test(line.slice(0, i)))) {
        return [line.slice(0, i), line.slice(i)];
      }
    }
  }
  return [line, ""];
}

/** Display name for a code block's language label. */
export function languageLabel(lang) {
  const names = { py: "Python", python: "Python", python3: "Python", js: "JavaScript", javascript: "JavaScript", ts: "TypeScript", typescript: "TypeScript", java: "Java", c: "C", cpp: "C++", "c++": "C++", cs: "C#", csharp: "C#", sql: "SQL", html: "HTML", css: "CSS", bash: "Shell", sh: "Shell", text: "Output", output: "Output", console: "Output", pseudocode: "Pseudocode" };
  return names[lang] || (lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : "Code");
}

/** One-line summary of a question for lists: code fences removed, whitespace collapsed. */
export function summarize(text) {
  return String(text ?? "")
    .replace(/```[^\n]*\n?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
