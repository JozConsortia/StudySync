import json
import re

import httpx
from google import genai
from google.genai import errors, types

from .. import config
from ..errors import ApiError
from . import codefmt

_client: genai.Client | None = None


def _gemini() -> genai.Client:
    global _client
    if not config.AI_CONFIGURED:
        raise ApiError(503, "The server is missing a Google Gemini API key. Set GEMINI_API_KEY in server/.env.")
    if _client is None:
        _client = genai.Client(
            api_key=config.GEMINI_API_KEY,
            http_options=types.HttpOptions(timeout=config.AI_TIMEOUT_SECONDS * 1000),  # milliseconds
        )
    return _client


def _api_error(exc: errors.APIError) -> ApiError:
    """Turns a Gemini API error into a message a student can understand."""
    message = (exc.message or "").lower()
    status = (exc.status or "").upper()
    if exc.code in (401, 403) or "api key" in message or status in ("UNAUTHENTICATED", "PERMISSION_DENIED"):
        return ApiError(503, "The server's Google Gemini API key is invalid or not allowed to use this model.")
    if exc.code == 404:
        return ApiError(503, f'The Gemini model "{config.GEMINI_MODEL}" is not available. Change GEMINI_MODEL in server/.env.')
    if exc.code == 429 or status == "RESOURCE_EXHAUSTED":
        return ApiError(429, "The AI service's usage limit has been reached. Please wait a minute and try again.")
    if isinstance(exc, errors.ServerError):
        return ApiError(502, "The AI service is temporarily unavailable. Please try again.")
    return ApiError(502, "The AI service returned an error. Please try again.")


def _generate_json(system: str, user: str, schema: dict, temperature: float = 0.2) -> dict:
    try:
        res = _gemini().models.generate_content(
            model=config.GEMINI_MODEL,
            contents=user,
            config=types.GenerateContentConfig(
                system_instruction=system,
                temperature=temperature,
                response_mime_type="application/json",
                response_json_schema=schema,
            ),
        )
    except errors.APIError as exc:
        config.log.error("Gemini error %s %s: %s", exc.code, exc.status, exc.message)
        raise _api_error(exc) from exc
    except httpx.TimeoutException as exc:
        config.log.error("Gemini request timed out after %ss", config.AI_TIMEOUT_SECONDS)
        raise ApiError(504, "The AI took too long to answer. Please try again.") from exc
    except httpx.TransportError as exc:
        config.log.error("Could not reach Gemini: %s", exc)
        raise ApiError(502, "Could not reach the AI service. Check the server's internet connection.") from exc

    text = res.text
    if not text:
        # Usually a safety block or an empty response.
        raise ApiError(502, "The AI could not produce an answer for this. Try rewording the question.")
    try:
        return json.loads(text)
    except ValueError as exc:
        raise ApiError(502, "The AI returned an unreadable response. Please try again.") from exc


TRANSCRIBE_PROMPT = """Transcribe this recording of a student asking a study question.
Write exactly what they ask, as clean text: fix filler words ("um", "uh") and false starts, but do not
answer the question or add anything. Write maths in readable plain text (e.g. "x squared" -> x^2,
"square root of two" -> sqrt(2)) and keep numbers as digits. If the student dictates code, write it
as code with line breaks and indentation. If nothing intelligible is said, return an empty string."""


def transcribe_audio(data: bytes, mime_type: str) -> str:
    """Turns a spoken question into text with Gemini."""
    try:
        res = _gemini().models.generate_content(
            model=config.GEMINI_MODEL,
            contents=[types.Part.from_bytes(data=data, mime_type=mime_type), TRANSCRIBE_PROMPT],
            config=types.GenerateContentConfig(temperature=0),
        )
    except errors.APIError as exc:
        config.log.error("Gemini transcription error %s %s: %s", exc.code, exc.status, exc.message)
        if exc.code == 400 and "audio" in (exc.message or "").lower():
            raise ApiError(400, "This recording format could not be read. Please try again.") from exc
        raise _api_error(exc) from exc
    except httpx.TimeoutException as exc:
        raise ApiError(504, "The AI took too long to listen to the recording. Please try again.") from exc
    except httpx.TransportError as exc:
        raise ApiError(502, "Could not reach the AI service. Check the server's internet connection.") from exc

    text = (res.text or "").strip()
    # Models occasionally wrap the transcript in quotes or a code fence; remove that.
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        text = text[1:-1].strip()
    # Filler words the model sometimes keeps ("And uh explain..." -> "And explain...").
    text = re.sub(r"\b(?:um+|uh+|erm+|hmm+)\b[,.…!]*\s*", "", text, flags=re.I)
    text = re.sub(r"\s{2,}", " ", text).strip()
    text = text[:1].upper() + text[1:]
    return codefmt.unescape_newlines(text)


