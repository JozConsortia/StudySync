import re

from fastapi import APIRouter, Depends, Response

from .. import db
from ..errors import ApiError
from ..security import current_user_id
from .schemas import HistorySession

router = APIRouter(prefix="/api/history")

CLIENT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")


def _check_id(client_id: str) -> str:
    if not CLIENT_ID_RE.match(client_id):
        raise ApiError(400, "Invalid history id.")
    return client_id


@router.get("")
def list_history(user_id: int = Depends(current_user_id)):
    """The signed-in user's history, newest first."""
    return {"history": db.list_history(user_id)}


@router.put("/{client_id}", status_code=204)
def save_session(client_id: str, body: HistorySession, user_id: int = Depends(current_user_id)):
    """Creates or replaces a history session (a scanned paper or typed question) and its questions."""
    db.save_history_session(user_id, _check_id(client_id), body.model_dump())
    return Response(status_code=204)


@router.delete("/{client_id}", status_code=204)
def delete_session(client_id: str, user_id: int = Depends(current_user_id)):
    db.delete_history_session(user_id, _check_id(client_id))
    return Response(status_code=204)


@router.delete("", status_code=204)
def clear_history(user_id: int = Depends(current_user_id)):
    db.clear_history(user_id)
    return Response(status_code=204)
