"""
Client for the Anivexa API — anime streaming aggregator.
Provides fallback streaming when GogoAnime CDN is down.
Uses AniList IDs for all lookups. Primary: Animetsu (anipm/kwik), fallback: Anivexa providers.
"""
import logging
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.http import get_shared_client
from app.services import anitsu_client

logger = logging.getLogger("anibinge.anivexa_client")
settings = get_settings()

_base_url = settings.ANIVEXA_BASE_URL

_client = get_shared_client(timeout=30.0, headers={
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
})

# Anivexa providers ordered by reliability (used as fallback after Animetsu)
# anidbapp: HLS from hls.anidb.app (MPEG-TS, may freeze with hls.js transmuxer)
# anikoto: HLS from megap.kotocdn.site (mixed with ads) + subtitles
# animegg: Direct MP4 from vidcache.net (reliable but deprioritized per user request)
# anibd: HLS from playeng.animeapps.top (broken R2)
# anineko: HLS from vivibebe.site (all ad PNGs)
# anizone: returns 500
# senshi, kaa, animenosub, allmanga, reanime: return 500
_PROVIDERS = ["anidbapp", "anikoto", "animegg", "anibd", "anineko", "anizone"]


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


async def get_stream_with_fallback(anilist_id: int, episode: int, audio: str = "sub", skip_anitsu: bool = False) -> dict[str, Any]:
    """Try multiple providers until one returns a stream. Returns stream URL + subtitles + embed URL.
    
    Priority order:
    1. Animetsu (anipm/animeyubi) — multi-provider aggregator with HLS/MP4 + subtitles
    2. Anivexa providers (anidbapp, anikoto, animegg, etc.) — legacy fallback
    Set skip_anitsu=True to only try Anivexa providers (for multi-source fallback chains).
    """
    # 1. Try Animetsu first (anipm, animeyubi — best quality, subtitles, skip markers)
    if not skip_anitsu:
        try:
            result = await anitsu_client.get_stream(anilist_id, episode)
            if result and result.get("stream_url"):
                logger.info("Animetsu stream found: %s via %s", result.get("stream_type"), result.get("provider"))
                return result
        except Exception as e:
            logger.warning("Animetsu failed for al:%d ep%d: %s", anilist_id, episode, e)

    # 2. Fall back to Anivexa providers
    for provider in _PROVIDERS:
        data = await get_stream_data(anilist_id, episode, provider, audio)
        if data and not data.get("error"):
            m3u8_url, subtitles, m3u8_referer, embed_url, stream_type = _extract_stream_info(data, audio)
            if m3u8_url or embed_url:
                # If provider doesn't have subtitles, try to get them from anikoto
                if not subtitles and provider != "anikoto":
                    try:
                        anikoto_data = await get_stream_data(anilist_id, episode, "anikoto", audio)
                        if anikoto_data and not anikoto_data.get("error"):
                            _, anikoto_subs, _, _, _ = _extract_stream_info(anikoto_data, audio)
                            if anikoto_subs:
                                subtitles = anikoto_subs
                    except Exception:
                        pass
                return {
                    "source": "anivexa",
                    "provider": provider,
                    "stream_url": m3u8_url,
                    "stream_type": stream_type,
                    "referer": m3u8_referer,
                    "embed_url": embed_url,
                    "subtitles": subtitles,
                }
    return {}


def _extract_stream_info(data: dict, audio: str) -> tuple[str | None, list[dict], str | None, str | None, str]:
    """Extract stream URL, subtitles, referer, embed URL, and stream type from provider response."""
    ssub = data.get(audio) or data.get("ssub") or data.get("sub") or {}
    if not isinstance(ssub, dict):
        ssub = data
    if not ssub and isinstance(data.get("streams"), list):
        ssub = data

    m3u8_url = None
    m3u8_referer = None
    embed_url = None
    stream_type = "hls"
    streams = ssub.get("streams", [])
    for s in streams:
        url = s.get("url", "")
        stype = s.get("type", "")
        if stype == "mp4" and url and not m3u8_url:
            m3u8_url = url
            m3u8_referer = s.get("referer")
            stream_type = "mp4"
        elif stype == "hls" and url and not m3u8_url:
            m3u8_url = url
            m3u8_referer = s.get("referer")
            stream_type = "hls"
        elif s.get("type") == "embed" and url and not embed_url:
            embed_url = url
        if m3u8_url and embed_url:
            break

    subtitles = []
    raw_subs = ssub.get("subtitles", []) or data.get("subtitles", [])
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

    return m3u8_url, subtitles, m3u8_referer, embed_url, stream_type


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
