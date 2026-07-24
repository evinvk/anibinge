"""
Client for the Anivexa API — anime streaming aggregator.
Provides fallback streaming when GogoAnime CDN is down.
Uses AniList IDs for all lookups. Primary provider: anikoto.
"""
import logging
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.http import get_shared_client

logger = logging.getLogger("anibinge.anivexa_client")
settings = get_settings()

_base_url = settings.ANIVEXA_BASE_URL

_client = get_shared_client(timeout=30.0, headers={
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
})

# Providers ordered by reliability
# anikoto: HLS from megap.kotocdn.site (may return PNGs) + embed from megaplay.buzz
# anibd: HLS from playeng.animeapps.top (may be broken R2) + embed from playeng.animeapps.top
# animegg: HLS from animegg.org (may 500)
# anidbapp: HLS from hls.anidb.app (may 403) + embed from anidb.app
# anineko: HLS from vivibebe.site (ad-heavy)
# anizone: returns 500
# senshi, kaa, animenosub, allmanga, reanime: return 500
_PROVIDERS = ["anikoto", "anibd", "animegg", "anidbapp", "anineko", "anizone"]


async def _get(path: str, params: dict | None = None) -> dict[str, Any]:
    try:
        url = f"{_base_url}{path}"
        resp = await _client.get(url, params=params or {})
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
    """Try multiple providers until one returns a stream. Returns stream URL + subtitles + embed URL."""
    for provider in _PROVIDERS:
        data = await get_stream_data(anilist_id, episode, provider, audio)
        if data and not data.get("error"):
            m3u8_url, subtitles, m3u8_referer, embed_url = _extract_stream_info(data, audio)
            if m3u8_url or embed_url:
                return {
                    "source": "anivexa",
                    "provider": provider,
                    "stream_url": m3u8_url,
                    "referer": m3u8_referer,
                    "embed_url": embed_url,
                    "subtitles": subtitles,
                }
    return {}


def _extract_stream_info(data: dict, audio: str) -> tuple[str | None, list[dict], str | None, str | None]:
    """Extract M3U8 URL, subtitles, referer, and embed URL from provider response."""
    # anikoto returns {ssub: {streams: [...], subtitles: [...]}}
    ssub = data.get(audio) or data.get("ssub") or data.get("sub") or {}
    if not isinstance(ssub, dict):
        # anizone returns {streams: [...], subtitles: [...]}
        ssub = data

    m3u8_url = None
    m3u8_referer = None
    embed_url = None
    embed_referer = None
    streams = ssub.get("streams", [])
    for s in streams:
        if s.get("type") == "hls" and s.get("url") and not m3u8_url:
            m3u8_url = s["url"]
            m3u8_referer = s.get("referer")
        if s.get("type") == "embed" and s.get("url") and not embed_url:
            embed_url = s["url"]
            embed_referer = s.get("referer")
        if m3u8_url and embed_url:
            break

    # Extract subtitles with referer from matching stream source
    subtitles = []
    raw_subs = ssub.get("subtitles", []) or data.get("subtitles", [])
    # Build source→referer map from streams
    source_referer: dict[str, str] = {}
    for s in streams:
        srv = s.get("server", "").replace("-embed", "")
        if srv and s.get("referer"):
            source_referer[srv] = s["referer"]
    for sub in raw_subs:
        if sub.get("file"):
            sub_source = sub.get("source", "")
            referer = source_referer.get(sub_source, "")
            subtitles.append({
                "file": sub["file"],
                "label": sub.get("label", "Unknown"),
                "language": sub.get("language", "en"),
                "kind": sub.get("kind", "captions"),
                "default": sub.get("default", False),
                "source": sub_source,
                "referer": referer,
            })

    return m3u8_url, subtitles, m3u8_referer, embed_url


async def health_check() -> bool:
    """Check if the Anivexa API is reachable."""
    try:
        resp = await _client.get(_base_url, timeout=5.0)
        return resp.status_code == 200
    except Exception:
        return False


async def close():
    """Close the HTTP client."""
    await _client.aclose()
