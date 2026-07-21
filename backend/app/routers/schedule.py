from fastapi import APIRouter, Query, HTTPException
import asyncio
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
    """Fetch all 7 days of anime schedule in parallel."""
    try:
        # Fetch all days in parallel
        results = await asyncio.gather(
            *[aggregator.get_schedule(day=day) for day in VALID_DAYS],
            return_exceptions=True
        )
        
        # Combine results
        schedule = {}
        for day, result in zip(VALID_DAYS, results):
            if isinstance(result, Exception):
                logger.error("Schedule error for %s: %s", day, result)
                schedule[day] = {"data": []}
            else:
                schedule[day] = result
        
        return schedule
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
