import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

log = logging.getLogger("studysync")

PORT = int(os.getenv("PORT", "5000"))

DB = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "studysync"),
}

JWT_SECRET = os.getenv("JWT_SECRET") or "dev-only-secret-change-me"
JWT_EXPIRES_DAYS = int(os.getenv("JWT_EXPIRES_DAYS", "7"))

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_CONFIGURED = bool(OPENAI_API_KEY) and OPENAI_API_KEY != "sk-..."

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "20"))

if not os.getenv("JWT_SECRET"):
    log.warning("JWT_SECRET is not set - using an insecure development secret.")
if not OPENAI_CONFIGURED:
    log.warning("OPENAI_API_KEY is not set - solving questions will fail.")
