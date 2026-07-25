from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_prefix
from app.core.db import get_db
from app.core.security import get_current_admin_user
from app.core.circuit_breaker import all_breakers
from app.models.models import User, WatchlistEntry, EpisodeComment

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/analytics/overview")
async def analytics_overview(user_id: str = Depends(get_current_admin_user), db: AsyncSession = Depends(get_db)):
    total_users = await db.scalar(select(func.count()).select_from(User)) or 0
    total_watchlist = await db.scalar(select(func.count()).select_from(WatchlistEntry)) or 0
    return {
        "daily_active_users": 0,
        "total_users": total_users,
        "total_watchlist_entries": total_watchlist,
        "top_searches_today": [],
        "requests_last_24h": 0,
    }


@router.get("/api-monitoring")
async def api_monitoring(user_id: str = Depends(get_current_admin_user)):
    breakers = all_breakers()
    return breakers


@router.post("/cache/invalidate/{prefix}")
async def invalidate_cache(prefix: str, user_id: str = Depends(get_current_admin_user)):
    deleted = await invalidate_prefix(prefix)
    return {"invalidated_keys": deleted, "prefix": prefix}


@router.get("/issues")
async def get_all_issues(
    slug: str | None = Query(None),
    resolved: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _admin: str = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all reported issues across all episodes."""
    stmt = (
        select(EpisodeComment.id, EpisodeComment.slug, EpisodeComment.episode_number,
               EpisodeComment.body, EpisodeComment.tag, EpisodeComment.is_resolved,
               EpisodeComment.created_at, User.username)
        .join(User, EpisodeComment.user_id == User.id)
        .where(EpisodeComment.tag.in_(["report", "issue"]))
    )
    if slug:
        stmt = stmt.where(EpisodeComment.slug == slug)
    if resolved is not None:
        stmt = stmt.where(EpisodeComment.is_resolved == resolved)
    stmt = stmt.order_by(EpisodeComment.created_at.desc()).offset(offset).limit(limit)

    rows = (await db.execute(stmt)).all()
    issues = [
        {
            "id": r.id, "slug": r.slug, "episode_number": r.episode_number,
            "body": r.body, "tag": r.tag, "is_resolved": r.is_resolved,
            "created_at": r.created_at.isoformat(), "username": r.username,
        }
        for r in rows
    ]

    total_stmt = select(func.count()).select_from(EpisodeComment).where(
        EpisodeComment.tag.in_(["report", "issue"])
    )
    if slug:
        total_stmt = total_stmt.where(EpisodeComment.slug == slug)
    if resolved is not None:
        total_stmt = total_stmt.where(EpisodeComment.is_resolved == resolved)
    total = (await db.execute(total_stmt)).scalar() or 0

    return {"issues": issues, "total": total}
