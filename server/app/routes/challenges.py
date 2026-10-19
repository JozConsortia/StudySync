import threading
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from .. import db
from ..errors import ApiError
from ..security import current_user_id
from ..services import challenges

router = APIRouter(prefix="/api/challenges")

# One generation at a time per user, so two devices opening the app together don't both ask the AI.
_locks: dict[int, threading.Lock] = {}
_locks_guard = threading.Lock()


def _user_lock(user_id: int) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(user_id, threading.Lock())


def _parse_day(value: str | None) -> date:
    """The student's local date. Time zones differ from UTC by at most a day, so allow one day either side."""
    today = datetime.now(timezone.utc).date()
    if not value:
        return today
    try:
        day = date.fromisoformat(value)
    except ValueError as exc:
        raise ApiError(400, "Invalid date.") from exc
    if abs((day - today).days) > 1:
        raise ApiError(400, "Challenges are only available for today.")
    return day


def _response(user_id: int, row: dict, day: date) -> dict:
    return {"challenge": challenges.public_challenge(row), "stats": challenges.stats(db.challenge_history(user_id), day)}


@router.get("/today")
def today(day: str | None = Query(None, max_length=10), user_id: int = Depends(current_user_id)):
    """Today's challenges (created the first time they are opened), with the student's stats."""
    d = _parse_day(day)
    row = db.get_challenge(user_id, d)
    if not row:
        with _user_lock(user_id):
            row = db.get_challenge(user_id, d)
            if not row:
                difficulty = challenges.pick_difficulty(db.challenge_history(user_id))
                subjects, titles = db.recent_study_topics(user_id)
                recent = db.recent_challenge_questions(user_id, d)
                items = challenges.generate(d, difficulty, subjects, titles, recent)
                db.insert_challenge(user_id, d, difficulty, items)
                row = db.get_challenge(user_id, d)
    return _response(user_id, row, d)


@router.get("/stats")
def stats(day: str | None = Query(None, max_length=10), user_id: int = Depends(current_user_id)):
    d = _parse_day(day)
    return {"stats": challenges.stats(db.challenge_history(user_id), d)}


class AnswerBody(BaseModel):
    itemId: str = Field(min_length=1, max_length=10)
    choice: int | None = Field(None, ge=0, le=3)  # multiple choice
    answer: str = Field("", max_length=4000)  # short answer


@router.post("/{day}/answer")
def answer(day: str, body: AnswerBody, user_id: int = Depends(current_user_id)):
    """Marks one challenge. The first answer counts; answering again returns the saved result."""
    d = _parse_day(day)
    row = db.get_challenge(user_id, d)
    if not row:
        raise ApiError(404, "These challenges are no longer available.")
    item = next((i for i in row["items"] if i["id"] == body.itemId), None)
    if not item:
        raise ApiError(404, "Challenge not found.")
    if body.itemId in row["results"]:
        return _response(user_id, row, d)

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if item["type"] == "mcq":
        if body.choice is None:
            raise ApiError(400, "Choose an answer first.")
        correct = body.choice == item["answerIndex"]
        result = {"choice": body.choice, "correct": correct, "score": item["points"] if correct else 0, "answeredAt": now}
    else:
        text = body.answer.strip()
        if not text:
            raise ApiError(400, "Type your answer first.")
        result = {"answer": text, **challenges.grade_short(item, text), "answeredAt": now}
        result["correct"] = result["verdict"] == "correct"

    row = db.record_challenge_result(user_id, d, body.itemId, result)
    return _response(user_id, row, d)
