from fastapi import APIRouter, Query, HTTPException
import httpx

from app.services import aggregator

router = APIRouter(prefix="/api/v1/seasonal", tags=["seasonal"])


@router.get("/current")
async def current_season(page: int = Query(1, ge=1)):
    """Get current season anime."""
    try:
        # Get current season info (would need a utility function to determine)
        # For now, using a fallback approach
        data = await aggregator.get_airing_schedule(page=page)
        return {"data": data["results"], "pagination": data["pagination"]}
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Failed to fetch current season")
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{year}/{season}")
async def season(
    year: int,
    season: str,
    page: int = Query(1, ge=1),
):
    """
    Get anime for a specific season.
    season: winter, spring, summer, fall
    """
    valid_seasons = {"winter", "spring", "summer", "fall"}
    season_lower = season.lower()
    
    if season_lower not in valid_seasons:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid season. Must be one of: {', '.join(valid_seasons)}",
        )
    
    try:
        data = await aggregator.get_seasonal(
            season=season_lower, year=year, page=page
        )
        return {"data": data["results"], "pagination": data["pagination"]}
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Failed to fetch seasonal anime")
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")
