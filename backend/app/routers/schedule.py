from fastapi import APIRouter, Query, HTTPException
import logging

from app.services import aggregator

logger = logging.getLogger("anibinge.schedule")
router = APIRouter(prefix="/api/v1/schedule", tags=["schedule"])

VALID_DAYS = {
    "monday", "tuesday", "wednesday", "thursday",
    "friday", "saturday", "sunday",
}


@router.get("/weekly")
async def weekly_schedule():
    """Fetch the full weekly schedule, grouped by broadcast day.

    Uses a single Jikan call to get all schedules, then groups anime by
    their broadcast.day field. When Jikan is unavailable, falls back to
    MAL airing ranking distributed across all days.
    """
    try:
        result = await aggregator.get_weekly_schedule()
        raw = result.get("data", {})
        fallback = result.get("fallback")

        # If all days are empty but we have fallback data, distribute it
        if not any(raw.get(d) for d in VALID_DAYS) and fallback:
            for item in fallback:
                for d in VALID_DAYS:
                    raw.setdefault(d, []).append(item)
            logger.info("Distributed %d fallback items across all days", len(fallback))

        return {day: {"data": items} for day, items in raw.items()}
    except Exception as e:
        logger.error("Weekly schedule error: %s", e)
        raise HTTPException(status_code=503, detail="Unable to fetch weekly schedule")


@router.get("/{day}")
async def day_schedule(
    day: str,
    tz_offset_minutes: int = Query(0, description="Client UTC offset for local-time display")
):
    """Get anime schedule for a specific day.
    
    day: monday | tuesday | wednesday | thursday | friday | saturday | sunday
    """
    try:
        day_lower = day.lower()
        if day_lower not in VALID_DAYS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid day. Must be one of: {', '.join(sorted(VALID_DAYS))}"
            )
        
        result = await aggregator.get_schedule(day=day_lower)
        return {**result, "day": day_lower, "tz_offset_minutes": tz_offset_minutes}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Schedule error for %s: %s", day, e)
        raise HTTPException(status_code=503, detail="Unable to fetch schedule")
