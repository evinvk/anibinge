"""
GogoAnime streaming client — searches anime, fetches episodes, and resolves M3U8 streaming links.
Uses the gogoanimehd.to JSON API (no browser required).
"""
import logging
import re
from typing import Any

import httpx

logger = logging.getLogger("anibinge.gogoanime")

_BASE_URL = "https://gogoanimehd.to"
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
        _client = httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS, follow_redirects=True)
    return _client


async def search_anime(query: str) -> list[dict]:
    """Search for anime by title."""
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
    """Get episode data including the proxy streaming URL."""
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


async def resolve_m3u8(proxy_url: str) -> str | None:
    """Follow the proxy URL to get the actual M3U8 manifest URL."""
    client = await _get_client()
    try:
        full_url = proxy_url if proxy_url.startswith("http") else f"{_BASE_URL}{proxy_url}"
        resp = await client.get(full_url)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")

        if "mpegurl" in content_type or resp.text.strip().startswith("#EXTM3U"):
            return str(resp.url)

        text = resp.text
        m3u8_match = re.search(r'https?://[^\s"\'<>]+\.m3u8[^\s"\'<>]*', text)
        if m3u8_match:
            return m3u8_match.group(0)

        logger.warning("GogoAnime: no M3U8 found at %s", full_url)
        return None
    except Exception as e:
        logger.warning("GogoAnime M3U8 resolve failed for %s: %s", proxy_url, e)
        return None


async def get_stream_sources(slug: str, episode_number: int) -> list[dict]:
    """Get quality-tagged M3U8 URLs for an episode."""
    episode = await get_episode(slug, episode_number)
    if not episode:
        return []

    proxy_url = episode.get("defaultStreamingUrl", "")
    if not proxy_url:
        logger.warning("GogoAnime: no defaultStreamingUrl for %s ep-%d", slug, episode_number)
        return []

    m3u8_url = await resolve_m3u8(proxy_url)
    if not m3u8_url:
        return []

    client = await _get_client()
    try:
        resp = await client.get(m3u8_url, headers={"Referer": _BASE_URL + "/"})
        resp.raise_for_status()
        text = resp.text

        sources = []
        for line in text.splitlines():
            if line.startswith("#EXT-X-STREAM-INF"):
                attrs = {}
                for part in line.split(","):
                    if "=" in part:
                        k, v = part.split("=", 1)
                        attrs[k.strip()] = v.strip().strip('"')
                quality = attrs.get("RESOLUTION", "Unknown")
                if "x" in quality.lower():
                    quality = quality.split("x")[-1] + "p"
                sources.append({"quality": quality, "url": m3u8_url})
            elif line.strip() and not line.startswith("#"):
                sources.append({"quality": "default", "url": m3u8_url})

        if not sources:
            sources = [{"quality": "default", "url": m3u8_url}]

        logger.info("GogoAnime stream %s ep-%d: %d quality options", slug, episode_number, len(sources))
        return sources
    except Exception as e:
        logger.warning("GogoAnime stream parse failed: %s", e)
        return [{"quality": "default", "url": m3u8_url}]


async def close():
    """Close the httpx client."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
    _client = None
