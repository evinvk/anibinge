from fastapi import APIRouter, Query

from app.services import jikan_client

router = APIRouter(prefix="/api/v1/seasonal", tags=["seasonal"])


@router.get("/current")
async def current_season(page: int = Query(1, ge=1)):
    return await jikan_client.get_current_season(page=page)


@router.get("/{year}/{season}")
async def season(year: int, season: str, page: int = Query(1, ge=1)):
    """season: winter | spring | summer | fall"""
    return await jikan_client.get_seasonal_anime(year, season.lower(), page=page)
