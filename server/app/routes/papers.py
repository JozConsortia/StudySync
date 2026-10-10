import re

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel

from .. import config
from ..errors import ApiError
from ..security import current_user_id
from ..services.ai import solve_question, split_questions, transcribe_audio
from ..services.ocr import extract_text

router = APIRouter(prefix="/api/papers", dependencies=[Depends(current_user_id)])

ALLOWED = {"application/pdf", "image/png", "image/jpeg", "image/webp", "image/bmp", "image/tiff"}
EXT_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
}


def resolve_type(file: UploadFile) -> str:
    content_type = (file.content_type or "").lower()
    if content_type in ALLOWED:
        return content_type
    # Some clients send application/octet-stream; fall back to the extension.
    name = (file.filename or "").lower()
    for ext, mime in EXT_TYPES.items():
        if name.endswith(ext):
            return mime
    raise ApiError(400, "Only PDF or image files (PNG, JPG, WEBP, BMP, TIFF) are supported.")


@router.post("/extract")
def extract(file: UploadFile | None = File(default=None)):
    """Upload a paper -> OCR -> split into individual questions."""
    if file is None:
        raise ApiError(400, "Please choose a PDF or image to upload.")
    mimetype = resolve_type(file)

    data = file.file.read(config.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(data) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise ApiError(400, f"File is larger than {config.MAX_UPLOAD_MB} MB.")
    if not data:
        raise ApiError(400, "The uploaded file is empty.")

    ocr = extract_text(data, mimetype)
    if len(re.sub(r"---\s*Page \d+\s*---", "", ocr["text"]).strip()) < 10:
        raise ApiError(422, "No readable text was found. Try a clearer scan or photo.")

    paper = split_questions(ocr["text"])
    return {
        "fileName": file.filename,
        "method": ocr["method"],
        "pages": ocr["pages"],
        "rawText": ocr["text"],
        **paper,
    }


class SolveBody(BaseModel):
    text: str = ""
    subject: str | None = None
    marks: float | None = None
    # Earlier questions from the same section of the paper, for references like "the block" or "your answer to 1.1".
    context: str | None = None


@router.post("/solve")
def solve(body: SolveBody):
    """Solve a single question with step-by-step working."""
    text = body.text.strip()
    if not text:
        raise ApiError(400, "Question text is required.")
    if len(text) > 8000:
        raise ApiError(400, "Question is too long.")
    return solve_question(text, (body.subject or "")[:100], body.marks, (body.context or "").strip()[:8000])


# Formats Gemini can listen to. The web app records WAV; Android records AAC; iOS records WAV.
AUDIO_TYPES = {
    "audio/wav": "audio/wav",
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/aac": "audio/aac",
    "audio/x-aac": "audio/aac",
    "audio/mpeg": "audio/mp3",
    "audio/mp3": "audio/mp3",
    "audio/ogg": "audio/ogg",
    "audio/flac": "audio/flac",
    "audio/aiff": "audio/aiff",
}
AUDIO_EXT = {".wav": "audio/wav", ".aac": "audio/aac", ".mp3": "audio/mp3", ".ogg": "audio/ogg", ".flac": "audio/flac"}
MAX_AUDIO_MB = 10


@router.post("/transcribe")
def transcribe(file: UploadFile | None = File(default=None)):
    """Turns a recorded spoken question into text."""
    if file is None:
        raise ApiError(400, "No recording was received.")
    mime = AUDIO_TYPES.get((file.content_type or "").lower().split(";")[0].strip())
    if not mime:
        name = (file.filename or "").lower()
        mime = next((m for ext, m in AUDIO_EXT.items() if name.endswith(ext)), None)
    if not mime:
        raise ApiError(400, "Unsupported recording format.")

    data = file.file.read(MAX_AUDIO_MB * 1024 * 1024 + 1)
    if len(data) > MAX_AUDIO_MB * 1024 * 1024:
        raise ApiError(400, "The recording is too long. Keep questions under about two minutes.")
    if len(data) < 1000:
        raise ApiError(400, "The recording is empty. Hold the microphone button and speak your question.")

    text = transcribe_audio(data, mime)
    if not text:
        raise ApiError(422, "No speech was recognised. Please try again and speak clearly.")
    return {"text": text}
