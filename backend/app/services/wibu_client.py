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
from app.core.http import get_shared_client

logger = logging.getLogger("anibinge.wibu_client")
settings = get_settings()

_client = get_shared_client(timeout=10.0)
_WIBU_BASE = "https://api.wibuapi.com/v1"


async def _get(
    path: str, params: dict | None = None, retries: int = 2
) -> dict[str, Any]:
    """
    Make GET request to Wibu API with retry logic for rate limits.
    """
    for attempt in range(retries + 1):
        try:
            url = f"{_WIBU_BASE}{path}"
            resp = await _client.get(url, params=params or {})

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


async def get_stream_data(anime_id: int, episode_number: int, server: str = "vidstream") -> dict:
    """
    Get normalized streaming data from Wibu API.
    Returns format compatible with anivexa_client output:
    {
        "source": "wibu",
        "provider": "vidstream",
        "stream_url": "https://...",
        "stream_type": "hls" | "mp4",
        "referer": "",
        "embed_url": null,
        "subtitles": [...],
    }
    """
    try:
        sources = await get_episode_sources(anime_id, episode_number, server=server)
        if "error" in sources and not sources.get("sources"):
            # Try other servers
            for fallback_server in ["streamtape", "doodstream", "mp4upload"]:
                if fallback_server == server:
                    continue
                sources = await get_episode_sources(anime_id, episode_number, server=fallback_server)
                if sources.get("sources"):
                    server = fallback_server
                    break
            else:
                return {}

        if not sources.get("sources"):
            return {}

        stream_url = None
        stream_type = "hls"
        embed_url = None

        for src in sources.get("sources", []):
            url = src.get("url", "")
            src_type = src.get("type", "")
            if not url:
                continue
            if src_type == "embed":
                if not embed_url:
                    embed_url = url
            elif "m3u8" in url or "hls" in src_type:
                if not stream_url:
                    stream_url = url
                    stream_type = "hls"
            elif "mp4" in url or src_type == "mp4":
                if not stream_url:
                    stream_url = url
                    stream_type = "mp4"
            else:
                if not stream_url:
                    stream_url = url

        # Get subtitles
        subtitles_data = await get_episode_subtitles(anime_id, episode_number)
        subtitles = []
        for sub in subtitles_data.get("subtitles", []):
            if sub.get("url"):
                subtitles.append({
                    "file": sub["url"],
                    "label": sub.get("label", sub.get("lang", "Unknown")),
                    "language": sub.get("language", sub.get("lang", "en")),
                    "kind": "captions",
                    "default": sub.get("default", sub.get("lang", "").lower().startswith("english")),
                    "source": "wibu",
                    "referer": "",
                })

        if stream_url or embed_url:
            return {
                "source": "wibu",
                "provider": server,
                "stream_url": stream_url,
                "stream_type": stream_type,
                "referer": "",
                "embed_url": embed_url,
                "subtitles": subtitles,
            }
        return {}
    except Exception as e:
        logger.error("Wibu get_stream_data failed: %s", e)
        return {}


async def search_and_get_stream(query: str, episode: int, server: str = "vidstream") -> dict:
    """
    Search Wibu by title, then get stream data for the episode.
    Returns normalized stream data or empty dict.
    """
    try:
        search_result = await search_anime(query)
        results = search_result.get("data", [])
        if not results:
            return {}

        # Use the first match
        anime_id = results[0].get("id")
        if not anime_id:
            return {}

        return await get_stream_data(anime_id, episode, server)
    except Exception as e:
        logger.error("Wibu search_and_get_stream failed: %s", e)
        return {}
