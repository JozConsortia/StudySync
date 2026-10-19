import hashlib
import hmac
import re
import secrets

import pymysql
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .. import config, db
from ..errors import ApiError
from ..services import mailer
from ..security import check_password, create_token, current_user_id, hash_password

router = APIRouter(prefix="/api/auth")

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class RegisterBody(BaseModel):
    fullName: str = ""
    email: str = ""
    password: str = ""


class LoginBody(BaseModel):
    email: str = ""
    password: str = ""


def public_user(u: dict) -> dict:
    return {"id": u["id"], "fullName": u["full_name"], "email": u["email"], "createdAt": db.iso(u.get("created_at"))}


def session(user: dict) -> dict:
    return {"token": create_token(user["id"]), "user": public_user(user)}


def check_new_password(password: str) -> None:
    if len(password) < 8:
        raise ApiError(400, "Password must be at least 8 characters.")
    if len(password.encode()) > 72:
        raise ApiError(400, "Password must be at most 72 characters.")


@router.post("/register", status_code=201)
def register(body: RegisterBody):
    full_name = body.fullName.strip()
    email = body.email.strip().lower()

    if len(full_name) < 2:
        raise ApiError(400, "Please enter your full name.")
    if len(full_name) > 100:
        raise ApiError(400, "Name is too long.")
    if not EMAIL_RE.match(email) or len(email) > 255:
        raise ApiError(400, "Please enter a valid email address.")
    check_new_password(body.password)
    if db.find_user_by_email(email):
        raise ApiError(409, "An account with this email already exists.")

    try:
        user = db.create_user(full_name, email, hash_password(body.password))
    except pymysql.err.IntegrityError as exc:
        raise ApiError(409, "An account with this email already exists.") from exc
    return session(user)


@router.post("/login")
def login(body: LoginBody):
    user = db.find_user_by_email(body.email.strip().lower())
    if not user or not check_password(body.password, user["password_hash"]):
        raise ApiError(401, "Incorrect email or password.")
    return session(user)


@router.get("/me")
def me(user_id: int = Depends(current_user_id)):
    user = db.find_user_by_id(user_id)
    if not user:
        raise ApiError(404, "Account not found.")
    return {"user": public_user(user)}


# ---------------------------------------------------------------- forgot password
# The student asks for a code, it is emailed to them, and they enter it with a new password.
# Codes are 6 digits, valid for 15 minutes, allow 5 tries, and are stored only as a keyed hash.

RESET_CODE_MINUTES = 15
RESET_RESEND_SECONDS = 45
RESET_MAX_ATTEMPTS = 5
BAD_CODE = "That code is incorrect or has expired. Request a new code and try again."


class ForgotBody(BaseModel):
    email: str = ""


class ResetBody(BaseModel):
    email: str = ""
    code: str = ""
    password: str = ""


def _code_hash(user_id: int, code: str) -> str:
    return hmac.new(config.JWT_SECRET.encode(), f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


@router.post("/forgot-password")
def forgot_password(body: ForgotBody):
    """Emails a reset code. The reply is the same whether or not the email has an account, so it cannot be
    used to find out who is registered."""
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email) or len(email) > 255:
        raise ApiError(400, "Please enter a valid email address.")

    user = db.find_user_by_email(email)
    if user:
        age = db.reset_code_age(user["id"])
        # A code was just sent: don't send another (protects the inbox from repeated taps).
        if age is None or age >= RESET_RESEND_SECONDS:
            code = f"{secrets.randbelow(10**6):06d}"
            db.save_reset_code(user["id"], _code_hash(user["id"], code), RESET_CODE_MINUTES)
            try:
                mailer.send_reset_code(user["email"], user["full_name"], code, RESET_CODE_MINUTES)
            except ApiError:
                db.delete_reset_code(user["id"])
                raise
    return {
        "message": f"If an account exists for {email}, a 6-digit code is on its way. Check your inbox and spam folder.",
        "expiresInMinutes": RESET_CODE_MINUTES,
        "resendAfterSeconds": RESET_RESEND_SECONDS,
    }


@router.post("/reset-password")
def reset_password(body: ResetBody):
    """Checks the emailed code, sets the new password and signs the student in."""
    email = body.email.strip().lower()
    code = re.sub(r"\D", "", body.code)
    check_new_password(body.password)

    user = db.find_user_by_email(email)
    reset = db.get_reset_code(user["id"]) if user else None
    if not user or not reset or reset["expired"] or len(code) != 6:
        raise ApiError(400, BAD_CODE)
    if reset["attempts"] >= RESET_MAX_ATTEMPTS:
        db.delete_reset_code(user["id"])
        raise ApiError(400, "Too many wrong codes. Request a new code and try again.")
    if not hmac.compare_digest(reset["code_hash"], _code_hash(user["id"], code)):
        db.count_reset_attempt(user["id"])
        left = RESET_MAX_ATTEMPTS - reset["attempts"] - 1
        if left <= 0:
            db.delete_reset_code(user["id"])
            raise ApiError(400, "Too many wrong codes. Request a new code and try again.")
        raise ApiError(400, f"That code is incorrect. {left} {'try' if left == 1 else 'tries'} left.")

    db.update_password(user["id"], hash_password(body.password))
    db.delete_reset_code(user["id"])
    return session(user)
