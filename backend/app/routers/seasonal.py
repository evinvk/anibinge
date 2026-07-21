from fastapi import APIRouter, Query, HTTPException
import logging
from datetime import datetime

from app.services import aggregator

logger = logging.getLogger("anibinge.seasonal")
router = APIRouter(prefix="/api/v1/seasonal", tags=["seasonal"])


VALID_SEASONS = {"winter", "spring", "summer", "fall"}


@router.get("/current")
async def current_season(page: int = Query(1, ge=1)):
    """Get current season anime."""
    try:
        current_year = datetime.now().year
        # Determine current season
        month = datetime.now().month
        if month in [12, 1, 2]:
            season = "winter"
        elif month in [3, 4, 5]:
            season = "spring"
        elif month in [6, 7, 8]:
            season = "summer"
        else:
            season = "fall"
        
        data = await aggregator.get_seasonal(current_year, season, page=page)
        return {"data": data, "season": season, "year": current_year}
    except Exception as e:
        logger.error("Current season error: %s", e)
        raise HTTPException(status_code=503, detail="Unable to fetch current season anime")


@router.get("/{year}/{season}")
async def season(year: int, season: str, page: int = Query(1, ge=1)):
    """Get anime for a specific season.
    
    season: winter | spring | summer | fall
    """
    try:
        season_lower = season.lower()
        if season_lower not in VALID_SEASONS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid season. Must be one of: {', '.join(VALID_SEASONS)}"
            )
        
        # Validate year (reasonable bounds)
        if year < 1917 or year > datetime.now().year + 2:
            raise HTTPException(
                status_code=400,
                detail="Year must be between 1917 and current year + 2"
            )
        
        data = await aggregator.get_seasonal(year, season_lower, page=page)
        return {"data": data, "season": season_lower, "year": year}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Seasonal error for %s %s: %s", season, year, e)
        raise HTTPException(status_code=503, detail="Unable to fetch seasonal anime")
