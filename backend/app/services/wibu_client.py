"""
Client for the Wibu API (anime streaming provider).
Handles episode lists, streaming sources, subtitles, and related metadata.

Wibu provides multiple streaming servers and qualities for anime episodes.
No authentication required for public data.
"""
import asyncio
import logging
from typing import Any
from datetime import datetime, timedelta

import httpx

from app.core.cache import cached
from app.core.config import get_settings

logger = logging.getLogger("anibinge.wibu_client")
settings = get_settings()

_client = httpx.AsyncClient(base_url="https://api.wibuapi.com/v1", timeout=10.0)


async def _get(
    path: str, params: dict | None = None, retries: int = 2
) -> dict[str, Any]:
    """
    Make GET request to Wibu API with retry logic for rate limits.
    """
    for attempt in range(retries + 1):
        try:
            resp = await _client.get(path, params=params or {})

            if resp.status_code == 429 and attempt < retries:
                # Rate limited, backoff and retry
                wait_time = 1.2 * (attempt + 1)
                logger.warning("Wibu rate limited, backing off for %.1fs", wait_time)
                await asyncio.sleep(wait_time)
                continue

            resp.raise_for_status()
            return resp.json()

        except httpx.HTTPStatusError as e:
            logger.error("Wibu API error: %s", e)
            if attempt >= retries:
                raise

    return {}


@cached("wibu:episodes", ttl=settings.CACHE_TTL_MEDIUM)
async def get_anime_episodes(anime_id: int, page: int = 1) -> dict:
    """
    Get episode list for an anime with streaming sources.

    Returns paginated list of episodes with available streams, subtitles, etc.
    """
    try:
        params = {"page": page, "limit": 20}
        result = await _get(f"/anime/{anime_id}/episodes", params=params)
        return result
    except Exception as e:
        logger.error("Wibu episodes failed for anime %s: %s", anime_id, e)
        return {"data": [], "error": str(e)}


@cached("wibu:episode_detail", ttl=settings.CACHE_TTL_MEDIUM)
async def get_episode_detail(anime_id: int, episode_number: int) -> dict:
    """
    Get detailed information about a specific episode including streaming sources.

    Returns:
    - Episode metadata
    - Multiple server sources (streaming links)
    - Available subtitles and languages
    - Quality options
    """
    try:
        result = await _get(f"/anime/{anime_id}/episode/{episode_number}")
        return result
    except Exception as e:
        logger.error("Wibu episode detail failed for anime %s ep %s: %s", anime_id, episode_number, e)
        return {"error": str(e)}


@cached("wibu:sources", ttl=settings.CACHE_TTL_SHORT)
async def get_episode_sources(
    anime_id: int, episode_number: int, server: str | None = None
) -> dict:
    """
    Get streaming sources for an episode.

    server: specific server to fetch from (e.g., "vidstream", "streamtape", "doodstream")
    If not specified, returns all available servers.

    Returns:
    - List of servers with links
    - Quality options per server
    - Subtitle tracks
    """
    try:
        params = {}
        if server:
            params["server"] = server
        result = await _get(f"/anime/{anime_id}/episode/{episode_number}/sources", params=params)
        return result
    except Exception as e:
        logger.error("Wibu sources failed: %s", e)
        return {"sources": [], "error": str(e)}


@cached("wibu:subtitles", ttl=settings.CACHE_TTL_MEDIUM)
async def get_episode_subtitles(anime_id: int, episode_number: int) -> dict:
    """
    Get available subtitle tracks for an episode.

    Returns subtitle options in various languages with download URLs.
    """
    try:
        result = await _get(f"/anime/{anime_id}/episode/{episode_number}/subtitles")
        return result
    except Exception as e:
        logger.error("Wibu subtitles failed: %s", e)
        return {"subtitles": [], "error": str(e)}


@cached("wibu:servers", ttl=settings.CACHE_TTL_LONG)
async def get_available_servers() -> dict:
    """
    Get list of all available streaming servers on Wibu.

    Returns metadata about each server (name, reliability, quality, speed, etc).
    """
    try:
        result = await _get("/servers")
        return result
    except Exception as e:
        logger.error("Wibu servers list failed: %s", e)
        return {"servers": [], "error": str(e)}


@cached("wibu:search", ttl=settings.CACHE_TTL_SHORT)
async def search_anime(query: str, page: int = 1) -> dict:
    """
    Search for anime on Wibu by title.

    Returns basic anime info for search results.
    """
    try:
        params = {"q": query, "page": page, "limit": 20}
        result = await _get("/search", params=params)
        return result
    except Exception as e:
        logger.error("Wibu search failed: %s", e)
        return {"data": [], "error": str(e)}


@cached("wibu:anime_info", ttl=settings.CACHE_TTL_MEDIUM)
async def get_anime_info(anime_id: int) -> dict:
    """
    Get anime information from Wibu (typically less detailed than MAL/AniList).

    Useful for confirmation and as fallback metadata.
    """
    try:
        result = await _get(f"/anime/{anime_id}")
        return result
    except Exception as e:
        logger.error("Wibu anime info failed for id %s: %s", anime_id, e)
        return {"error": str(e)}


@cached("wibu:recent", ttl=settings.CACHE_TTL_SHORT)
async def get_recent_episodes(page: int = 1, limit: int = 20) -> dict:
    """
    Get recently uploaded episodes across all anime.

    Useful for "Latest Episodes" section on homepage.
    """
    try:
        params = {"page": page, "limit": limit}
        result = await _get("/recent-episodes", params=params)
        return result
    except Exception as e:
        logger.error("Wibu recent episodes failed: %s", e)
        return {"data": [], "error": str(e)}


@cached("wibu:trending", ttl=settings.CACHE_TTL_SHORT)
async def get_trending_anime(page: int = 1, limit: int = 20) -> dict:
    """
    Get trending anime on Wibu (based on streaming views).

    Alternative ranking for "What's Popular" sections.
    """
    try:
        params = {"page": page, "limit": limit}
        result = await _get("/trending", params=params)
        return result
    except Exception as e:
        logger.error("Wibu trending failed: %s", e)
        return {"data": [], "error": str(e)}


async def get_stream_url(anime_id: int, episode_number: int, server: str = "vidstream") -> dict:
    """
    Get a direct streaming URL for an episode from a specific server.

    This is typically used by the frontend to embed or redirect to the stream.
    
    server: streaming server choice (vidstream, streamtape, doodstream, etc.)
    """
    try:
        sources = await get_episode_sources(anime_id, episode_number, server=server)
        if sources.get("sources") and len(sources["sources"]) > 0:
            return sources["sources"][0]
        return {"error": f"No sources available for {server}"}
    except Exception as e:
        logger.error("Get stream URL failed: %s", e)
        return {"error": str(e)}
