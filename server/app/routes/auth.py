import re

import pymysql
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .. import db
from ..errors import ApiError
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
    if len(body.password) < 8:
        raise ApiError(400, "Password must be at least 8 characters.")
    if len(body.password.encode()) > 72:
        raise ApiError(400, "Password must be at most 72 characters.")
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
