import json
from contextlib import contextmanager
from datetime import datetime, timezone

import pymysql
from pymysql.cursors import DictCursor

from . import config
from .errors import ApiError

MAX_HISTORY_SESSIONS = 100


@contextmanager
def connect():
    try:
        conn = pymysql.connect(
            **config.DB,
            cursorclass=DictCursor,
            charset="utf8mb4",
            autocommit=True,
            connect_timeout=5,
            # Work in UTC so TIMESTAMP values read and written here are never shifted by the server's time zone.
            init_command="SET time_zone = '+00:00'",
        )
    except pymysql.err.OperationalError as exc:
        config.log.error("MySQL connection failed: %s", exc)
        raise ApiError(503, "Database is unavailable. Check the MySQL settings in server/.env.") from exc
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def transaction():
    """A connection whose statements are committed together, or rolled back on error."""
    with connect() as conn:
        conn.begin()
        try:
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise


def ping() -> bool:
    try:
        with connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1")
        return True
    except Exception:
        return False


def iso(value: datetime | None) -> str | None:
    # MySQL TIMESTAMPs come back naive in the session time zone, which connect() sets to UTC.
    return value.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z") if value else None


def _to_mysql_time(iso: str | None) -> datetime:
    """Accepts an ISO timestamp from the app; falls back to now."""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00")) if iso else None
    except (AttributeError, ValueError):
        dt = None
    dt = dt or datetime.now(timezone.utc)
    if dt.tzinfo:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _json(value):
    if value is None:
        return None
    return json.loads(value) if isinstance(value, (str, bytes)) else value


def _marks(value):
    if value is None:
        return None
    f = float(value)
    return int(f) if f.is_integer() else f


# ---------------------------------------------------------------- users


def find_user_by_email(email: str):
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, full_name, email, password_hash, created_at FROM users WHERE email = %s", (email,))
        return cur.fetchone()


def find_user_by_id(user_id: int):
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, full_name, email, created_at FROM users WHERE id = %s", (user_id,))
        return cur.fetchone()


def create_user(full_name: str, email: str, password_hash: str):
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO users (full_name, email, password_hash) VALUES (%s, %s, %s)",
            (full_name, email, password_hash),
        )
        user_id = cur.lastrowid
    return find_user_by_id(user_id)


# ---------------------------------------------------------------- history


def _solution_columns(solution: dict | None):
    if not solution:
        return (False, None, None, None, None)
    return (
        True,
        solution.get("answer", ""),
        json.dumps(solution.get("steps", [])),
        solution.get("explanation", ""),
        json.dumps(solution.get("tips", [])),
    )


def _session_row_to_dict(s: dict, questions: list[dict]) -> dict:
    return {
        "id": s["client_id"],
        "kind": s["kind"],
        "title": s["title"],
        "subject": s["subject"],
        "fileName": s["file_name"],
        "method": s["method"],
        "pages": s["pages"],
        "createdAt": iso(s["created_at"]),
        "updatedAt": iso(s["updated_at"]),
        "questions": [
            {
                "id": q["question_ref"],
                "number": q["question_number"],
                "text": q["question_text"],
                "marks": _marks(q["marks"]),
                "solution": (
                    {
                        "answer": q["answer"] or "",
                        "steps": _json(q["steps"]) or [],
                        "explanation": q["explanation"] or "",
                        "tips": _json(q["tips"]) or [],
                    }
                    if q["solved"]
                    else None
                ),
            }
            for q in questions
        ],
    }


def list_history(user_id: int) -> list[dict]:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM history_sessions WHERE user_id = %s ORDER BY updated_at DESC, id DESC LIMIT %s",
            (user_id, MAX_HISTORY_SESSIONS),
        )
        sessions = cur.fetchall()
        if not sessions:
            return []
        ids = [s["id"] for s in sessions]
        cur.execute(
            f"SELECT * FROM history_questions WHERE session_id IN ({', '.join(['%s'] * len(ids))}) ORDER BY session_id, position",
            ids,
        )
        by_session: dict[int, list] = {}
        for q in cur.fetchall():
            by_session.setdefault(q["session_id"], []).append(q)
    return [_session_row_to_dict(s, by_session.get(s["id"], [])) for s in sessions]


