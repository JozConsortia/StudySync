"""Makes code in questions and answers consistent: fenced, cleanly indented and checkable.

The AI is asked to do all of this itself, but smaller models do not always follow formatting rules,
so the server enforces them. Nothing here ever executes code.
"""

import math
import re

FENCE = "`" * 3
CODE_BLOCK_RE = re.compile(r"```([^\n`]*)\n(.*?)```", re.S)
PYTHON_LANGS = {"python", "py", "python3"}

# Lines that are almost certainly code. Plain assignments ("x = 4") are deliberately not listed, so
# multi-line maths working is never mistaken for a program.
STRONG_CODE_RE = re.compile(
    r"^\s*("
    r"def \w+\s*\(|class \w+|import \w+|from [\w.]+ import |"
    r"(if|elif|while|for|with|try|except|else|finally)\b.*:\s*(#.*)?$|"
    r"return\b|print\s*\(|input\s*\(|"
    r"#include|public |private |static |void \w+\s*\(|function \w*\s*\(|const |let |var |"
    r"console\.log|System\.out|SELECT |INSERT |UPDATE |DELETE |CREATE TABLE"
    r")",
    re.I,
)


# Statements that are code when they sit next to clear code ("total = 0" just above a for loop), but
# would be ambiguous on their own (they also look like maths working).
WEAK_CODE_RE = re.compile(
    r"^\s*("
    r"[A-Za-z_][\w.\[\]'\"]*\s*(=|\+=|-=|\*=|/=|//=|%=)\s*\S.*|"
    r"[A-Za-z_][\w.]*\(.*\)\s*;?\s*"
    r")$"
)


def _is_code_line(line: str) -> bool:
    return bool(STRONG_CODE_RE.match(line) or WEAK_CODE_RE.match(line))


def unescape_newlines(text: str) -> str:
    """Repairs text whose line breaks arrived as literal backslash-n (the AI escaped them twice).

    Only applied when literal "\\n" sequences outnumber real line breaks, so a program that prints
    "\\n" inside a string (and so has real line breaks around it) is left alone.
    """
    if text.count("\\n") > text.count("\n"):
        return text.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\t", "    ").replace('\\"', '"')
    return text


def _guess_language(code: str) -> str:
    if re.search(r"^\s*#include", code, re.M):
        return "c"
    if re.search(r"\b(public|private|protected)\s+(static\s+)?[\w<>\[\]]+\s+\w+\s*\(|\bclass \w+\s*\{|System\.out", code):
        return "java"
    if re.search(r"^\s*(function \w*\(|const |let |var )|console\.log", code, re.M):
        return "javascript"
    if re.search(r"^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE)\b", code, re.M | re.I):
        return "sql"
    if re.search(r"^\s*(def |class |import |from \w+ import|print\(|for .+:|while .+:|if .+:)", code, re.M):
        return "python"
    return ""


def _is_indented(line: str) -> bool:
    return line.startswith(("  ", "\t"))


def wrap_bare_code(text: str) -> str:
    """Puts fences around runs of code lines in text that has none, e.g. a function pasted into a question."""
    if FENCE in text:
        return text
    lines = text.split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        if not (STRONG_CODE_RE.match(lines[i]) or _is_indented(lines[i])):
            out.append(lines[i])
            i += 1
            continue
        # Extend the run over code-like, indented and blank lines.
        j = i
        while j < len(lines) and (
            STRONG_CODE_RE.match(lines[j]) or _is_indented(lines[j]) or lines[j].strip() in ("", "}", "};")
        ):
            j += 1
        while j > i and not lines[j - 1].strip():  # leave trailing blank lines outside the block
            j -= 1
        run = lines[i:j]
        strong = sum(1 for ln in run if STRONG_CODE_RE.match(ln))
        if len([ln for ln in run if ln.strip()]) >= 2 and strong >= 1:
            # Pull in neighbouring statements such as "total = 0" before a loop or "main()" after it.
            while out and WEAK_CODE_RE.match(out[-1]):
                run.insert(0, out.pop())
            while j < len(lines) and _is_code_line(lines[j]):
                run.append(lines[j])
                j += 1
            code = "\n".join(run)
            out.append(f"{FENCE}{_guess_language(code)}\n{code}\n{FENCE}")
            i = j
        else:
            out.append(lines[i])
            i += 1
    return "\n".join(out)


