from enum import Enum

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_user_id
from app.models.models import WatchlistEntry

router = APIRouter(prefix="/api/v1/watchlist", tags=["watchlist"])


class WatchStatus(str, Enum):
    planning = "planning"
    watching = "watching"
    completed = "completed"
    dropped = "dropped"
    favorites = "favorites"


class WatchlistEntryIn(BaseModel):
    anime_id: int
    source: str = "anilist"  # "anilist" or "mal" — id spaces differ between sources
    status: WatchStatus
    progress: int = 0
    rating: float | None = None


def _serialize(entry: WatchlistEntry) -> dict:
    return {
        "anime_id": entry.anime_id,
        "source": entry.source,
        "status": entry.status,
        "progress": entry.progress,
        "rating": entry.rating,
        "updated_at": entry.updated_at.isoformat() if entry.updated_at else None,
    }


@router.get("")
async def get_watchlist(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WatchlistEntry).where(WatchlistEntry.user_id == user_id)
    )
    entries = result.scalars().all()
    return {"user_id": user_id, "entries": [_serialize(e) for e in entries]}


@router.put("")
async def upsert_entry(
    entry: WatchlistEntryIn,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        pg_insert(WatchlistEntry)
        .values(
            user_id=user_id,
            anime_id=entry.anime_id,
            source=entry.source,
            status=entry.status.value,
            progress=entry.progress,
            rating=entry.rating,
        )
        .on_conflict_do_update(
            constraint="uq_user_anime",
            set_={
                "source": entry.source,
                "status": entry.status.value,
                "progress": entry.progress,
                "rating": entry.rating,
            },
        )
        .returning(WatchlistEntry)
    )
    result = await db.execute(stmt)
    await db.commit()
    saved = result.scalar_one()
    return {"user_id": user_id, "entry": _serialize(saved)}


@router.delete("/{anime_id}")
async def remove_entry(
    anime_id: int,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WatchlistEntry).where(
            WatchlistEntry.user_id == user_id, WatchlistEntry.anime_id == anime_id
        )
    )
    existing = result.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="Not in watchlist")

    await db.delete(existing)
    await db.commit()
    return {"removed": anime_id}
