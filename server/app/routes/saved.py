from fastapi import APIRouter, Depends, Query, Response

from .. import db
from ..security import current_user_id
from .schemas import SavedAnswer

router = APIRouter(prefix="/api/saved")


@router.get("")
def list_saved(user_id: int = Depends(current_user_id)):
    """The signed-in user's saved answers, newest first."""
    return {"saved": db.list_saved(user_id)}


@router.post("", status_code=201)
def save_answer(body: SavedAnswer, user_id: int = Depends(current_user_id)):
    """Saves an answer. Saving the same question again updates it instead of duplicating it."""
    return {"saved": db.save_answer(user_id, body.model_dump())}


@router.delete("", status_code=204)
def delete_saved(key: str = Query(min_length=1, max_length=400), user_id: int = Depends(current_user_id)):
    db.delete_saved(user_id, key)
    return Response(status_code=204)
