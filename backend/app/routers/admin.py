from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_prefix
from app.core.db import get_db
from app.core.security import get_current_admin_user
from app.core.circuit_breaker import all_breakers
from app.models.models import User, WatchlistEntry

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
