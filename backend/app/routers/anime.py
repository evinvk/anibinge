from fastapi import APIRouter, HTTPException, Query
import httpx
import logging

from app.services import aggregator

logger = logging.getLogger("anibinge.anime")
router = APIRouter(prefix="/api/v1/anime", tags=["anime"])


@router.get("/trending")
async def trending(page: int = Query(1, ge=1)):
    """Get trending anime across all sources."""
    try:
        data = await aggregator.get_trending(page=page)
        return {"data": data}
    except Exception as e:
        logger.error("Trending error: %s", e)
        raise HTTPException(status_code=503, detail="Unable to fetch trending anime")


@router.get("/top-rated")
async def top_rated(page: int = Query(1, ge=1)):
    """Get top-rated anime."""
    try:
        data = await aggregator.get_top(page=page)
        return {"data": data}
    except Exception as e:
        logger.error("Top-rated error: %s", e)
        raise HTTPException(status_code=503, detail="Unable to fetch top-rated anime")


@router.get("/airing")
async def currently_airing(page: int = Query(1, ge=1)):
    """Get currently airing anime."""
    try:
        data = await aggregator.get_schedule(page=page)
        return data
    except Exception as e:
        logger.error("Airing error: %s", e)
        raise HTTPException(status_code=503, detail="Unable to fetch airing anime")


@router.get("/upcoming")
async def upcoming(page: int = Query(1, ge=1)):
    """Get upcoming anime."""
    try:
        # Use MAL's upcoming ranking
        from app.services import mal_client
        data = await mal_client.get_anime_ranking(ranking_type="upcoming", page=page)
        results = [
            {
                "id": x.get("id"),
                "source": "mal",
                "title": x.get("title"),
                "image": x.get("main_picture", {}).get("large"),
                "score": x.get("mean"),
                "episodes": x.get("num_episodes"),
                "status": x.get("status"),
            }
            for x in data.get("data", [])
        ]
        return {"data": results}
    except Exception as e:
        logger.error("Upcoming error: %s", e)
        raise HTTPException(status_code=503, detail="Unable to fetch upcoming anime")


@router.get("/{anime_id}")
async def anime_detail(anime_id: int, source: str = Query("mal")):
    """Get detailed anime information."""
    try:
        data = await aggregator.get_detail(anime_id, source=source)
        return {"data": data}
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Anime not found")
        logger.error("Anime detail upstream error: %s", e)
        raise HTTPException(status_code=502, detail="Upstream data source error")
    except Exception as e:
        logger.error("Anime detail error: %s", e)
        raise HTTPException(status_code=503, detail="Anime data temporarily unavailable")


@router.get("/{anime_id}/characters")
async def anime_characters(anime_id: int):
    """Get characters from an anime."""
    try:
        data = await aggregator.get_characters(anime_id)
        return data
    except Exception as e:
        logger.error("Characters error for anime %s: %s", anime_id, e)
        raise HTTPException(status_code=503, detail="Unable to fetch character data")


@router.get("/{anime_id}/staff")
async def anime_staff(anime_id: int):
    """Get staff information for an anime."""
    try:
        data = await aggregator.get_staff(anime_id)
        return data
    except Exception as e:
        logger.error("Staff error for anime %s: %s", anime_id, e)
        raise HTTPException(status_code=503, detail="Unable to fetch staff data")


@router.get("/{anime_id}/episodes")
async def anime_episodes(anime_id: int, page: int = Query(1, ge=1)):
    """Get episodes for an anime."""
    try:
        from app.services import jikan_client
        # Jikan has the best episode data
        data = await jikan_client.get_anime_episodes(anime_id, page=page)
        return data
    except Exception as e:
        logger.error("Episodes error for anime %s: %s", anime_id, e)
        raise HTTPException(status_code=503, detail="Unable to fetch episode data")


@router.get("/{anime_id}/recommendations")
async def anime_recommendations(anime_id: int, page: int = Query(1, ge=1)):
    """Get recommendations for an anime."""
    try:
        data = await aggregator.get_recommendations(anime_id, page=page)
        return {"data": data}
    except Exception as e:
        logger.error("Recommendations error for anime %s: %s", anime_id, e)
        raise HTTPException(status_code=503, detail="Unable to fetch recommendations")
