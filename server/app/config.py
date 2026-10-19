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

# Text recognition uses RapidOCR (PP-OCR models on ONNX Runtime).
#   auto     - PDF pages that already contain text are read directly (exact and fast); scanned pages and
#              photos go through RapidOCR. Recommended.
#   rapidocr - every page, including text PDFs, goes through RapidOCR.
OCR_MODE = os.getenv("OCR_MODE", "auto").strip().lower()
if OCR_MODE not in ("auto", "rapidocr"):
    log.warning('OCR_MODE must be "auto" or "rapidocr"; using "auto".')
    OCR_MODE = "auto"

# Email for "Forgot password" codes. Any SMTP provider works; for Gmail use smtp.gmail.com, port 587 and an
# App Password (Google Account > Security > 2-Step Verification > App passwords), not your normal password.
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or 587)
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").replace(" ", "")  # Gmail shows App Passwords in groups of four
SMTP_FROM = os.getenv("SMTP_FROM", "").strip() or SMTP_USER
# starttls (port 587), ssl (port 465) or none (a local test server)
SMTP_SECURITY = (os.getenv("SMTP_SECURITY", "").strip().lower() or ("ssl" if SMTP_PORT == 465 else "starttls"))
MAIL_CONFIGURED = bool(SMTP_HOST and SMTP_FROM)

if not os.getenv("JWT_SECRET"):
    log.warning("JWT_SECRET is not set - using an insecure development secret.")
if not AI_CONFIGURED:
    log.warning("GEMINI_API_KEY is not set - extracting and solving questions will fail.")
if not MAIL_CONFIGURED:
    log.warning("SMTP_HOST is not set - password reset codes are printed in this log instead of being emailed.")
