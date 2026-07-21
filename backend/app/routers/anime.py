from fastapi import APIRouter, HTTPException, Query
import httpx

from app.services import aggregator

router = APIRouter(prefix="/api/v1/anime", tags=["anime"])


@router.get("/trending")
async def trending(page: int = Query(1, ge=1)):
    """Get trending anime."""
    try:
        data = await aggregator.get_trending(page=page)
        return {"data": data["results"], "pagination": data["pagination"]}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail="Failed to fetch trending anime")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/popular")
async def popular(page: int = Query(1, ge=1)):
    """Get popular anime."""
    try:
        data = await aggregator.get_popular(page=page)
        return {"data": data["results"], "pagination": data["pagination"]}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail="Failed to fetch popular anime")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/airing")
async def currently_airing(page: int = Query(1, ge=1)):
    """Get currently airing anime."""
    try:
        data = await aggregator.get_airing_schedule(page=page, per_page=20)
        return {"data": data["results"], "pagination": data["pagination"]}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail="Failed to fetch airing anime")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{anime_id}")
async def anime_detail(anime_id: int):
    """Get detailed anime information."""
    try:
        data = await aggregator.get_anime_detail(anime_id)
        return {"data": data}
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Anime not found")
        raise HTTPException(status_code=502, detail="Upstream data source error")
    except Exception as e:
        raise HTTPException(status_code=503, detail="Anime data temporarily unavailable")


@router.get("/{anime_id}/characters")
async def anime_characters(anime_id: int):
    """Get anime characters with voice actors."""
    try:
        data = await aggregator.get_characters(anime_id)
        return {"data": data["characters"]}
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Anime not found")
        raise HTTPException(status_code=502, detail="Upstream data source error")
    except Exception as e:
        raise HTTPException(status_code=503, detail="Character data temporarily unavailable")


@router.get("/{anime_id}/staff")
async def anime_staff(anime_id: int):
    """Get anime staff (directors, writers, etc)."""
    try:
        data = await aggregator.get_staff(anime_id)
        return {"data": data["staff"]}
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Anime not found")
        raise HTTPException(status_code=502, detail="Upstream data source error")
    except Exception as e:
        raise HTTPException(status_code=503, detail="Staff data temporarily unavailable")


@router.get("/{anime_id}/recommendations")
async def anime_recommendations(anime_id: int):
    """Get anime recommendations."""
    try:
        data = await aggregator.get_recommendations(anime_id)
        return {"data": data["recommendations"]}
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Anime not found")
        raise HTTPException(status_code=502, detail="Upstream data source error")
    except Exception as e:
        raise HTTPException(status_code=503, detail="Recommendations temporarily unavailable")
