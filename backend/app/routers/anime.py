from fastapi import APIRouter, HTTPException, Query
import httpx

from app.services import aggregator, jikan_client

router = APIRouter(prefix="/api/v1/anime", tags=["anime"])


@router.get("/trending")
async def trending(page: int = Query(1, ge=1)):
    return {"data": await aggregator.get_trending(page=page)}


@router.get("/top-rated")
async def top_rated(page: int = Query(1, ge=1)):
    data = await jikan_client.get_top_anime(page=page, filter_type="favorite")
    return data


@router.get("/airing")
async def currently_airing(page: int = Query(1, ge=1)):
    data = await jikan_client.get_top_anime(page=page, filter_type="airing")
    return data


@router.get("/upcoming")
async def upcoming(page: int = Query(1, ge=1)):
    data = await jikan_client.get_top_anime(page=page, filter_type="upcoming")
    return data


@router.get("/{mal_id}")
async def anime_detail(mal_id: int, source: str = Query("jikan")):
    try:
        data = await aggregator.get_detail(mal_id, source=source)
        return {"data": data}
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            # Upstream (Jikan/AniList) genuinely has no record for this id.
            raise HTTPException(status_code=404, detail="Anime not found")
        # Upstream returned an error (rate-limited, 5xx, etc.) — temporary,
        # not a real 404, so let the frontend show a "try again" message.
        raise HTTPException(status_code=502, detail="Upstream data source error")
    except Exception:
        # Timeout, connection error, or anything else unexpected — also
        # temporary, so don't tell the user the anime doesn't exist.
        raise HTTPException(status_code=503, detail="Anime data temporarily unavailable")


@router.get("/{mal_id}/characters")
async def anime_characters(mal_id: int):
    return await jikan_client.get_anime_characters(mal_id)


@router.get("/{mal_id}/staff")
async def anime_staff(mal_id: int):
    return await jikan_client.get_anime_staff(mal_id)


@router.get("/{mal_id}/episodes")
async def anime_episodes(mal_id: int, page: int = Query(1, ge=1)):
    return await jikan_client.get_anime_episodes(mal_id, page=page)


@router.get("/{mal_id}/recommendations")
async def anime_recommendations(mal_id: int):
    return await jikan_client.get_anime_recommendations(mal_id)