def tidy_indentation(code: str) -> str:
    """Expands tabs, removes shared indentation and snaps uneven indents to whole levels (7 -> 8 spaces)."""
    lines = code.expandtabs(4).rstrip().split("\n")
    while lines and not lines[0].strip():
        lines.pop(0)
    indents = [len(ln) - len(ln.lstrip(" ")) for ln in lines if ln.strip()]
    if not indents:
        return ""
    base = min(indents)
    lines = [ln[base:] if ln.strip() else "" for ln in lines]
    steps = sorted({len(ln) - len(ln.lstrip(" ")) for ln in lines if ln.strip()} - {0})
    unit = 4 if not steps or steps[0] >= 3 else 2
    tidied = []
    for ln in lines:
        if not ln.strip():
            tidied.append("")
            continue
        indent = len(ln) - len(ln.lstrip(" "))
        tidied.append(" " * (round(indent / unit) * unit) + ln.lstrip(" ").rstrip())
    return "\n".join(tidied)


def expand_brace_code(line: str) -> str:
    """Lays out a one-line brace-language snippet (JavaScript, Java, C...) one statement per line.

    Splits after "{", ";" and around "}", ignoring anything inside strings and inside the
    parentheses of a for (...) header.
    """
    out, cur, depth, indent, quote = [], "", 0, 0, None

    def emit():
        nonlocal cur
        if cur.strip():
            out.append("    " * indent + cur.strip())
        cur = ""

    i = 0
    while i < len(line):
        ch = line[i]
        if quote:
            cur += ch
            if ch == "\\" and i + 1 < len(line):
                cur += line[i + 1]
                i += 1
            elif ch == quote:
                quote = None
        elif ch in "\"'`":
            quote = ch
            cur += ch
        elif ch == "(":
            depth += 1
            cur += ch
        elif ch == ")":
            depth = max(depth - 1, 0)
            cur += ch
        elif ch == "{" and depth == 0:
            cur = cur.rstrip() + " {"
            emit()
            indent += 1
        elif ch == "}" and depth == 0:
            emit()
            indent = max(indent - 1, 0)
            cur = "}"
            # Keep "} else {", "} catch (...) {", "});" together on the closing line.
            rest = line[i + 1 :].lstrip()
            if not re.match(r"(else|catch|finally|while)\b|[),;]", rest):
                emit()
        elif ch == ";" and depth == 0:
            cur += ";"
            emit()
        else:
            cur += ch
        i += 1
    emit()
    return "\n".join(out)


def _fix_squeezed_lines(text: str) -> str:
    """Expands long one-line brace-language code outside code blocks into a fenced, indented block."""
    if FENCE in text:
        return text
    lines = text.split("\n")
    for k, line in enumerate(lines):
        if len(line) > 50 and STRONG_CODE_RE.match(line) and "{" in line and ";" in line:
            code = expand_brace_code(line)
            lines[k] = f"{FENCE}{_guess_language(code)}\n{code}\n{FENCE}"
    return "\n".join(lines)


COMMENT_LINE_RE = re.compile(r"^\s*(#|//|--)")


def _absorb_trailing_code(text: str) -> str:
    """Moves comment and code lines that directly follow a code block into it, e.g.

        ```python                       ```python
        def f(x): ...                   def f(x): ...
        ```                      ->
        # Example usage:                # Example usage:
        print(f(3))                     print(f(3))
                                        ```
    """
    lines = text.split("\n")
    out: list[str] = []
    i, inside = 0, False
    while i < len(lines):
        line = lines[i]
        if line.strip().startswith(FENCE):
            if not inside:
                inside = True
                out.append(line)
                i += 1
                continue
            # Closing fence: look ahead for comment/code lines (blank lines allowed in between).
            j, tail = i + 1, []
            while j < len(lines) and (not lines[j].strip() or COMMENT_LINE_RE.match(lines[j]) or _is_code_line(lines[j])):
                tail.append(lines[j])
                j += 1
            while tail and not tail[-1].strip():
                tail.pop()
                j -= 1
            if any(t.strip() for t in tail):
                out.extend(tail)
                i = j
            out.append(line)
            inside = False
            i += 1
            continue
        out.append(line)
        i += 1
    return "\n".join(out)


