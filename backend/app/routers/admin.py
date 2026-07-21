from fastapi import APIRouter, Depends

from app.core.cache import invalidate_prefix
from app.core.security import get_current_user_id

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# NOTE: in production, swap get_current_user_id for a get_current_admin_user
# dependency that also checks a `role == "admin"` claim/DB flag.


@router.get("/analytics/overview")
async def analytics_overview(user_id: str = Depends(get_current_user_id)):
    # TODO: aggregate from Postgres (daily active users, top searches,
    # most-watchlisted anime) — placeholder shape shown for the frontend.
    return {
        "daily_active_users": 0,
        "total_users": 0,
        "total_watchlist_entries": 0,
        "top_searches_today": [],
        "requests_last_24h": 0,
    }


@router.get("/api-monitoring")
async def api_monitoring(user_id: str = Depends(get_current_user_id)):
    # TODO: pull from a Prometheus/logging sink; placeholder response.
    return {
        "anilist": {"status": "healthy", "avg_latency_ms": 0, "error_rate": 0.0},
        "wibu": {"status": "healthy", "avg_latency_ms": 0, "error_rate": 0.0},
    }


@router.post("/cache/invalidate/{prefix}")
async def invalidate_cache(prefix: str, user_id: str = Depends(get_current_user_id)):
    deleted = await invalidate_prefix(prefix)
    return {"invalidated_keys": deleted, "prefix": prefix}
