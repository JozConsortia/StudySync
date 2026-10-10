"""Text extraction from exam papers.

Text-based PDF pages are read directly with PyMuPDF. Scanned PDF pages and images go
through RapidOCR (ONNX models, no system install needed; models download on first use).
"""

import threading

import cv2
import numpy as np
import pymupdf

from ..errors import ApiError

MAX_PDF_PAGES = 30
# A page with fewer characters than this in its text layer is treated as scanned.
MIN_TEXT_CHARS_PER_PAGE = 40
SCAN_DPI = 220
# Downscale very large photos; OCR accuracy does not improve beyond this and it gets slow.
MAX_IMAGE_SIDE = 3000

_engine = None
# Re-entrant: _ocr_image holds it while calling _ocr_engine().
_engine_lock = threading.RLock()


def _ocr_engine():
    global _engine
    with _engine_lock:
        if _engine is None:
            from rapidocr import RapidOCR

            _engine = RapidOCR()
        return _engine


def _boxes_to_lines(boxes, txts) -> str:
    """Rebuilds reading order: groups detected text boxes into lines, top to bottom, left to right."""
    items = []
    for box, text in zip(boxes, txts):
        ys = [p[1] for p in box]
        xs = [p[0] for p in box]
        top, bottom = min(ys), max(ys)
        items.append({"text": text, "left": min(xs), "cy": (top + bottom) / 2, "h": bottom - top})
    items.sort(key=lambda it: (it["cy"], it["left"]))

    lines: list[list[dict]] = []
    for it in items:
        line = lines[-1] if lines else None
        if line and abs(it["cy"] - line[-1]["cy"]) < max(it["h"], line[-1]["h"]) * 0.5:
            line.append(it)
        else:
            lines.append([it])
    return "\n".join(" ".join(i["text"] for i in sorted(line, key=lambda i: i["left"])) for line in lines)


def _ocr_image(img: np.ndarray) -> str:
    h, w = img.shape[:2]
    scale = MAX_IMAGE_SIDE / max(h, w)
    if scale < 1:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    with _engine_lock:  # the ONNX session is not guaranteed to be thread-safe
        result = _ocr_engine()(img)
    if result.boxes is None or not result.txts:
        return ""
    return _boxes_to_lines(result.boxes, result.txts)


def _decode_image(data: bytes) -> np.ndarray:
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ApiError(400, "This image could not be read. Try saving it as PNG or JPG.")
    return img


def _pixmap_to_image(pix: "pymupdf.Pixmap") -> np.ndarray:
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR if pix.n == 3 else cv2.COLOR_RGBA2BGR)


def extract_text(data: bytes, mimetype: str) -> dict:
    if mimetype != "application/pdf":
        return {"text": _ocr_image(_decode_image(data)), "method": "ocr", "pages": 1}

    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise ApiError(400, "This PDF could not be opened. It may be damaged.") from exc

    with doc:
        if doc.needs_pass:
            raise ApiError(400, "This PDF is password-protected. Remove the password and try again.")

        pages: list[str] = []
        scanned = 0
        for page in doc.pages(0, min(doc.page_count, MAX_PDF_PAGES)):
            text = page.get_text("text").strip()
            if len("".join(text.split())) < MIN_TEXT_CHARS_PER_PAGE:
                text = _ocr_image(_pixmap_to_image(page.get_pixmap(dpi=SCAN_DPI, alpha=False)))
                scanned += 1
            pages.append(text)

    if scanned == 0:
        method = "pdf-text"
    elif scanned == len(pages):
        method = "ocr"
    else:
        method = "pdf-text+ocr"

    return {
        "text": "\n\n".join(f"--- Page {i + 1} ---\n{t}" for i, t in enumerate(pages)),
        "method": method,
        "pages": len(pages),
    }
