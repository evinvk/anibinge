from fastapi import APIRouter, Query

from app.services import jikan_client

router = APIRouter(prefix="/api/v1/schedule", tags=["schedule"])

VALID_DAYS = {
    "monday", "tuesday", "wednesday", "thursday",
    "friday", "saturday", "sunday",
}


@router.get("/weekly")
async def weekly_schedule():
    """Fetch all 7 days in parallel-ish (sequential w/ cache, cheap after warm)."""
    import asyncio

    results = await asyncio.gather(
        *[jikan_client.get_schedule(day) for day in VALID_DAYS]
    )
    return dict(zip(VALID_DAYS, results))


@router.get("/{day}")
async def day_schedule(day: str, tz_offset_minutes: int = Query(0, description="Client UTC offset for local-time display")):
    day = day.lower()
    if day not in VALID_DAYS:
        return {"error": "invalid day", "valid_days": sorted(VALID_DAYS)}
    return await jikan_client.get_schedule(day)
