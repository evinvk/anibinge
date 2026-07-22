"""
Client for the Anivexa API — anime streaming aggregator.
Provides fallback streaming when GogoAnime CDN is down.
Uses AniList IDs for all lookups.
"""
import logging
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger("anibinge.anivexa_client")
settings = get_settings()

_base_url = "https://anivexa.vercel.app"

_client = httpx.AsyncClient(base_url=_base_url, timeout=20.0, headers={
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
})


async def _get(path: str, params: dict | None = None) -> dict[str, Any]:
    try:
        resp = await _client.get(path, params=params or {})
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        logger.warning("Anivexa %s returned %s", path, e.response.status_code)
        return {}
    except Exception as e:
        logger.error("Anivexa request failed: %s", e)
        return {}


async def search_anime(query: str) -> list[dict]:
    """Search for anime on Reanime (used as title-to-AniList resolver)."""
    try:
        resp = await _client.get(
            "/api/v1/search",
            params={"q": query, "limit": 5},
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("results", []) if isinstance(data, dict) else []
    except Exception as e:
        logger.error("Anivexa search failed: %s", e)
        return []


async def get_episodes(anilist_id: int) -> dict[str, Any]:
    """Get episode list for an anime by AniList ID."""
    return await _get(f"/episodes/{anilist_id}")


async def get_stream_url(anilist_id: int, episode: int, audio: str = "sub") -> dict[str, Any]:
    """
    Get streaming URL for a specific episode.
    Returns JSON with stream_url (M3U8), subtitles, chapters, etc.
    """
    return await _get(f"/watch/reanime/{anilist_id}/{audio}/reanime-{episode}")


async def get_stream_redirect(anilist_id: int, episode: int, audio: str = "sub") -> str | None:
    """
    Get direct M3U8 redirect URL for an episode.
    Returns the M3U8 URL by following the 302 redirect.
    """
    try:
        resp = await _client.get(
            f"/stream/reanime/{anilist_id}/{audio}/{episode}",
            follow_redirects=False,
        )
        if resp.status_code == 302:
            return resp.headers.get("Location")
        if resp.status_code == 200:
            data = resp.json()
            return data.get("stream_url")
        return None
    except Exception as e:
        logger.error("Anivexa stream redirect failed: %s", e)
        return None


async def get_stream_data(anilist_id: int, episode: int, audio: str = "sub") -> dict[str, Any]:
    """
    Get full streaming data for an episode (stream URL, subtitles, chapters).
    """
    return await _get(f"/watch/reanime/{anilist_id}/{audio}/reanime-{episode}")


async def health_check() -> bool:
    """Check if the Anivexa API is reachable."""
    try:
        resp = await _client.get("/", timeout=5.0)
        return resp.status_code == 200
    except Exception:
        return False


async def close():
    """Close the HTTP client."""
    await _client.aclose()
