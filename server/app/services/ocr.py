"""Text extraction from exam papers.

Scanned PDF pages and images go through RapidOCR (PP-OCR models on ONNX Runtime, no system install
needed; models download on first use). With OCR_MODE=auto, PDF pages that already contain text are read
directly with PyMuPDF instead; OCR_MODE=rapidocr sends every page through RapidOCR.
"""

import threading

import cv2
import numpy as np
import pymupdf

from .. import config
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


def warm_up() -> None:
    """Loads the RapidOCR models ahead of the first upload, so it is not slowed down by the model loading."""
    try:
        _ocr_engine()
        config.log.info("RapidOCR is ready.")
    except Exception as exc:  # the first upload will try again and report the error
        config.log.warning("RapidOCR could not be loaded yet: %s", exc)


def _boxes_to_lines(boxes, txts) -> str:
    """Rebuilds reading order: groups detected text boxes into lines, top to bottom, left to right."""
    items = []
    for box, text in zip(boxes, txts):
        ys = [p[1] for p in box]
        xs = [p[0] for p in box]
        top, bottom = min(ys), max(ys)
        items.append({"text": text, "left": min(xs), "width": max(xs) - min(xs), "cy": (top + bottom) / 2, "h": bottom - top})
    items.sort(key=lambda it: (it["cy"], it["left"]))

    lines: list[list[dict]] = []
    for it in items:
        line = lines[-1] if lines else None
        if line and abs(it["cy"] - line[-1]["cy"]) < max(it["h"], line[-1]["h"]) * 0.5:
            line.append(it)
        else:
            lines.append([it])

    char_w = _median_char_width((it["width"], it["text"]) for it in items)
    rows = []
    for line in lines:
        line.sort(key=lambda i: i["left"])
        rows.append((line[0]["left"], " ".join(i["text"] for i in line)))
    return _indent_lines(rows, char_w)


# Indentation matters for code, pseudocode and nested lists, but OCR and PDF text extraction only give
# each line's horizontal position. These helpers turn that position back into leading spaces.
MAX_INDENT = 24


def _median_char_width(samples) -> float:
    widths = sorted(w / len(t) for w, t in samples if len(t.strip()) >= 3 and w > 0)
    return widths[len(widths) // 2] if widths else 0.0


def _indent_lines(rows: list[tuple[float, str]], char_w: float) -> str:
    """rows: (left x, text) per line. Returns the lines with leading spaces matching their x offset."""
    if not rows:
        return ""
    page_left = min(x for x, t in rows if t.strip()) if any(t.strip() for _, t in rows) else 0
    out = []
    for x, text in rows:
        if not text.strip():
            out.append("")
            continue
        lead = len(text) - len(text.lstrip(" "))
        indent = lead + (round((x - page_left) / char_w) if char_w > 0 else 0)
        out.append(" " * min(max(indent, 0), MAX_INDENT) + text.strip())
    return "\n".join(out)


def _pdf_page_text(page) -> str:
    """Text of a PDF page with each line's indentation preserved (reading order as PyMuPDF gives it)."""
    rows, samples = [], []
    prev_bottom = None
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:  # 0 = text block; skip images
            continue
        top, bottom = block["bbox"][1], block["bbox"][3]
        line_h = (bottom - top) / max(len(block["lines"]), 1)
        # A blank line only where the page has a visible gap (a new paragraph), not between every block.
        if prev_bottom is not None and top - prev_bottom > line_h * 0.9:
            rows.append((0, ""))
        prev_bottom = bottom
        for line in block["lines"]:
            text = "".join(span["text"] for span in line["spans"])
            for span in line["spans"]:
                samples.append((span["bbox"][2] - span["bbox"][0], span["text"]))
            rows.append((line["bbox"][0], text.rstrip()))
    return _indent_lines(rows, _median_char_width(samples)).strip("\n")


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
            text = "" if config.OCR_MODE == "rapidocr" else _pdf_page_text(page)
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