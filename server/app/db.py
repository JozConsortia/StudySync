import json
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path

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


# Columns added after the first release. ensure_schema() adds any that an existing database is missing.
NEW_COLUMNS = [
    ("history_questions", "followups", "JSON NULL AFTER tips"),
    ("saved_answers", "followups", "JSON NULL AFTER tips"),
]


def add_missing_columns(cur, database: str) -> list[str]:
    """Adds NEW_COLUMNS that are missing (for databases created by an older schema). Returns what was added."""
    added = []
    for table, column, definition in NEW_COLUMNS:
        cur.execute(
            "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s",
            (database, table, column),
        )
        row = cur.fetchone()
        if (row["n"] if isinstance(row, dict) else row[0]) == 0:
            cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
            added.append(f"{table}.{column}")
    return added


SCHEMA_FILE = Path(__file__).resolve().parents[2] / "database" / "schema.sql"


def create_missing_tables(cur) -> None:
    """Runs the CREATE TABLE IF NOT EXISTS statements from database/schema.sql (new tables in later versions)."""
    sql = "\n".join(line for line in SCHEMA_FILE.read_text(encoding="utf-8").splitlines() if not line.strip().startswith("--"))
    for stmt in (s.strip() for s in sql.split(";")):
        if stmt.upper().startswith("CREATE TABLE"):
            cur.execute(stmt)


def ensure_schema() -> None:
    """Run at startup so an existing database picks up new tables and columns without running init_db.py."""
    try:
        with connect() as conn, conn.cursor() as cur:
            create_missing_tables(cur)
            for name in add_missing_columns(cur, config.DB["database"]):
                config.log.info("Database updated: added %s", name)
    except Exception as exc:
        config.log.warning("Could not check the database schema: %s", exc)


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


def _solution_columns(solution: dict | None, followups: list | None = None):
    if not solution:
        return (False, None, None, None, None, None)
    return (
        True,
        solution.get("answer", ""),
        json.dumps(solution.get("steps", [])),
        solution.get("explanation", ""),
        json.dumps(solution.get("tips", [])),
        json.dumps(followups) if followups else None,
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
                "followups": (_json(q.get("followups")) or []) if q["solved"] else [],
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
                     solved, answer, steps, explanation, tips, followups)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                [
                    (
                        session_id,
                        i,
                        q["id"],
                        q["number"],
                        q["text"],
                        q["marks"],
                        *_solution_columns(q["solution"], q.get("followups")),
                    )
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
        "followups": _json(r.get("followups")) or [],
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
                 answer, steps, explanation, tips, followups, saved_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                paper_title = VALUES(paper_title), subject = VALUES(subject), question_number = VALUES(question_number),
                question_text = VALUES(question_text), marks = VALUES(marks), answer = VALUES(answer),
                steps = VALUES(steps), explanation = VALUES(explanation), tips = VALUES(tips),
                followups = VALUES(followups)
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
                json.dumps(item["followups"]) if item.get("followups") else None,
                _to_mysql_time(item.get("savedAt")),
            ),
        )
        cur.execute("SELECT * FROM saved_answers WHERE user_id = %s AND saved_key = %s", (user_id, item["id"]))
        return _saved_row_to_dict(cur.fetchone())


def delete_saved(user_id: int, saved_key: str) -> bool:
    with connect() as conn, conn.cursor() as cur:
        return cur.execute("DELETE FROM saved_answers WHERE user_id = %s AND saved_key = %s", (user_id, saved_key)) > 0


def update_password(user_id: int, password_hash: str) -> None:
    with connect() as conn, conn.cursor() as cur:
        cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (password_hash, user_id))


# ---------------------------------------------------------------- password reset codes


def reset_code_age(user_id: int) -> int | None:
    """Seconds since this user's current reset code was sent, or None if there is none."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP()) AS age FROM password_resets WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
    return row["age"] if row else None


def save_reset_code(user_id: int, code_hash: str, minutes: int) -> None:
    """Stores a new code for the user, replacing any earlier one."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            REPLACE INTO password_resets (user_id, code_hash, expires_at, attempts, created_at)
            VALUES (%s, %s, UTC_TIMESTAMP() + INTERVAL %s MINUTE, 0, UTC_TIMESTAMP())
            """,
            (user_id, code_hash, minutes),
        )


def get_reset_code(user_id: int):
    """{code_hash, attempts, expired} for the user's current code, or None."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT code_hash, attempts, expires_at < UTC_TIMESTAMP() AS expired FROM password_resets WHERE user_id = %s",
            (user_id,),
        )
        return cur.fetchone()


