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

# Google Gemini (https://aistudio.google.com/apikey). "gemini-flash-lite-latest" always points at the current
# Flash-Lite model: accurate on exam questions and fast (a few seconds), unlike the full Flash models on the free tier.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "").strip() or "gemini-flash-lite-latest"
AI_TIMEOUT_SECONDS = int(os.getenv("AI_TIMEOUT_SECONDS", "120"))
AI_CONFIGURED = bool(GEMINI_API_KEY) and GEMINI_API_KEY != "your_gemini_api_key"

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "20"))

if not os.getenv("JWT_SECRET"):
    log.warning("JWT_SECRET is not set - using an insecure development secret.")
if not AI_CONFIGURED:
    log.warning("GEMINI_API_KEY is not set - extracting and solving questions will fail.")
