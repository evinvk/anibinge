from enum import Enum

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import get_current_user_id

router = APIRouter(prefix="/api/v1/watchlist", tags=["watchlist"])


class WatchStatus(str, Enum):
    planning = "planning"
    watching = "watching"
    completed = "completed"
    dropped = "dropped"
    favorites = "favorites"


class WatchlistEntry(BaseModel):
    anime_id: int
    status: WatchStatus
    progress: int = 0
    rating: float | None = None


@router.get("")
async def get_watchlist(user_id: str = Depends(get_current_user_id)):
    # TODO: SELECT * FROM watchlist_entries WHERE user_id = :user_id
    return {"user_id": user_id, "entries": []}


@router.put("")
async def upsert_entry(entry: WatchlistEntry, user_id: str = Depends(get_current_user_id)):
    # TODO: INSERT ... ON CONFLICT (user_id, anime_id) DO UPDATE
    return {"user_id": user_id, "entry": entry}


@router.delete("/{anime_id}")
async def remove_entry(anime_id: int, user_id: str = Depends(get_current_user_id)):
    # TODO: DELETE FROM watchlist_entries WHERE user_id = :user_id AND anime_id = :anime_id
    return {"removed": anime_id}