def count_reset_attempt(user_id: int) -> None:
    with connect() as conn, conn.cursor() as cur:
        cur.execute("UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = %s", (user_id,))


def delete_reset_code(user_id: int) -> None:
    with connect() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM password_resets WHERE user_id = %s", (user_id,))


# ---------------------------------------------------------------- daily challenges


def _challenge_row(r: dict | None) -> dict | None:
    if not r:
        return None
    return {
        "day": r["day"].isoformat(),
        "difficulty": r["difficulty"],
        "items": _json(r["items"]) or [],
        "results": _json(r["results"]) or {},
        "score": r["score"],
        "maxScore": r["max_score"],
        "completedAt": iso(r["completed_at"]),
    }


def get_challenge(user_id: int, day: date) -> dict | None:
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM daily_challenges WHERE user_id = %s AND day = %s", (user_id, day))
        return _challenge_row(cur.fetchone())


def insert_challenge(user_id: int, day: date, difficulty: str, items: list[dict]) -> None:
    """Adds the day's challenges unless they already exist (two devices opening the app at once)."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT IGNORE INTO daily_challenges (user_id, day, difficulty, items, results, score, max_score)
            VALUES (%s, %s, %s, %s, %s, 0, %s)
            """,
            (user_id, day, difficulty, json.dumps(items), json.dumps({}), sum(i["points"] for i in items)),
        )


def record_challenge_result(user_id: int, day: date, item_id: str, result: dict) -> dict | None:
    """Saves the result of one challenge (the first answer counts) and updates the day's score."""
    with transaction() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM daily_challenges WHERE user_id = %s AND day = %s FOR UPDATE", (user_id, day))
        row = cur.fetchone()
        if not row:
            return None
        items = _json(row["items"]) or []
        results = _json(row["results"]) or {}
        if item_id not in results:
            results[item_id] = result
            score = sum(int(r.get("score") or 0) for r in results.values())
            done = all(i["id"] in results for i in items)
            cur.execute(
                """
                UPDATE daily_challenges SET results = %s, score = %s,
                    completed_at = IF(%s, COALESCE(completed_at, UTC_TIMESTAMP()), NULL)
                WHERE id = %s
                """,
                (json.dumps(results), score, done, row["id"]),
            )
        cur.execute("SELECT * FROM daily_challenges WHERE id = %s", (row["id"],))
        return _challenge_row(cur.fetchone())


def challenge_history(user_id: int) -> list[dict]:
    """Every day the user had challenges: day, score, max score and whether it was completed (newest first)."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT day, score, max_score, completed_at FROM daily_challenges WHERE user_id = %s ORDER BY day DESC",
            (user_id,),
        )
        return [
            {"day": r["day"], "score": r["score"], "maxScore": r["max_score"], "completed": r["completed_at"] is not None}
            for r in cur.fetchall()
        ]


def recent_study_topics(user_id: int) -> tuple[list[str], list[str]]:
    """The subjects and paper titles the user studied most recently, to make challenges personal."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT subject, title FROM history_sessions WHERE user_id = %s ORDER BY updated_at DESC LIMIT 30",
            (user_id,),
        )
        rows = cur.fetchall()
    subjects, titles = [], []
    for r in rows:
        if r["subject"] and r["subject"] not in subjects:
            subjects.append(r["subject"])
        if r["title"] and r["title"] not in titles:
            titles.append(r["title"])
    return subjects[:5], titles[:8]


def recent_challenge_questions(user_id: int, before: date, days: int = 4) -> list[str]:
    """Questions from the last few days, so new challenges do not repeat them."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT items FROM daily_challenges WHERE user_id = %s AND day < %s ORDER BY day DESC LIMIT %s",
            (user_id, before, days),
        )
        return [str(i.get("question", ""))[:200] for r in cur.fetchall() for i in (_json(r["items"]) or [])]
