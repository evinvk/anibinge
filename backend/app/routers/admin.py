from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_prefix
from app.core.db import get_db
from app.core.security import get_current_admin_user
from app.core.circuit_breaker import all_breakers
from app.models.models import (
    CommentLike, EpisodeComment, PageView, PushSubscription, Review,
    User, WatchlistEntry,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


async def _count(db: AsyncSession, model, column=None, since=None) -> int:
    stmt = select(func.count(func.distinct(column)) if column is not None else func.count()).select_from(model)
    if since is not None:
        stmt = stmt.where(model.created_at >= since)
    return await db.scalar(stmt) or 0


@router.get("/analytics/overview")
async def analytics_overview(user_id: str = Depends(get_current_admin_user), db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_users = await db.scalar(select(func.count()).select_from(User)) or 0
    total_watchlist = await db.scalar(select(func.count()).select_from(WatchlistEntry)) or 0

    visitors_today = await _count(db, PageView, PageView.visitor_id, start_today)
    pageviews_today = await _count(db, PageView, None, start_today)
    visitors_7d = await _count(db, PageView, PageView.visitor_id, start_today - timedelta(days=6))
    pageviews_7d = await _count(db, PageView, None, start_today - timedelta(days=6))
    visitors_30d = await _count(db, PageView, PageView.visitor_id, start_today - timedelta(days=29))
    pageviews_30d = await _count(db, PageView, None, start_today - timedelta(days=29))

    since_24h = now - timedelta(hours=24)
    return {
        "visitors_today": visitors_today,
        "pageviews_today": pageviews_today,
        "visitors_7d": visitors_7d,
        "pageviews_7d": pageviews_7d,
        "visitors_30d": visitors_30d,
        "pageviews_30d": pageviews_30d,
        "daily_active_users": await _count(db, PageView, PageView.visitor_id, since_24h),
        "requests_last_24h": await _count(db, PageView, None, since_24h),
        "total_users": total_users,
        "total_watchlist_entries": total_watchlist,
        "top_searches_today": [],
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


@router.get("/users")
async def list_users(
    q: str = Query("", description="Search by email or username"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    _admin: str = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User.id, User.email, User.username, User.is_admin, User.created_at, User.google_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where((User.email.ilike(like)) | (User.username.ilike(like)))
    stmt = stmt.order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page)

    rows = (await db.execute(stmt)).all()
    users = [
        {
            "id": r.id, "email": r.email, "username": r.username,
            "is_admin": r.is_admin, "created_at": r.created_at.isoformat() if r.created_at else None,
            "has_google": r.google_id is not None,
        }
        for r in rows
    ]

    count_stmt = select(func.count()).select_from(User)
    if q:
        like = f"%{q}%"
        count_stmt = count_stmt.where((User.email.ilike(like)) | (User.username.ilike(like)))
    total = (await db.execute(count_stmt)).scalar() or 0

    return {"users": users, "total": total}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    _admin: str = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if user_id == _admin:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Delete related records
    await db.execute(sa_delete(CommentLike).where(CommentLike.user_id == user_id))
    await db.execute(sa_delete(EpisodeComment).where(EpisodeComment.user_id == user_id))
    await db.execute(sa_delete(PushSubscription).where(PushSubscription.user_id == user_id))
    await db.execute(sa_delete(Review).where(Review.user_id == user_id))
    await db.execute(sa_delete(WatchlistEntry).where(WatchlistEntry.user_id == user_id))
    await db.delete(user)
    await db.commit()

    return {"detail": f"User {user.email} deleted"}


class SetAdminBody(BaseModel):
    is_admin: bool


@router.patch("/users/{user_id}/admin")
async def set_admin(
    user_id: str,
    body: SetAdminBody,
    _admin: str = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if user_id == _admin and not body.is_admin:
        raise HTTPException(status_code=400, detail="Cannot remove your own admin privileges")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_admin = body.is_admin
    await db.commit()
    await db.refresh(user)

    return {"id": user.id, "email": user.email, "username": user.username, "is_admin": user.is_admin}