SPLIT_PROMPT = """You receive raw OCR text from an examination paper. The text may contain noise,
broken lines, headers, footers, page numbers and instructions to candidates.

Identify every individual question a student must answer. Keep sub-questions (e.g. 1.1, 1.2, (a), (b))
as separate entries. Fix obvious OCR errors, keep mathematical notation readable, and keep mark
allocations if present. Ignore cover-page instructions.

Each question is later solved ON ITS OWN, without the rest of the paper, so every question's text must
be self-contained:
- Include any shared context (a passage, scenario, table, diagram description or data) in each
  sub-question that uses it.
- When a sub-question refers back to something given earlier ("the block", "the same car", "the
  function above", "use your answer to 1.1"), copy the relevant given information from the earlier
  question into this one. For example, if 1.1 says "A 2 kg block is pushed by a 10 N force. Calculate
  its acceleration." and 1.2 says "Calculate the velocity of the block after 3 s if it starts from rest.",
  then 1.2 must read "A 2 kg block is pushed by a 10 N force. Calculate the velocity of the block after
  3 s if it starts from rest."
- Never add information that is not on the paper.

Code and multi-line content:
- Keep line breaks wherever layout matters: code, pseudocode, program output, tables, lists and
  multi-line working.
- Put code, pseudocode and program output in a fenced block that names the language, for example
  ```python ... ```. Use correct, consistent indentation of 4 spaces per level.
- The text you receive keeps each line's original indentation as leading spaces. Use it, together with
  the code's structure (blocks after if/for/while/def/class, braces), to repair any indentation the OCR
  got wrong. Do not otherwise change the code, apart from fixing obvious OCR misreads.

Return a title for the paper, its subject, and the list of questions."""

SPLIT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "subject": {"type": "string"},
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "number": {"type": "string"},
                    "text": {"type": "string"},
                    "marks": {"type": ["number", "null"]},
                },
                "required": ["number", "text"],
            },
        },
    },
    "required": ["title", "subject", "questions"],
}


def _number_or_none(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def split_questions(raw_text: str) -> dict:
    data = _generate_json(SPLIT_PROMPT, raw_text[:60000], SPLIT_SCHEMA, temperature=0)
    questions = data.get("questions") if isinstance(data.get("questions"), list) else []
    cleaned = [q for q in questions if isinstance(q, dict) and str(q.get("text") or "").strip()]
    return {
        "title": str(data.get("title") or "Examination paper"),
        "subject": str(data.get("subject") or ""),
        "questions": [
            {
                "id": f"q{i + 1}",
                "number": str(q.get("number") or i + 1),
                "text": codefmt.format_code(str(q["text"]).strip()),
                "marks": _number_or_none(q.get("marks")),
            }
            for i, q in enumerate(cleaned)
        ],
    }


SOLVE_PROMPT = """You are StudySync, a patient and accurate tutor. Solve the exam question you are given.
Teach, do not just answer: show the reasoning a student needs to reproduce the answer in an exam.
Use plain text; write maths inline in readable form (e.g. x^2 + 3x - 4 = 0, sqrt(2), 3/4).
If the question is ambiguous or missing information (often due to OCR), state your assumption.

Return:
- answer: the final answer, concise
- steps: the ordered step-by-step working, each with a short title and a detailed explanation
- explanation: the underlying concept in 2-5 sentences
- tips: 0-3 common mistakes or exam tips

Formatting:
- Use line breaks wherever they make the answer easier to read: lists, multi-line working, tables.
- Put every piece of code, pseudocode or program output in a fenced block that names the language, for
  example ```python ... ```. Indent with 4 spaces per level, never tabs, and never squeeze code onto
  one line.

Programming questions (writing, completing, fixing or explaining code):
- answer: the complete, working solution as ONE code block, not fragments. Use the language the
  question uses (Python if none is given) and only its standard library unless the question allows
  otherwise. Add comments in the code that explain what each part does and why, written for a student.
- steps: explain how the solution is built, in order. Short code excerpts in fenced blocks are welcome.
- explanation: the idea behind the solution, then "Example:" with a sample input and, in a code block,
  the exact output the code produces for it.
- Before answering, trace the code line by line with that sample input to make sure it runs without
  errors and gives the right result. Fix anything that would fail.
- If the question asks what some code outputs or does, trace it step by step and give the exact output
  in a code block."""

SOLVE_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "steps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"title": {"type": "string"}, "detail": {"type": "string"}},
                "required": ["title", "detail"],
            },
        },
        "explanation": {"type": "string"},
        "tips": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["answer", "steps", "explanation", "tips"],
}


