import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_admin_user
from app.models.models import PageView

router = APIRouter(prefix="/api/v1", tags=["analytics"])


class PageViewIn(BaseModel):
    path: str = Field(..., min_length=1, max_length=500)
    referrer: str = Field(default="", max_length=800)
    visitor_id: str = Field(default="", max_length=64)


@router.post("/track/pageview")
async def track_pageview(body: PageViewIn, request: Request, db: AsyncSession = Depends(get_db)):
    """Public beacon: record a page view. Called from the client via sendBeacon."""
    if not body.path.startswith("/"):
        return {"ok": False, "reason": "invalid path"}

    ip = request.client.host if request.client else None
    visitor_id = body.visitor_id or "ip-" + hashlib.sha1((ip or "anon").encode()).hexdigest()[:16]

    row = PageView(
        visitor_id=visitor_id[:64],
        path=body.path[:500],
        referrer=body.referrer[:800] or None,
        user_agent=(request.headers.get("user-agent") or "")[:400] or None,
        ip=ip,
    )
    db.add(row)
    await db.commit()
    return {"ok": True}


@router.get("/admin/analytics/pageviews")
async def analytics_pageviews(
    days: int = Query(14, ge=1, le=90),
    user_id: str = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Per-day visitor/pageview trend plus top pages and referrers (admin only)."""
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
    month_start = start - timedelta(days=30)

    trend_stmt = (
        select(
            func.date_trunc("day", PageView.created_at).label("day"),
            func.count().label("pageviews"),
            func.count(func.distinct(PageView.visitor_id)).label("visitors"),
        )
        .where(PageView.created_at >= start)
        .group_by(func.date_trunc("day", PageView.created_at))
        .order_by(func.date_trunc("day", PageView.created_at))
    )
    trend_rows = (await db.execute(trend_stmt)).all()
    by_day = {r.day.date().isoformat(): {"pageviews": r.pageviews, "visitors": r.visitors} for r in trend_rows}

    trend: list[dict] = []
    for i in range(days):
        day = (start + timedelta(days=i)).date().isoformat()
        entry = by_day.get(day, {"pageviews": 0, "visitors": 0})
        trend.append({"date": day, **entry})

    top_pages_stmt = (
        select(PageView.path, func.count().label("c"))
        .where(PageView.created_at >= month_start)
        .group_by(PageView.path)
        .order_by(func.count().desc())
        .limit(8)
    )
    top_pages = [{"path": r.path, "count": r.c} for r in (await db.execute(top_pages_stmt)).all()]

    top_refs_stmt = (
        select(PageView.referrer, func.count().label("c"))
        .where(PageView.created_at >= month_start, PageView.referrer.isnot(None))
        .where(PageView.referrer.notlike("%anibinge.fun%"))
        .group_by(PageView.referrer)
        .order_by(func.count().desc())
        .limit(6)
    )
    top_referrers = [{"referrer": r.referrer, "count": r.c} for r in (await db.execute(top_refs_stmt)).all()]

    return {"trend": trend, "top_pages": top_pages, "top_referrers": top_referrers}