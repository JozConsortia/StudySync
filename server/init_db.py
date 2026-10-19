"""Creates or updates the database and its tables from database/schema.sql: `python init_db.py`.

Safe to run again; it only adds what is missing.
"""

import re
from pathlib import Path

import pymysql

from app import config, db

SCHEMA = Path(__file__).resolve().parent.parent / "database" / "schema.sql"


def main():
    sql = re.sub(r"\bstudysync\b", config.DB["database"], SCHEMA.read_text(encoding="utf-8"))
    # Drop comment lines, then run each statement.
    sql = "\n".join(line for line in sql.splitlines() if not line.strip().startswith("--"))
    statements = [s.strip() for s in sql.split(";") if s.strip()]

    params = {k: v for k, v in config.DB.items() if k != "database"}
    try:
        conn = pymysql.connect(**params, charset="utf8mb4", autocommit=True)
    except pymysql.err.OperationalError as exc:
        raise SystemExit(f"Could not connect to MySQL: {exc.args[-1]}\nCheck DB_HOST, DB_USER and DB_PASSWORD in server/.env.")
    try:
        with conn.cursor() as cur:
            for stmt in statements:
                cur.execute(stmt)
            migrate(cur)
            for name in db.add_missing_columns(cur, config.DB["database"]):
                print(f"Migrated: added {name}.")
    finally:
        conn.close()
    print(f'Database "{config.DB["database"]}" is ready.')


def migrate(cur):
    """Brings a users table created by an older schema up to date (removes the old Google sign-in columns)."""
    cur.execute(
        "SELECT COLUMN_NAME, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'users'",
        (config.DB["database"],),
    )
    columns = {name: nullable for name, nullable in cur.fetchall()}

    for column in ("google_id", "avatar_url"):
        if column in columns:
            cur.execute(f"ALTER TABLE users DROP COLUMN {column}")
            print(f"Migrated: removed users.{column}.")

    if columns.get("password_hash") == "YES":
        cur.execute("SELECT COUNT(*) FROM users WHERE password_hash IS NULL")
        (without_password,) = cur.fetchone()
        if without_password:
            print(
                f"Warning: {without_password} account(s) have no password (created with Google sign-in). "
                "They cannot sign in until they register again; password_hash was left optional."
            )
        else:
            cur.execute("ALTER TABLE users MODIFY password_hash VARCHAR(255) NOT NULL")
            print("Migrated: password_hash is required again.")


if __name__ == "__main__":
    main()
