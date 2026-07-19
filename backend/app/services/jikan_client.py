"""
Client for the Jikan API (unofficial-but-public REST wrapper around
MyAnimeList). This is our PRIMARY data source.

Jikan enforces ~3 req/sec & 60 req/min public rate limits, so every
public method here is wrapped in the Redis `cached()` decorator and
requests share a single httpx.AsyncClient with sane timeouts + retry.
"""
import asyncio
from typing import Any

import httpx

from app.core.cache import cached
from app.core.config import get_settings

settings = get_settings()

_client = httpx.AsyncClient(base_url=settings.JIKAN_BASE_URL, timeout=10.0)


async def _get(path: str, params: dict | None = None, retries: int = 2) -> dict[str, Any]:
    for attempt in range(retries + 1):
        resp = await _client.get(path, params=params or {})
        if resp.status_code == 429 and attempt < retries:
            await asyncio.sleep(1.2 * (attempt + 1))  # backoff on rate limit
            continue
        resp.raise_for_status()
        return resp.json()
    resp.raise_for_status()
    return {}


@cached("jikan:top", ttl=settings.CACHE_TTL_MEDIUM)
async def get_top_anime(page: int = 1, filter_type: str = "airing") -> dict:
    """filter_type: airing | upcoming | bypopularity | favorite"""
    return await _get("/top/anime", {"page": page, "filter": filter_type})


@cached("jikan:seasonal", ttl=settings.CACHE_TTL_MEDIUM)
async def get_seasonal_anime(year: int, season: str, page: int = 1) -> dict:
    return await _get(f"/seasons/{year}/{season}", {"page": page})


@cached("jikan:season_now", ttl=settings.CACHE_TTL_SHORT)
async def get_current_season(page: int = 1) -> dict:
    return await _get("/seasons/now", {"page": page})


@cached("jikan:schedule", ttl=settings.CACHE_TTL_SHORT)
async def get_schedule(day: str | None = None) -> dict:
    """day: monday..sunday, or None for 'other/unknown'"""
    return await _get("/schedules", {"filter": day} if day else {})


@cached("jikan:detail", ttl=settings.CACHE_TTL_MEDIUM)
async def get_anime_full(mal_id: int) -> dict:
    return await _get(f"/anime/{mal_id}/full")


@cached("jikan:characters", ttl=settings.CACHE_TTL_LONG)
async def get_anime_characters(mal_id: int) -> dict:
    return await _get(f"/anime/{mal_id}/characters")


@cached("jikan:staff", ttl=settings.CACHE_TTL_LONG)
async def get_anime_staff(mal_id: int) -> dict:
    return await _get(f"/anime/{mal_id}/staff")


@cached("jikan:recommendations", ttl=settings.CACHE_TTL_LONG)
async def get_anime_recommendations(mal_id: int) -> dict:
    return await _get(f"/anime/{mal_id}/recommendations")


@cached("jikan:episodes", ttl=settings.CACHE_TTL_MEDIUM)
async def get_anime_episodes(mal_id: int, page: int = 1) -> dict:
    return await _get(f"/anime/{mal_id}/episodes", {"page": page})


@cached("jikan:search", ttl=settings.CACHE_TTL_SHORT)
async def search_anime(query: str, page: int = 1, **filters) -> dict:
    """filters may include: genres, status, type, rating, order_by, sort, min_score, start_date, end_date"""
    params = {"q": query, "page": page, **{k: v for k, v in filters.items() if v is not None}}
    return await _get("/anime", params)


@cached("jikan:genres", ttl=settings.CACHE_TTL_LONG)
async def get_genres() -> dict:
    return await _get("/genres/anime")
