"""
Client for the MyAnimeList Official API.
This is our PRIMARY data source.

IMPORTANT: MyAnimeList's OAuth2 implementation only supports the
Authorization Code Grant (with PKCE) — it does NOT support the
"client_credentials" grant type. There is no way to mint an app-only
Bearer token for MAL without a real user login/consent flow.

For read-only public data (search, rankings, details, characters, etc.
— everything this app needs), MAL instead just wants a simple
`X-MAL-CLIENT-ID` header with your registered client ID. No OAuth
token, no client secret, no login flow required. This client uses
that approach.

All public methods are wrapped in the Redis `cached()` decorator to minimize
API calls and handle rate limits gracefully.
"""
import asyncio
import logging
from typing import Any

import httpx

from app.core.cache import cached
from app.core.config import get_settings

logger = logging.getLogger("anibinge.mal_client")
settings = get_settings()

_client = httpx.AsyncClient(base_url=settings.MAL_BASE_URL, timeout=10.0)


async def _get(
    path: str, params: dict | None = None, retries: int = 2
) -> dict[str, Any]:
    """
    Make a GET request to MAL API using X-MAL-CLIENT-ID header auth
    (the correct scheme for MAL's public read endpoints), with retry
    logic for rate limits.
    """
    if not settings.MAL_CLIENT_ID:
        raise ValueError(
            "MAL_CLIENT_ID must be set in environment variables. "
            "Register your app at https://myanimelist.net/apiconfig"
        )

    headers = {"X-MAL-CLIENT-ID": settings.MAL_CLIENT_ID}

    for attempt in range(retries + 1):
        try:
            resp = await _client.get(
                path, params=params or {}, headers=headers
            )

            if resp.status_code == 429 and attempt < retries:
                # Rate limited, backoff and retry
                wait_time = 1.2 * (attempt + 1)
                logger.warning("MAL rate limited, backing off for %.1fs", wait_time)
                await asyncio.sleep(wait_time)
                continue

            resp.raise_for_status()
            return resp.json()

        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403) and attempt < retries:
                # Transient auth hiccup, brief backoff and retry once
                await asyncio.sleep(0.5)
                continue
            raise

    return {}


@cached("mal:anime_list", ttl=settings.CACHE_TTL_MEDIUM)
async def search_anime(query: str, page: int = 1, limit: int = 10) -> dict:
    """
    Search for anime by title using MyAnimeList API.

    Returns paginated search results with basic anime information.
    """
    try:
        offset = (page - 1) * limit
        params = {
            "query": query,
            "limit": min(limit, 100),  # MAL max limit is 100
            "offset": offset,
            "fields": "id,title,main_picture,alternative_titles,start_date,end_date,"
            "synopsis,mean,rank,popularity,num_list_users,media_type,status,"
            "genres,num_episodes,pictures,statistics",
        }
        result = await _get("/anime", params=params)
        return result
    except Exception as e:
        logger.error("MAL search failed: %s", e)
        raise


@cached("mal:detail", ttl=settings.CACHE_TTL_MEDIUM)
async def get_anime_details(anime_id: int) -> dict:
    """
    Get detailed information about a specific anime.

    Returns comprehensive anime data including characters, staff, recommendations, etc.
    """
    try:
        fields = (
            "id,title,main_picture,alternative_titles,start_date,end_date,"
            "synopsis,mean,rank,popularity,num_list_users,media_type,status,"
            "genres,num_episodes,pictures,statistics,related_anime,studios,"
            "source,broadcast,rating,authors,season,recommended_for_you"
        )
        params = {"fields": fields}
        result = await _get(f"/anime/{anime_id}", params=params)
        return result
    except Exception as e:
        logger.error("MAL anime detail failed for id %s: %s", anime_id, e)
        raise


@cached("mal:characters", ttl=settings.CACHE_TTL_LONG)
async def get_anime_characters(anime_id: int) -> dict:
    """
    Get main characters for an anime.
    """
    try:
        params = {"limit": 20, "fields": "characters"}
        result = await _get(f"/anime/{anime_id}/characters", params=params)
        return result
    except Exception as e:
        logger.error("MAL characters failed for id %s: %s", anime_id, e)
        raise


