"""Daily challenges: five short educational challenges a day, rated when answered.

Three are multiple choice (marked instantly) and two need a short written answer (marked by the AI with a
score out of 10 and feedback). Questions follow the subjects the student has been studying, and get harder
or easier with their recent results. Points become XP; finishing every challenge keeps a daily streak going.
"""

import random
from datetime import date, timedelta

from ..errors import ApiError
from . import codefmt
from .ai import _generate_json

POINTS = 10
MCQ_COUNT = 3
SHORT_COUNT = 2
XP_PER_LEVEL = 100
DEFAULT_SUBJECTS = ["Mathematics", "Physical Sciences", "Life Sciences", "English", "Geography", "Computer Programming"]

GENERATE_PROMPT = f"""You create a student's daily learning challenges for StudySync, a study app for high-school and
first-year university students. Make exactly {MCQ_COUNT + SHORT_COUNT} challenges:
- {MCQ_COUNT} multiple-choice challenges ("mcq") with exactly 4 options, one correct, and plausible wrong options
  that reflect common mistakes.
- {SHORT_COUNT} short-answer challenges ("short") that can be answered in one to four sentences or a short
  calculation, with a model answer and the key points a good answer must contain.

Rules:
- Spread them across the student's subjects; use at least two different subjects.
- Each challenge must stand on its own (no diagrams or images), be answerable in one to three minutes, and test
  understanding, not trivia. Prefer real-world situations and worked numbers that make students think.
- Match the requested difficulty.
- Never repeat or closely copy any of the recent questions you are given.
- Give each a short, catchy title (2-5 words) and the topic it tests.
- For mcq, "explanation" says why the correct option is right and why the most tempting wrong one is wrong.
- Write maths inline in readable plain text (e.g. x^2 + 3x - 4 = 0, sqrt(2), 3/4). Put any code in a fenced block
  that names the language."""

CHALLENGE_SCHEMA = {
    "type": "object",
    "properties": {
        "challenges": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": ["mcq", "short"]},
                    "subject": {"type": "string"},
                    "topic": {"type": "string"},
                    "title": {"type": "string"},
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "answerIndex": {"type": ["integer", "null"]},
                    "explanation": {"type": "string"},
                    "modelAnswer": {"type": "string"},
                    "keyPoints": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["type", "subject", "topic", "title", "question", "explanation"],
            },
        }
    },
    "required": ["challenges"],
}

GRADE_PROMPT = """You mark a student's short answer to a learning challenge. Be fair, accurate and encouraging.
Give a score from 0 to 10 using the model answer and key points: full marks for a correct, complete answer in the
student's own words (wording does not need to match); partial marks for partly correct answers; 0 for blank,
off-topic or wrong answers. Ignore spelling and grammar unless they change the meaning.
verdict: "correct" (8-10), "partly" (3-7) or "incorrect" (0-2).
feedback: two or three short sentences to the student ("you"): what they got right, then what was missing or wrong
and how to fix it."""

GRADE_SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "integer"},
        "verdict": {"type": "string", "enum": ["correct", "partly", "incorrect"]},
        "feedback": {"type": "string"},
    },
    "required": ["score", "verdict", "feedback"],
}


def pick_difficulty(history: list[dict]) -> str:
    """Harder after strong days, easier after weak ones (based on the last three finished days)."""
    finished = [h for h in history if h["completed"] and h["maxScore"]][:3]
    if not finished:
        return "medium"
    average = sum(h["score"] / h["maxScore"] for h in finished) / len(finished)
    return "hard" if average >= 0.8 else "easy" if average < 0.5 else "medium"


def generate(day: date, difficulty: str, subjects: list[str], titles: list[str], recent: list[str]) -> list[dict]:
    parts = [
        f"Date: {day.isoformat()}",
        f"Difficulty: {difficulty}",
        f"Student's subjects: {', '.join(subjects or DEFAULT_SUBJECTS)}",
    ]
    if titles:
        parts.append("Papers and questions they studied recently: " + "; ".join(titles))
    if recent:
        parts.append("Recent questions (do not repeat):\n- " + "\n- ".join(recent))
    data = _generate_json(GENERATE_PROMPT, "\n".join(parts), CHALLENGE_SCHEMA, temperature=0.9)

    mcqs, shorts = [], []
    for c in data.get("challenges") or []:
        if not isinstance(c, dict) or not str(c.get("question") or "").strip():
            continue
        base = {
            "subject": str(c.get("subject") or "General")[:60],
            "topic": str(c.get("topic") or "")[:80],
            "title": str(c.get("title") or "Challenge")[:60],
            "question": codefmt.format_code(str(c["question"]).strip()),
            "explanation": codefmt.format_code(str(c.get("explanation") or "").strip()),
            "points": POINTS,
        }
        options = [str(o).strip() for o in (c.get("options") or []) if str(o).strip()]
        index = c.get("answerIndex")
        if c.get("type") == "mcq" and len(options) == 4 and isinstance(index, int) and 0 <= index < 4:
            # Shuffle, because models tend to put the right answer in the same place.
            correct = options[index]
            random.shuffle(options)
            mcqs.append({**base, "type": "mcq", "options": options, "answerIndex": options.index(correct)})
        elif c.get("type") == "short" and str(c.get("modelAnswer") or "").strip():
            shorts.append({
                **base,
                "type": "short",
                "modelAnswer": codefmt.format_code(str(c["modelAnswer"]).strip()),
                "keyPoints": [str(k) for k in (c.get("keyPoints") or [])][:6],
            })

    items = mcqs[:MCQ_COUNT] + shorts[:SHORT_COUNT]
    if len(items) < 3:
        raise ApiError(502, "Today's challenges could not be created. Please try again.")
    for i, item in enumerate(items):
        item["id"] = f"c{i + 1}"
    return items