def save_history_session(user_id: int, client_id: str, data: dict) -> None:
    """Creates or replaces one history session and its questions."""
    with transaction() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO history_sessions
                (user_id, client_id, kind, title, subject, file_name, method, pages, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE
                id = LAST_INSERT_ID(id), kind = VALUES(kind), title = VALUES(title), subject = VALUES(subject),
                file_name = VALUES(file_name), method = VALUES(method), pages = VALUES(pages),
                updated_at = UTC_TIMESTAMP()
            """,
            (
                user_id,
                client_id,
                data["kind"],
                data["title"],
                data["subject"],
                data["fileName"],
                data["method"],
                data["pages"],
                _to_mysql_time(data.get("createdAt")),
            ),
        )
        session_id = cur.lastrowid

        cur.execute("DELETE FROM history_questions WHERE session_id = %s", (session_id,))
        if data["questions"]:
            cur.executemany(
                """
                INSERT INTO history_questions
                    (session_id, position, question_ref, question_number, question_text, marks,
                     solved, answer, steps, explanation, tips)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                [
                    (session_id, i, q["id"], q["number"], q["text"], q["marks"], *_solution_columns(q["solution"]))
                    for i, q in enumerate(data["questions"])
                ],
            )

        # Keep each user's history to the most recent sessions.
        cur.execute(
            """
            DELETE FROM history_sessions WHERE user_id = %s AND id NOT IN (
                SELECT id FROM (
                    SELECT id FROM history_sessions WHERE user_id = %s ORDER BY updated_at DESC, id DESC LIMIT %s
                ) AS keep
            )
            """,
            (user_id, user_id, MAX_HISTORY_SESSIONS),
        )


def delete_history_session(user_id: int, client_id: str) -> bool:
    with connect() as conn, conn.cursor() as cur:
        return cur.execute("DELETE FROM history_sessions WHERE user_id = %s AND client_id = %s", (user_id, client_id)) > 0


def clear_history(user_id: int) -> int:
    with connect() as conn, conn.cursor() as cur:
        return cur.execute("DELETE FROM history_sessions WHERE user_id = %s", (user_id,))


# ---------------------------------------------------------------- saved answers


def _saved_row_to_dict(r: dict) -> dict:
    return {
        "id": r["saved_key"],
        "paperTitle": r["paper_title"],
        "subject": r["subject"],
        "number": r["question_number"],
        "text": r["question_text"],
        "marks": _marks(r["marks"]),
        "solution": {
            "answer": r["answer"],
            "steps": _json(r["steps"]) or [],
            "explanation": r["explanation"],
            "tips": _json(r["tips"]) or [],
        },
        "savedAt": iso(r["saved_at"]),
    }


def list_saved(user_id: int) -> list[dict]:
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM saved_answers WHERE user_id = %s ORDER BY saved_at DESC, id DESC", (user_id,))
        return [_saved_row_to_dict(r) for r in cur.fetchall()]


def save_answer(user_id: int, item: dict) -> dict:
    s = item["solution"]
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO saved_answers
                (user_id, saved_key, paper_title, subject, question_number, question_text, marks,
                 answer, steps, explanation, tips, saved_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                paper_title = VALUES(paper_title), subject = VALUES(subject), question_number = VALUES(question_number),
                question_text = VALUES(question_text), marks = VALUES(marks), answer = VALUES(answer),
                steps = VALUES(steps), explanation = VALUES(explanation), tips = VALUES(tips)
            """,
            (
                user_id,
                item["id"],
                item["paperTitle"],
                item["subject"],
                item["number"],
                item["text"],
                item["marks"],
                s["answer"],
                json.dumps(s["steps"]),
                s["explanation"],
                json.dumps(s["tips"]),
                _to_mysql_time(item.get("savedAt")),
            ),
        )
        cur.execute("SELECT * FROM saved_answers WHERE user_id = %s AND saved_key = %s", (user_id, item["id"]))
        return _saved_row_to_dict(cur.fetchone())


def delete_saved(user_id: int, saved_key: str) -> bool:
    with connect() as conn, conn.cursor() as cur:
        return cur.execute("DELETE FROM saved_answers WHERE user_id = %s AND saved_key = %s", (user_id, saved_key)) > 0
