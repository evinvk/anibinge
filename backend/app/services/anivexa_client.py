"""
Client for the Anivexa API — anime streaming aggregator.
Provides fallback streaming when GogoAnime CDN is down.
Uses AniList IDs for all lookups. Primary: Animetsu (anipm/kwik), fallback: Anivexa providers.

Includes provider health tracking, stream caching, and parallel provider racing.
"""
import asyncio
import logging
import time
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

# ── Provider health tracking ──────────────────────────────────────
# Track per-provider success/failure with cooldown.
# When a provider fails N times in a row, skip it for COOLDOWN seconds.
_PROVIDER_COOLDOWN_SECONDS = 300  # 5 min cooldown for broken providers
_PROVIDER_FAIL_THRESHOLD = 2     # Skip after 2 consecutive failures
_provider_health: dict[str, dict[str, Any]] = {}


def _provider_healthy(name: str) -> bool:
    """Check if a provider is healthy (not in cooldown)."""
    h = _provider_health.get(name)
    if not h:
        return True
    if h.get("failures", 0) >= _PROVIDER_FAIL_THRESHOLD:
        if time.monotonic() - h.get("last_fail", 0) < _PROVIDER_COOLDOWN_SECONDS:
            return False
        # Cooldown expired, allow retry
        return True
    return True


def _provider_success(name: str):
    """Mark provider as successful — reset failure count."""
    _provider_health[name] = {"failures": 0, "last_fail": 0}


def _provider_fail(name: str):
    """Mark provider as failed — increment failure count."""
    h = _provider_health.get(name, {"failures": 0, "last_fail": 0})
    h["failures"] = h.get("failures", 0) + 1
    h["last_fail"] = time.monotonic()
    _provider_health[name] = h


# ── Stream URL caching ────────────────────────────────────────────
# In-memory cache for stream URLs to avoid repeated upstream calls.
_stream_cache: dict[str, dict[str, Any]] = {}
_STREAM_CACHE_TTL = 300  # 5 minutes


def _cache_key(anilist_id: int, episode: int, audio: str) -> str:
    return f"{anilist_id}:{episode}:{audio}"


def _cache_get(key: str) -> dict[str, Any] | None:
    entry = _stream_cache.get(key)
    if entry and time.monotonic() - entry["ts"] < _STREAM_CACHE_TTL:
        return entry["data"]
    if entry:
        del _stream_cache[key]
    return None


def _cache_set(key: str, data: dict[str, Any]):
    _stream_cache[key] = {"data": data, "ts": time.monotonic()}
    # Evict old entries if cache grows too large
    if len(_stream_cache) > 500:
        now = time.monotonic()
        expired = [k for k, v in _stream_cache.items() if now - v["ts"] > _STREAM_CACHE_TTL]
        for k in expired[:200]:
            del _stream_cache[k]


# ── Anivexa providers ordered by reliability ──────────────────────
# animegg: Direct MP4 from vidcache.net (reliable, fast)
# anidbapp: HLS from hls.anidb.app (may have MPEG-TS transmux issues)
# anikoto: HLS from megap.kotocdn.site (has subtitles, but CDN sometimes 410s)
# anibd: HLS from playeng.animeapps.top (broken R2 storage)
# anineko: HLS from vivibebe.site (all ad PNGs)
# anizone: returns 500
_PROVIDERS = ["animegg", "anidbapp", "anikoto"]


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


async def _try_provider(anilist_id: int, episode: int, provider: str, audio: str) -> dict[str, Any] | None:
    """Try a single Anivexa provider. Returns normalized stream data or None."""
    if not _provider_healthy(provider):
        return None

    try:
        data = await get_stream_data(anilist_id, episode, provider, audio)
        if data and not data.get("error"):
            m3u8_url, subtitles, m3u8_referer, embed_url, stream_type = _extract_stream_info(data, audio)
            if m3u8_url or embed_url:
                _provider_success(provider)
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
        _provider_fail(provider)
    except Exception as e:
        _provider_fail(provider)
        logger.warning("Anivexa provider %s failed: %s", provider, e)
    return None


async def get_stream_with_fallback(anilist_id: int, episode: int, audio: str = "sub", skip_anitsu: bool = False) -> dict[str, Any]:
    """Try multiple providers until one returns a stream. Returns stream URL + subtitles + embed URL.

    Priority order:
    1. Animetsu (anipm/animeyubi) — multi-provider aggregator with HLS/MP4 + subtitles
    2. Anivexa providers (animegg, anidbapp, anikoto) — legacy fallback
    Set skip_anitsu=True to only try Anivexa providers (for multi-source fallback chains).
    """
    # Check cache first
    cache_key = _cache_key(anilist_id, episode, audio)
    cached = _cache_get(cache_key)
    if cached:
        logger.info("Stream cache hit for al:%d ep%d", anilist_id, episode)
        return cached

    result: dict[str, Any] = {}

    # 1. Try Animetsu first (anipm, animeyubi — best quality, subtitles, skip markers)
    if not skip_anitsu:
        try:
            result = await anitsu_client.get_stream(anilist_id, episode)
            if result and result.get("stream_url"):
                logger.info("Animetsu stream found: %s via %s", result.get("stream_type"), result.get("provider"))
                _cache_set(cache_key, result)
                return result
        except Exception as e:
            logger.warning("Animetsu failed for al:%d ep%d: %s", anilist_id, episode, e)

    # 2. Try Anivexa providers — race the first 2 in parallel for speed
    providers_to_try = [p for p in _PROVIDERS if _provider_healthy(p)]
    if not providers_to_try:
        # All providers in cooldown — try anikoto anyway (has subtitles)
        providers_to_try = ["anikoto"]

    # Race first 2 providers in parallel
    if len(providers_to_try) >= 2:
        tasks = [
            _try_provider(anilist_id, episode, providers_to_try[0], audio),
            _try_provider(anilist_id, episode, providers_to_try[1], audio),
        ]
        done, pending = await asyncio.wait(tasks, timeout=20.0, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        for task in done:
            r = task.result()
            if r:
                _cache_set(cache_key, r)
                return r
    else:
        r = await _try_provider(anilist_id, episode, providers_to_try[0], audio)
        if r:
            _cache_set(cache_key, r)
            return r

    # 3. Try remaining providers sequentially
    for provider in providers_to_try[2:]:
        r = await _try_provider(anilist_id, episode, provider, audio)
        if r:
            _cache_set(cache_key, r)
            return r

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
        if stype == "hls" and url and not m3u8_url:
            m3u8_url = url
            m3u8_referer = s.get("referer")
            stream_type = "hls"
        elif stype == "mp4" and url and not m3u8_url:
            m3u8_url = url
            m3u8_referer = s.get("referer")
            stream_type = "mp4"
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
