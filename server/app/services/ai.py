import json

import openai

from .. import config
from ..errors import ApiError

_client: openai.OpenAI | None = None


def _openai() -> openai.OpenAI:
    global _client
    if not config.OPENAI_CONFIGURED:
        raise ApiError(503, "The server is missing an OpenAI API key. Set OPENAI_API_KEY in server/.env.")
    if _client is None:
        _client = openai.OpenAI(api_key=config.OPENAI_API_KEY)
    return _client


def _chat_json(system: str, user: str, temperature: float = 0.2) -> dict:
    try:
        res = _openai().chat.completions.create(
            model=config.OPENAI_MODEL,
            temperature=temperature,
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        )
    except openai.AuthenticationError as exc:
        raise ApiError(503, "The server's OpenAI API key is invalid.") from exc
    except openai.RateLimitError as exc:
        if exc.code in ("insufficient_quota", "credit_balance_exhausted") or getattr(exc, "type", None) == "insufficient_quota":
            config.log.error("OpenAI account has no credit: %s", exc)
            raise ApiError(503, "The AI service is unavailable: the server's OpenAI account has run out of credit.") from exc
        raise ApiError(429, "The AI service is busy. Please try again in a moment.") from exc
    except openai.OpenAIError as exc:
        config.log.error("OpenAI error: %s", exc)
        raise ApiError(502, "The AI service returned an error. Please try again.") from exc

    try:
        return json.loads(res.choices[0].message.content)
    except (TypeError, ValueError) as exc:
        raise ApiError(502, "The AI returned an unreadable response. Please try again.") from exc


SPLIT_PROMPT = """You receive raw OCR text from an examination paper. The text may contain noise,
broken lines, headers, footers, page numbers and instructions to candidates.

Identify every individual question a student must answer. Keep sub-questions (e.g. 1.1, 1.2, (a), (b))
as separate entries and include any shared context (a passage, scenario, table or data) inside each
sub-question's text so it can be answered on its own. Fix obvious OCR errors, keep mathematical notation
readable, and keep mark allocations if present. Ignore cover-page instructions.

Respond with JSON: {"title": string, "subject": string, "questions": [{"number": string, "text": string, "marks": number | null}]}"""


def _number_or_none(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def split_questions(raw_text: str) -> dict:
    data = _chat_json(SPLIT_PROMPT, raw_text[:60000], temperature=0)
    questions = data.get("questions") if isinstance(data.get("questions"), list) else []
    cleaned = [q for q in questions if isinstance(q, dict) and str(q.get("text") or "").strip()]
    return {
        "title": str(data.get("title") or "Examination paper"),
        "subject": str(data.get("subject") or ""),
        "questions": [
            {
                "id": f"q{i + 1}",
                "number": str(q.get("number") or i + 1),
                "text": str(q["text"]).strip(),
                "marks": _number_or_none(q.get("marks")),
            }
            for i, q in enumerate(cleaned)
        ],
    }


SOLVE_PROMPT = """You are StudySync, a patient and accurate tutor. Solve the exam question you are given.
Teach, do not just answer: show the reasoning a student needs to reproduce the answer in an exam.
Use plain text; write maths inline in readable form (e.g. x^2 + 3x - 4 = 0, sqrt(2), 3/4).
If the question is ambiguous or missing information (often due to OCR), state your assumption.

Respond with JSON:
{"answer": string (the final answer, concise),
 "steps": [{"title": string, "detail": string}] (ordered step-by-step working),
 "explanation": string (the underlying concept in 2-5 sentences),
 "tips": [string] (common mistakes or exam tips, 0-3 items)}"""


def solve_question(text: str, subject: str = "", marks=None) -> dict:
    parts = []
    if subject:
        parts.append(f"Subject: {subject}")
    if marks:
        parts.append(f"Marks: {marks:g}")
    parts.append(f"Question:\n{text}")

    data = _chat_json(SOLVE_PROMPT, "\n".join(parts))
    steps = data.get("steps") if isinstance(data.get("steps"), list) else []
    tips = data.get("tips") if isinstance(data.get("tips"), list) else []
    return {
        "answer": str(data.get("answer") or ""),
        "steps": [
            {
                "title": str((s or {}).get("title") or f"Step {i + 1}") if isinstance(s, dict) else f"Step {i + 1}",
                "detail": str(s.get("detail") or "") if isinstance(s, dict) else str(s),
            }
            for i, s in enumerate(steps)
        ],
        "explanation": str(data.get("explanation") or ""),
        "tips": [str(t) for t in tips],
    }
