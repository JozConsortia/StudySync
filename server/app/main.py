import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import config, db
from .errors import ApiError
from .routes import auth, history, papers, saved

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(name)s: %(message)s")

app = FastAPI(title="StudySync API", version="1.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# Every error is returned as {"error": "..."} so the web, desktop and mobile apps can show it directly.
@app.exception_handler(ApiError)
async def api_error_handler(_req: Request, exc: ApiError):
    return JSONResponse({"error": exc.message}, status_code=exc.status)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_req: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", [])[1:])
    msg = f"Invalid {field}: {first.get('msg', 'bad value')}" if field else "Invalid request."
    return JSONResponse({"error": msg}, status_code=400)


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_req: Request, exc: StarletteHTTPException):
    msg = "Not found." if exc.status_code == 404 else str(exc.detail)
    return JSONResponse({"error": msg}, status_code=exc.status_code)


@app.exception_handler(Exception)
async def unhandled_error_handler(_req: Request, exc: Exception):
    config.log.exception("Unhandled error", exc_info=exc)
    return JSONResponse({"error": "Something went wrong on the server."}, status_code=500)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "database": "ok" if db.ping() else "unreachable",
        "ai": config.AI_CONFIGURED,
    }


app.include_router(auth.router)
app.include_router(papers.router)
app.include_router(history.router)
app.include_router(saved.router)
