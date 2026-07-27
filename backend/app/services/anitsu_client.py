import logging
from typing import Any

import httpx

from app.core.http import get_shared_client

logger = logging.getLogger("anibinge.anitsu_client")

ANITSU_BASE = "https://animetsu-scraper-nine.vercel.app"

_client = get_shared_client(timeout=25.0, headers={
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
})

_PROVIDER_CHAIN = [
    ("anipm", "onyx-hls", "sub"),
    ("anipm", "megaplay", "sub"),
    ("animeyubi", "kwik-mp4", "sub"),
    ("anipm", "onyx-hls", "dub"),
    ("anipm", "megaplay", "dub"),
]

_REFERER_MAP = {
    "ani.pm": "https://ani.pm/",
    "cdn.ani.pm": "https://ani.pm/",
    "megap.kotocdn.site": "https://megaplay.buzz/",
    "kwik.cx": "https://animepahe.ru/",
    "1oe.lostproject.club": "https://megaplay.buzz/",
    "megaplay.buzz": "https://ani.pm/",
}


def _get_referer_for_url(url: str) -> str:
    for host, referer in _REFERER_MAP.items():
        if host in url:
            return referer
    return ""


def _extract_original_url(proxied_url: str) -> str:
    url = proxied_url.strip()
    if "/api/proxy/" not in url:
        return url
    from urllib.parse import urlparse, parse_qs
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    if "url" in qs:
        return "".join(qs["url"][0].split())
    return url


async def get_stream(anilist_id: int, episode: int, audio: str = "sub") -> dict[str, Any]:
    """Try Animetsu providers to get streaming data for an episode.
    Now supports audio parameter for sub/dub switching.
    """
    for provider, server, source_type in _PROVIDER_CHAIN:
        if source_type != audio and source_type in ("sub", "dub"):
            continue
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

    best_source = None
    best_priority = 999
    for src in sources:
        stype = src.get("type", "")
        if stype == "master":
            priority = 0
        elif stype == "hls":
            priority = 1
        elif stype == "mp4":
            priority = 2
        elif stype == "iframe":
            priority = 99
        else:
            priority = 99

        if priority < best_priority:
            best_priority = priority
            best_source = src

    if not best_source:
        return None

    raw_url = best_source.get("originalUrl") or best_source.get("url", "")
    stream_url = _extract_original_url(raw_url)
    if stream_url:
        stream_url = "".join(stream_url.split())
    stream_type = "mp4" if best_source.get("type") == "mp4" else "hls"
    referer = best_source.get("upstreamReferer") or _get_referer_for_url(stream_url)

    if not stream_url or (not stream_url.startswith("http") and not stream_url.startswith("/")):
        return None

    subtitles = []
    raw_subs = data.get("subtitles", [])
    for sub in raw_subs:
        sub_url = sub.get("url", "")
        if not sub_url:
            continue
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

    skip_markers = {}
    skips = data.get("skips", {})
    if skips.get("intro"):
        skip_markers["intro"] = skips["intro"]
    if skips.get("outro"):
        skip_markers["outro"] = skips["outro"]

    embed_url = None
    for src in sources:
        if src.get("type") == "iframe":
            raw_embed = src.get("originalUrl") or src.get("url", "")
            if raw_embed:
                embed_url = _extract_original_url(raw_embed)
            break

    return {
        "source": "anitsu",
        "provider": f"{provider}/{server}",
        "stream_url": stream_url,
        "stream_type": stream_type,
        "referer": referer,
        "embed_url": embed_url,
        "subtitles": subtitles,
        "skip_markers": skip_markers,
    }


async def health_check() -> bool:
    try:
        resp = await _client.get(f"{ANITSU_BASE}/api/scrape/providers", timeout=5.0)
        return resp.status_code == 200
    except Exception:
        return False


async def close():
    pass
