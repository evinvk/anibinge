from fastapi import APIRouter, Query, HTTPException
import httpx
import asyncio
from datetime import datetime

from app.services import aggregator, wibu_client

router = APIRouter(prefix="/api/v1/schedule", tags=["schedule"])

VALID_DAYS = {
    "monday", "tuesday", "wednesday", "thursday",
    "friday", "saturday", "sunday",
}


@router.get("/weekly")
async def weekly_schedule():
    """
    Fetch airing schedule for the current week.
    Returns anime grouped by airing day.
    """
    try:
        # Get airing schedule from AniList
        data = await aggregator.get_airing_schedule(per_page=100)
        
        # Group by day of week
        by_day = {day: [] for day in VALID_DAYS}
        
        for item in data.get("results", []):
            airing_at = item.get("airing_at")
            if airing_at:
                # Parse Unix timestamp to get day of week
                from datetime import datetime
                dt = datetime.fromtimestamp(airing_at)
                day_name = dt.strftime("%A").lower()
                if day_name in by_day:
                    by_day[day_name].append(item)
        
        return {"data": by_day}
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Failed to fetch schedule")
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{day}")
async def day_schedule(
    day: str,
    tz_offset_minutes: int = Query(0, description="Client UTC offset for local-time display"),
):
    """
    Fetch airing schedule for a specific day.
    day: monday - sunday
    """
    day_lower = day.lower()
    
    if day_lower not in VALID_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid day. Must be one of: {', '.join(sorted(VALID_DAYS))}",
        )
    
    try:
        # Get airing schedule and filter by day
        data = await aggregator.get_airing_schedule(per_page=100)
        
        filtered = []
        for item in data.get("results", []):
            airing_at = item.get("airing_at")
            if airing_at:
                from datetime import datetime
                dt = datetime.fromtimestamp(airing_at)
                current_day = dt.strftime("%A").lower()
                if current_day == day_lower:
                    filtered.append(item)
        
        return {"data": filtered}
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Failed to fetch schedule")
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")