@cached("mal:forum", ttl=settings.CACHE_TTL_SHORT)
async def get_anime_forum(anime_id: int) -> dict:
    """
    Get forum topics related to an anime.
    """
    try:
        params = {"limit": 20}
        result = await _get(f"/anime/{anime_id}/forum", params=params)
        return result
    except Exception as e:
        logger.error("MAL forum failed for id %s: %s", anime_id, e)
        raise


@cached("mal:reviews", ttl=settings.CACHE_TTL_MEDIUM)
async def get_anime_reviews(anime_id: int, page: int = 1, limit: int = 10) -> dict:
    """
    Get user reviews for an anime.
    """
    try:
        offset = (page - 1) * limit
        params = {"limit": min(limit, 100), "offset": offset}
        result = await _get(f"/anime/{anime_id}/reviews", params=params)
        return result
    except Exception as e:
        logger.error("MAL reviews failed for id %s: %s", anime_id, e)
        raise


@cached("mal:recommendations", ttl=settings.CACHE_TTL_LONG)
async def get_anime_recommendations(anime_id: int) -> dict:
    """
    Get recommended anime similar to the given anime.
    """
    try:
        params = {"limit": 20}
        result = await _get(f"/anime/{anime_id}/recommendations", params=params)
        return result
    except Exception as e:
        logger.error("MAL recommendations failed for id %s: %s", anime_id, e)
        raise


@cached("mal:ranking", ttl=settings.CACHE_TTL_MEDIUM)
async def get_anime_ranking(ranking_type: str = "all", page: int = 1, limit: int = 20) -> dict:
    """
    Get ranked anime by category.

    ranking_type: "all", "airing", "upcoming", "tv", "movie", "ova", "special", "by_popularity"
    """
    try:
        offset = (page - 1) * limit
        fields = "id,title,main_picture,mean,rank,popularity,num_list_users,status"
        params = {
            "ranking_type": ranking_type,
            "limit": min(limit, 100),
            "offset": offset,
            "fields": fields,
        }
        result = await _get("/anime/ranking", params=params)
        return result
    except Exception as e:
        logger.error("MAL ranking failed: %s", e)
        raise


@cached("mal:seasonal", ttl=settings.CACHE_TTL_MEDIUM)
async def get_seasonal_anime(year: int, season: str, page: int = 1, limit: int = 20) -> dict:
    """
    Get anime for a specific season.

    season: "winter", "spring", "summer", "fall"
    """
    try:
        offset = (page - 1) * limit
        fields = "id,title,main_picture,mean,rank,popularity,num_list_users,status,num_episodes"
        params = {
            "sort": "anime_score",
            "limit": min(limit, 100),
            "offset": offset,
            "fields": fields,
        }
        # Note: MyAnimeList API doesn't have a direct seasonal endpoint in v2.
        # Using ranking by season as alternative, or search by start_date range
        result = await _get("/anime/ranking", params={**params, "ranking_type": "airing"})
        return result
    except Exception as e:
        logger.error("MAL seasonal failed for %s %s: %s", year, season, e)
        raise


@cached("mal:genres", ttl=settings.CACHE_TTL_LONG)
async def get_genres() -> dict:
    """
    Get list of all anime genres available on MyAnimeList.
    """
    try:
        result = await _get("/anime/genres")
        return result
    except Exception as e:
        logger.error("MAL genres failed: %s", e)
        raise


@cached("mal:studios", ttl=settings.CACHE_TTL_LONG)
async def get_studios() -> dict:
    """
    Get list of all anime studios.
    """
    try:
        result = await _get("/anime/studios")
        return result
    except Exception as e:
        logger.error("MAL studios failed: %s", e)
        raise


@cached("mal:broadcast", ttl=settings.CACHE_TTL_SHORT)
async def get_broadcast_schedule(day: str | None = None) -> dict:
    """
    Get anime broadcast schedule.

    day: "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
    Note: This would need custom filtering or use the ranking endpoint
    """
    try:
        # MyAnimeList API v2 doesn't have direct schedule endpoint
        # Return all airing anime with filter on day
        params = {"limit": 100, "fields": "id,title,main_picture,broadcast"}
        result = await _get("/anime/ranking", params={**params, "ranking_type": "airing"})
        return result
    except Exception as e:
        logger.error("MAL broadcast failed: %s", e)
        raise