def _code_problems(answer: str) -> list[str]:
    """Problems with the code in an (already formatted) answer that need the AI to try again."""
    error = codefmt.python_syntax_error(answer)
    return [f"the Python code has a syntax error: {error}"] if error else []


COMMENT_PROMPT = """You add explanatory comments to code for students.
Return exactly the code you are given, with comments added that explain what each part does and why.
Put a comment above each function, loop and decision, and beside lines that are not obvious.
Do not change, reorder, rename or reformat any code; only add comments. Keep the indentation."""

COMMENT_SCHEMA = {"type": "object", "properties": {"code": {"type": "string"}}, "required": ["code"]}


def _add_missing_comments(answer: str) -> str:
    """Adds comments to any program in the answer that has none, without changing the code itself."""

    def comment(m) -> str:
        lang, code = m.group(1).strip().lower(), m.group(2)
        lines = [ln for ln in code.split("\n") if ln.strip()]
        if lang in codefmt.OUTPUT_LANGS or len(lines) < 2 or codefmt.has_comments(code, lang):
            return m.group(0)
        try:
            block = f"Language: {lang}\n{codefmt.FENCE}{lang}\n{code}\n{codefmt.FENCE}"
            result = _generate_json(COMMENT_PROMPT, block, COMMENT_SCHEMA, temperature=0)
        except ApiError:
            return m.group(0)  # comments are a nice-to-have; keep the working code
        commented = codefmt.tidy_indentation(codefmt.unescape_newlines(str(result.get("code") or "")))
        commented = codefmt.CODE_BLOCK_RE.sub(lambda b: b.group(2), commented).strip("`\n")
        # Only accept it if the code is unchanged apart from comments, and Python still compiles.
        if not codefmt.same_code_ignoring_comments(code, commented, lang):
            config.log.info("Commented code differed from the original; keeping the original")
            return m.group(0)
        if lang in codefmt.PYTHON_LANGS and codefmt.python_syntax_error(f"{codefmt.FENCE}python\n{commented}\n{codefmt.FENCE}"):
            return m.group(0)
        return f"{codefmt.FENCE}{lang}\n{commented}\n{codefmt.FENCE}"

    return codefmt.CODE_BLOCK_RE.sub(comment, answer)


def solve_question(text: str, subject: str = "", marks=None, context: str = "") -> dict:
    parts = []
    if subject:
        parts.append(f"Subject: {subject}")
    if marks:
        parts.append(f"Marks: {marks:g}")
    if context:
        # Earlier questions from the same section, so references like "the block" or "your answer to 1.1" make sense.
        parts.append(
            "Earlier questions in the same section (background only; use any information they give, "
            f"but answer only the final question):\n{context}"
        )
    parts.append(f"Question:\n{text}")

    prompt = "\n".join(parts)
    data = _generate_json(SOLVE_PROMPT, prompt, SOLVE_SCHEMA)

    # Code in the answer is formatted by the server (fenced, one statement per line, 4-space indentation),
    # Python is compiled (never run) and, if it would not run, the AI gets one more attempt with the error.
    answer = codefmt.format_code(str(data.get("answer") or ""))
    problems = _code_problems(answer)
    if problems:
        config.log.info("Answer code needs fixing: %s", "; ".join(problems))
        retry = (
            f"{prompt}\n\nYour previous answer was:\n{json.dumps(data)}\n\n"
            f"Problems with it: {'; '.join(problems)}. Return the complete solution again with these fixed. "
            "Keep all code in fenced blocks with 4-space indentation."
        )
        fixed = _generate_json(SOLVE_PROMPT, retry, SOLVE_SCHEMA)
        fixed_answer = codefmt.format_code(str(fixed.get("answer") or ""))
        if not _code_problems(fixed_answer):
            data, answer = fixed, fixed_answer
    # Programs without comments get them added (code unchanged; checked before it is accepted).
    answer = _add_missing_comments(answer)

    fmt = codefmt.format_code
    steps = data.get("steps") if isinstance(data.get("steps"), list) else []
    tips = data.get("tips") if isinstance(data.get("tips"), list) else []
    return {
        "answer": answer,
        "steps": [
            {
                "title": str((s or {}).get("title") or f"Step {i + 1}") if isinstance(s, dict) else f"Step {i + 1}",
                "detail": fmt(str(s.get("detail") or "") if isinstance(s, dict) else str(s)),
            }
            for i, s in enumerate(steps)
        ],
        "explanation": fmt(str(data.get("explanation") or "")),
        "tips": [str(t) for t in tips],
    }