def format_code(text: str) -> str:
    """Repairs escaped line breaks, fences bare code, then tidies the indentation inside every code block."""
    text = unescape_newlines(text or "")
    text = _fix_squeezed_lines(text)
    text = wrap_bare_code(text)
    text = _absorb_trailing_code(text)

    def tidy(m: re.Match) -> str:
        code = tidy_indentation(m.group(2))
        lang = m.group(1).strip() or _guess_language(code)  # label unlabelled blocks so they get checked
        return f"{FENCE}{lang}\n{code}\n{FENCE}"

    return CODE_BLOCK_RE.sub(tidy, text)


def code_blocks(text: str) -> list[tuple[str, str]]:
    return [(lang.strip().lower(), code) for lang, code in CODE_BLOCK_RE.findall(text or "")]


def python_syntax_error(text: str) -> str | None:
    """First syntax error in the text's Python code blocks, if any. The code is compiled, never run."""
    for lang, code in code_blocks(text):
        if lang not in PYTHON_LANGS:
            continue
        try:
            compile(code, "<answer>", "exec", dont_inherit=True)
        except SyntaxError as exc:
            where = f"line {exc.lineno}: {(exc.text or '').strip()}" if exc.lineno else "unknown line"
            return f"{exc.msg} ({where})"
    return None


OUTPUT_LANGS = ("", "text", "output", "console", "plaintext")


def _comment_markers(lang: str) -> tuple[str, ...]:
    if lang in PYTHON_LANGS or lang in ("ruby", "bash", "sh", "r"):
        return ("#",)
    if lang == "sql":
        return ("--",)
    return ("//",)


def strip_comments(code: str, lang: str) -> str:
    """The code with line comments removed (comment markers inside strings are kept)."""
    markers = _comment_markers(lang)
    out = []
    for line in code.split("\n"):
        quote, cut, i = None, len(line), 0
        while i < len(line):
            ch = line[i]
            if quote:
                if ch == "\\":
                    i += 1
                elif ch == quote:
                    quote = None
            elif ch in "\"'`":
                quote = ch
            elif any(line.startswith(m, i) for m in markers):
                cut = i
                break
            i += 1
        out.append(line[:cut])
    # Block comments in C-like languages.
    return re.sub(r"/\*.*?\*/", "", "\n".join(out), flags=re.S) if "//" in markers else "\n".join(out)


def same_code_ignoring_comments(original: str, commented: str, lang: str) -> bool:
    squash = lambda s: re.sub(r"\s+", "", strip_comments(s, lang))  # noqa: E731
    return squash(original) == squash(commented)


def has_comments(code: str, lang: str) -> bool:
    """True if the code is reasonably commented: about one comment for every three lines of code."""
    original = code.split("\n")
    stripped = strip_comments(code, lang).split("\n")
    code_lines = sum(1 for ln in stripped if ln.strip())
    commented = sum(1 for orig, bare in zip(original, stripped) if orig.strip() and orig.rstrip() != bare.rstrip())
    if lang not in PYTHON_LANGS:
        commented += len(re.findall(r"/\*", code))  # block comments
    return commented >= max(1, math.ceil(code_lines / 3))


def code_squeezed_on_one_line(text: str) -> bool:
    """True if the text has a long line of code that is not in a code block, e.g.
    "function f(n) { let r = 1; for (...) { r *= i; } return r; }"."""
    if code_blocks(text):
        return False
    return any(
        len(line) > 50 and STRONG_CODE_RE.match(line) and re.search(r"[{};]|:\s*\S", line)
        for line in text.split("\n")
    )


def program_without_comments(text: str) -> bool:
    """True if the text contains a program (2+ lines of code) that has no comments at all."""
    return any(
        len([ln for ln in code.split("\n") if ln.strip()]) >= 2 and not has_comments(code, lang)
        for lang, code in code_blocks(text)
        if lang not in OUTPUT_LANGS
    )
