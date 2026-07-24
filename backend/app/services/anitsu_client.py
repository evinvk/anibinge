"""
Client for the Animetsu Scraper API — multi-provider anime streaming aggregator.
Uses anipm (Ani.pm), animeyubi (AnimePahe mirror), and other providers.
Returns HLS/MP4 streams with subtitles and skip markers.
"""
import logging
from typing import Any

import httpx

from app.core.http import get_shared_client

logger = logging.getLogger("anibinge.anitsu_client")

ANITSU_BASE = "https://animetsu-scraper-nine.vercel.app"

_client = get_shared_client(timeout=25.0, headers={
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
})

# Provider configs: (provider, server, type)
# anipm with onyx-hls: Real HLS from megap.kotocdn.site + ani.pm (best quality, subtitles, skip markers)
# anipm with megaplay: MegaPlay HLS embed
# animeyubi with kwik-mp4: AnimePahe kwik.cx MP4/iframes (Cloudflare-protected, less reliable)
_PROVIDER_CHAIN = [
    ("anipm", "onyx-hls", "sub"),
    ("anipm", "megaplay", "sub"),
    ("animeyubi", "kwik-mp4", "sub"),
]

# Referer map for different CDN hosts
_REFERER_MAP = {
    "ani.pm": "https://ani.pm/",
    "cdn.ani.pm": "https://ani.pm/",
    "megap.kotocdn.site": "https://megaplay.buzz/",
    "kwik.cx": "https://animepahe.ru/",
    "1oe.lostproject.club": "https://megaplay.buzz/",
    "megaplay.buzz": "https://ani.pm/",
}


def _get_referer_for_url(url: str) -> str:
    """Determine the correct Referer header for a given URL."""
    for host, referer in _REFERER_MAP.items():
        if host in url:
            return referer
    return ""


def _extract_original_url(proxied_url: str) -> str:
    """Extract the original upstream URL from an Animetsu proxy URL.
    
    Animetsu proxy format: /api/proxy/m3u8?url={encoded_url}&referer={encoded_referer}
    We want the raw upstream URL so we can proxy it ourselves.
    """
    if "/api/proxy/" not in proxied_url:
        return proxied_url

    from urllib.parse import urlparse, parse_qs
    parsed = urlparse(proxied_url)
    qs = parse_qs(parsed.query)
    if "url" in qs:
        return qs["url"][0]
    return proxied_url


async def get_stream(anilist_id: int, episode: int) -> dict[str, Any]:
    """Try Animetsu providers to get streaming data for an episode.
    
    Returns a normalized dict matching the anivexa_client format:
    {
        "source": "anitsu",
        "provider": "anipm",
        "stream_url": "https://...",
        "stream_type": "hls" | "mp4",
        "referer": "https://...",
        "embed_url": null | "https://...",
        "subtitles": [...],
        "skip_markers": {...},
    }
    """
    for provider, server, source_type in _PROVIDER_CHAIN:
        try:
            result = await _try_provider(anilist_id, episode, provider, server, source_type)
            if result:
                return result
        except Exception as e:
            logger.warning("Animetsu %s/%s failed for al:%d ep%d: %s", provider, server, anilist_id, episode, e)
            continue

    logger.info("Animetsu: no streams found for al:%d ep%d", anilist_id, episode)
    return {}


async def _try_provider(
    anilist_id: int, episode: int, provider: str, server: str, source_type: str
) -> dict[str, Any] | None:
    """Try a specific Animetsu provider and return normalized stream data."""
    url = f"{ANITSU_BASE}/api/scrape/sources"
    params = {
        "id": f"al:{anilist_id}",
        "ep": episode,
        "server": server,
        "type": source_type,
        "provider": provider,
    }

    try:
        resp = await _client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.warning("Animetsu API error for %s/%s: %s", provider, server, e)
        return None

    if not data:
        return None

    sources = data.get("sources", [])
    if not sources:
        return None

    # Pick the best source: prefer ani.pm HLS > other master HLS > mp4 > iframe
    # megap.kotocdn.site has ad segments (PNG images), so deprioritize it
    best_source = None
    best_priority = 999
    for src in sources:
        stype = src.get("type", "")
        url = src.get("originalUrl") or src.get("url", "")

        if stype == "master":
            # Prefer ani.pm over megap.kotocdn.site (latter has ad segments)
            if "ani.pm" in url:
                priority = 0
            elif "megap.kotocdn.site" in url:
                priority = 5  # deprioritized — has ad PNG segments
            else:
                priority = 1
        elif stype == "hls":
            priority = 2
        elif stype == "mp4":
            priority = 3
        elif stype == "iframe":
            priority = 4
        else:
            priority = 9

        if priority < best_priority:
            best_priority = priority
            best_source = src

    if not best_source:
        return None

    # Extract original upstream URL
    raw_url = best_source.get("originalUrl") or best_source.get("url", "")
    stream_url = _extract_original_url(raw_url)
    stream_type = "mp4" if best_source.get("type") == "mp4" else "hls"
    referer = best_source.get("upstreamReferer") or _get_referer_for_url(stream_url)

    # For iframe sources, we can't extract the video URL — skip this provider
    if best_source.get("type") == "iframe" and not stream_url:
        return None

    # Extract subtitles — use original upstream URLs, not proxied ones
    subtitles = []
    raw_subs = data.get("subtitles", [])
    for sub in raw_subs:
        sub_url = sub.get("url", "")
        if not sub_url:
            continue
        # Extract original URL from proxy if needed
        original_sub_url = _extract_original_url(sub_url)
        sub_referer = _get_referer_for_url(original_sub_url)
        subtitles.append({
            "file": original_sub_url,
            "label": sub.get("lang", "Unknown"),
            "language": sub.get("lang", "en").lower().split(" ")[0][:3],
            "kind": "captions",
            "default": sub.get("lang", "").lower().startswith("english"),
            "source": provider,
            "referer": sub_referer,
        })

    # Extract skip markers
    skip_markers = {}
    skips = data.get("skips", {})
    if skips.get("intro"):
        skip_markers["intro"] = skips["intro"]
    if skips.get("outro"):
        skip_markers["outro"] = skips["outro"]

    return {
        "source": "anitsu",
        "provider": f"{provider}/{server}",
        "stream_url": stream_url,
        "stream_type": stream_type,
        "referer": referer,
        "embed_url": None if stream_type != "iframe" else stream_url,
        "subtitles": subtitles,
        "skip_markers": skip_markers,
    }


async def health_check() -> bool:
    """Check if the Animetsu API is reachable."""
    try:
        resp = await _client.get(f"{ANITSU_BASE}/api/scrape/providers", timeout=5.0)
        return resp.status_code == 200
    except Exception:
        return False


async def close():
    """Close the HTTP client."""
    await _client.aclose()
