from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Header

from . import config
from .errors import ApiError


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def check_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_token(user_id: int) -> str:
    payload = {"sub": str(user_id), "exp": datetime.now(timezone.utc) + timedelta(days=config.JWT_EXPIRES_DAYS)}
    return jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")


def current_user_id(authorization: str | None = Header(default=None)) -> int:
    """FastAPI dependency: returns the signed-in user's id or raises 401."""
    if not authorization or not authorization.startswith("Bearer "):
        raise ApiError(401, "Not signed in.")
    try:
        payload = jwt.decode(authorization[7:], config.JWT_SECRET, algorithms=["HS256"])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise ApiError(401, "Your session has expired. Please sign in again.") from exc