def grade_short(item: dict, answer: str) -> dict:
    prompt = (
        f"Challenge: {item['question']}\n\nModel answer: {item.get('modelAnswer', '')}\n\n"
        f"Key points: {'; '.join(item.get('keyPoints') or [])}\n\nStudent's answer:\n{answer}"
    )
    data = _generate_json(GRADE_PROMPT, prompt, GRADE_SCHEMA, temperature=0)
    score = data.get("score")
    score = max(0, min(10, int(score))) if isinstance(score, (int, float)) else 0
    verdict = data.get("verdict") if data.get("verdict") in ("correct", "partly", "incorrect") else (
        "correct" if score >= 8 else "partly" if score >= 3 else "incorrect"
    )
    return {"score": round(score * item["points"] / 10), "outOf10": score, "verdict": verdict, "feedback": str(data.get("feedback") or "")}


def rating(score: int, max_score: int) -> dict:
    """The day's rating: 1-5 stars with a label."""
    pct = score / max_score if max_score else 0
    for stars, cutoff, label in (
        (5, 0.9, "Outstanding!"),
        (4, 0.75, "Great work!"),
        (3, 0.55, "Good effort"),
        (2, 0.35, "Keep practising"),
        (1, 0.0, "Every expert started here"),
    ):
        if pct >= cutoff:
            return {"stars": stars, "label": label, "percent": round(pct * 100)}
    return {"stars": 1, "label": "Every expert started here", "percent": 0}


def public_challenge(row: dict) -> dict:
    """What the app may see: answers and explanations only for challenges already answered."""
    results = row["results"]
    items = []
    for item in row["items"]:
        out = {k: item[k] for k in ("id", "type", "subject", "topic", "title", "question", "points") if k in item}
        if item["type"] == "mcq":
            out["options"] = item["options"]
        result = results.get(item["id"])
        if result:
            out["result"] = result
            out["explanation"] = item.get("explanation", "")
            if item["type"] == "mcq":
                out["answerIndex"] = item["answerIndex"]
            else:
                out["modelAnswer"] = item.get("modelAnswer", "")
        items.append(out)
    done = row["completedAt"] is not None
    return {
        "day": row["day"],
        "difficulty": row["difficulty"],
        "items": items,
        "answered": len(results),
        "score": row["score"],
        "maxScore": row["maxScore"],
        "completed": done,
        "rating": rating(row["score"], row["maxScore"]) if done else None,
    }


def stats(history: list[dict], today: date) -> dict:
    """XP, level, streaks and the last 7 days' ratings."""
    xp = sum(h["score"] for h in history)
    completed = {h["day"] for h in history if h["completed"]}

    # The streak is still alive if today is not finished yet but yesterday was.
    streak, d = 0, today if today in completed else today - timedelta(days=1)
    while d in completed:
        streak += 1
        d -= timedelta(days=1)

    best, run, prev = 0, 0, None
    for d in sorted(completed):
        run = run + 1 if prev and d - prev == timedelta(days=1) else 1
        best, prev = max(best, run), d

    by_day = {h["day"]: h for h in history}
    week = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        h = by_day.get(d)
        week.append({
            "day": d.isoformat(),
            "score": h["score"] if h else 0,
            "maxScore": h["maxScore"] if h else 0,
            "completed": bool(h and h["completed"]),
            "stars": rating(h["score"], h["maxScore"])["stars"] if h and h["completed"] else 0,
        })

    return {
        "xp": xp,
        "level": xp // XP_PER_LEVEL + 1,
        "levelXp": xp % XP_PER_LEVEL,
        "xpPerLevel": XP_PER_LEVEL,
        "streak": streak,
        "bestStreak": best,
        "daysCompleted": len(completed),
        "week": week,
    }
