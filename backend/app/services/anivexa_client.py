"""
Client for the Anivexa API — anime streaming aggregator.
Provides fallback streaming when GogoAnime CDN is down.
Uses AniList IDs for all lookups. Primary provider: anikoto.
"""
import logging
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger("anibinge.anivexa_client")
settings = get_settings()

_base_url = settings.ANIVEXA_BASE_URL

_client = httpx.AsyncClient(base_url=_base_url, timeout=30.0, headers={
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
})

# Providers ordered by reliability
_PROVIDERS = ["anikoto", "animegg", "anineko", "anizone"]


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


async def get_episodes(anilist_id: int, provider: str = "anikoto") -> dict[str, Any]:
    """Get episode list for an anime by AniList ID from a specific provider."""
    return await _get(f"/episodes/{provider}/{anilist_id}")


async def get_stream_data(anilist_id: int, episode: int, provider: str = "anikoto", audio: str = "sub") -> dict[str, Any]:
    """Get streaming data for a specific episode from a provider."""
    data = await _get(f"/watch/{provider}/{anilist_id}/{audio}/{provider}-{episode}")
    if data and not data.get("error"):
        return data
    return {}


async def get_stream_with_fallback(anilist_id: int, episode: int, audio: str = "sub") -> dict[str, Any]:
    """Try multiple providers until one returns a stream. Returns stream URL + subtitles."""
    for provider in _PROVIDERS:
        data = await get_stream_data(anilist_id, episode, provider, audio)
        if data and not data.get("error"):
            m3u8_url, subtitles = _extract_stream_info(data, audio)
            if m3u8_url:
                return {
                    "source": "anivexa",
                    "provider": provider,
                    "stream_url": m3u8_url,
                    "subtitles": subtitles,
                }
    return {}


def _extract_stream_info(data: dict, audio: str) -> tuple[str | None, list[dict]]:
    """Extract M3U8 URL and subtitles from provider response."""
    # anikoto returns {ssub: {streams: [...], subtitles: [...]}}
    ssub = data.get(audio) or data.get("ssub") or data.get("sub") or {}
    if not isinstance(ssub, dict):
        # anizone returns {streams: [...], subtitles: [...]}
        ssub = data

    m3u8_url = None
    streams = ssub.get("streams", [])
    for s in streams:
        if s.get("type") == "hls" and s.get("url"):
            m3u8_url = s["url"]
            break

    # Extract subtitles
    subtitles = []
    raw_subs = ssub.get("subtitles", []) or data.get("subtitles", [])
    for sub in raw_subs:
        if sub.get("file"):
            subtitles.append({
                "file": sub["file"],
                "label": sub.get("label", "Unknown"),
                "language": sub.get("language", "en"),
                "kind": sub.get("kind", "captions"),
                "default": sub.get("default", False),
                "source": sub.get("source", ""),
            })

    return m3u8_url, subtitles


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
