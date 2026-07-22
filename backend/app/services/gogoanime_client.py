"""
GogoAnime streaming client — searches anime, fetches episodes, and resolves streaming links.
Uses the gogoanimehd.to JSON API (no browser required).
"""
import logging
from typing import Any

import httpx

logger = logging.getLogger("anibinge.gogoanime")

_BASE_URL = "https://gogoanimehd.to"
_WATCH_URL = "https://gogoanimehd.to/watch"
_TIMEOUT = httpx.Timeout(15.0, connect=10.0)
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html, */*",
    "Referer": _BASE_URL + "/",
}

_client: httpx.AsyncClient | None = None


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS)
    return _client


async def search_anime(query: str) -> list[dict]:
    """Search for anime by title. Returns list of {slug, title, poster, episodes_count, score, type}."""
    client = await _get_client()
    try:
        resp = await client.get(f"{_BASE_URL}/api/search", params={"keyword": query})
        resp.raise_for_status()
        data = resp.json()
        items = data.get("items", [])
        logger.info("GogoAnime search '%s': %d results", query, len(items))
        return items
    except Exception as e:
        logger.warning("GogoAnime search failed for '%s': %s", query, e)
        return []


async def get_episode(slug: str, episode_number: int) -> dict | None:
    """Get episode streaming data. Returns {title, animeTitle, defaultStreamingUrl, hasNextEpisode, hasPrevEpisode}."""
    client = await _get_client()
    try:
        resp = await client.get(f"{_BASE_URL}/api/episode/{slug}/ep-{episode_number}")
        resp.raise_for_status()
        data = resp.json()
        logger.info("GogoAnime episode %s ep-%d fetched", slug, episode_number)
        return data
    except Exception as e:
        logger.warning("GogoAnime episode failed for %s ep-%d: %s", slug, episode_number, e)
        return None


def build_watch_url(slug: str, episode_number: int) -> str:
    """Build the full watch URL for iframe embedding."""
    return f"{_WATCH_URL}/{slug}/ep-{episode_number}"


async def close():
    """Close the httpx client."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
    _client = None
