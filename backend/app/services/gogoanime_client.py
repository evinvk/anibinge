"""
GogoAnime streaming client — searches anime, fetches episodes, and resolves M3U8 streaming links.
Uses the gogoanimehd.to JSON API (no browser required).

NOTE: The /api/search?keyword= endpoint on gogoanimehd.to is BROKEN — it returns
the same trending list regardless of the keyword. We work around this by fetching
the full catalog and doing local fuzzy title matching.
"""
import asyncio
import base64
import json
import logging
import os
import re
import tempfile
import time
from typing import Any

import httpx

from app.core.http import get_shared_client

logger = logging.getLogger("anibinge.gogoanime")

_BASE_URL = "https://gogoanimehd.to"
_TIMEOUT = httpx.Timeout(15.0, connect=10.0)
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html, */*",
    "Referer": _BASE_URL + "/",
}
_CATALOG_TTL = 60 * 60 * 24  # 24 hours
_MAX_CATALOG_PAGES = 300
_CACHE_FILE = os.path.join(tempfile.gettempdir(), "gogoanime_catalog.json")

_client: httpx.AsyncClient | None = None
_catalog: dict[str, dict] = {}  # normalized_title -> item
_catalog_loaded = False
_catalog_lock = asyncio.Lock()
_catalog_loaded_at: float = 0


async def _load_catalog_from_disk() -> dict[str, dict] | None:
    """Load the catalog from the disk cache file. Returns None if cache is missing or stale."""
    try:
        if not os.path.exists(_CACHE_FILE):
            return None
        mtime = os.path.getmtime(_CACHE_FILE)
        if time.time() - mtime > _CATALOG_TTL:
            logger.info("GogoAnime: disk cache expired (%ds old)", int(time.time() - mtime))
            return None
        with open(_CACHE_FILE, "r", encoding="utf-8") as f:
            cache = json.load(f)
        cache_catalog = cache.get("catalog", {})
        cache_time = cache.get("time", 0)
        logger.info("GogoAnime: loaded %d items from disk cache (age: %ds)", len(cache_catalog), int(time.time() - cache_time))
        return cache_catalog
    except Exception as e:
        logger.warning("GogoAnime: disk cache load failed: %s", e)
        return None


async def _save_catalog_to_disk(catalog: dict[str, dict]):
    """Save the catalog to the disk cache file."""
    try:
        with open(_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump({"catalog": catalog, "time": time.time()}, f, ensure_ascii=False)
        logger.info("GogoAnime: catalog saved to disk cache (%d items)", len(catalog))
    except Exception as e:
        logger.warning("GogoAnime: disk cache save failed: %s", e)


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = get_shared_client(timeout=_TIMEOUT, headers=_HEADERS, follow_redirects=True)
    return _client


def _normalize(title: str) -> str:
    """Normalize a title for matching: lowercase, strip punctuation, collapse spaces."""
    t = title.lower().strip()
    t = re.sub(r"[''`]", "", t)
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _token_set(title: str) -> set[str]:
    """Extract a set of tokens from a title for set-similarity matching."""
    return set(_normalize(title).split())


async def _fetch_catalog_page(page: int) -> list[dict]:
    """Fetch a single page of the GogoAnime catalog."""
    client = await _get_client()
    try:
        resp = await client.get(f"{_BASE_URL}/api/search", params={"keyword": "", "page": page})
        resp.raise_for_status()
        data = resp.json()
        return data.get("items", [])
    except Exception as e:
        logger.warning("GogoAnime catalog page %d fetch failed: %s", page, e)
        return []


async def _load_catalog():
    """Load the full GogoAnime catalog into memory. Tries disk cache first, then fetches from API."""
    global _catalog, _catalog_loaded, _catalog_loaded_at

    # Try disk cache first
    cached = await _load_catalog_from_disk()
    if cached is not None:
        _catalog = cached
        _catalog_loaded = True
        _catalog_loaded_at = time.monotonic()
        return

    logger.info("GogoAnime: starting catalog load (fetching %d pages)...", _MAX_CATALOG_PAGES)
    start = time.monotonic()

    # Fetch in batches of 10 to avoid overwhelming the server
    all_items = []
    batch_size = 10
    for batch_start in range(1, _MAX_CATALOG_PAGES + 1, batch_size):
        batch_end = min(batch_start + batch_size, _MAX_CATALOG_PAGES + 1)
        tasks = [_fetch_catalog_page(p) for p in range(batch_start, batch_end)]
        results = await asyncio.gather(*tasks)
        for page_items in results:
            all_items.extend(page_items)
        # Small delay between batches
        await asyncio.sleep(0.2)

    # Build the search index
    new_catalog = {}
    for item in all_items:
        slug = item.get("slug", "")
        title = item.get("title", "")
        title_en = item.get("title_english", "") or ""
        title_jp = item.get("title_japanese", "") or ""

        # Index by all title variants
        for t in [title, title_en, title_jp]:
            if t:
                norm = _normalize(t)
                if norm and norm not in new_catalog:
                    new_catalog[norm] = item

    _catalog = new_catalog
    _catalog_loaded = True
    _catalog_loaded_at = time.monotonic()

    # Save to disk cache
    await _save_catalog_to_disk(new_catalog)

    elapsed = time.monotonic() - start
    logger.info(
        "GogoAnime catalog loaded: %d items indexed in %.1fs",
        len(_catalog), elapsed,
    )


def _fuzzy_search(query: str, max_results: int = 5) -> list[dict]:
    """Search the local catalog using fuzzy matching."""
    global _catalog

    q_norm = _normalize(query)
    q_tokens = _token_set(query)

    scored = []
    for norm, item in _catalog.items():
        score = 0.0

        # Exact match
        if q_norm == norm:
            score = 100.0
        # Query is a substring of catalog title
        elif q_norm in norm:
            score = 80.0 + (len(q_norm) / max(len(norm), 1)) * 20
        # Catalog title is a substring of query
        elif norm in q_norm:
            score = 70.0 + (len(norm) / max(len(q_norm), 1)) * 20
        else:
            # Token overlap (Jaccard-like)
            cat_tokens = set(norm.split())
            if q_tokens and cat_tokens:
                overlap = len(q_tokens & cat_tokens)
                union = len(q_tokens | cat_tokens)
                if overlap > 0:
                    score = (overlap / union) * 60.0

                    # Bonus: more tokens matched = better
                    score += overlap * 5

        if score > 10:
            scored.append((score, item))

    scored.sort(key=lambda x: (-x[0], x[1].get("episodes_count", 0) or 0))
    return [item for _, item in scored[:max_results]]


async def search_anime(query: str) -> list[dict]:
    """Search for anime by title using local fuzzy matching against the catalog."""
    global _catalog, _catalog_loaded, _catalog_lock

    # Ensure catalog is loaded (kick off in background if not, return immediately)
    async with _catalog_lock:
        if not _catalog_loaded:
            _catalog_loaded = "loading"  # sentinel: prevents duplicate loads
            asyncio.create_task(_load_catalog())
            logger.info("GogoAnime: catalog not loaded yet, kicking off background load")

    if not _catalog:
        logger.info("GogoAnime: catalog empty, returning empty results (background load in progress)")
        return []

    results = _fuzzy_search(query)
    logger.info("GogoAnime search '%s': %d results from catalog", query, len(results))
    return results


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


async def resolve_m3u8(proxy_url: str) -> tuple[str, str] | None:
    """Follow the proxy URL to get the actual M3U8 content.
    Returns (m3u8_content, resolved_url) or None."""
    client = await _get_client()
    try:
        full_url = proxy_url if proxy_url.startswith("http") else f"{_BASE_URL}{proxy_url}"
        resp = await client.get(full_url)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")

        if "mpegurl" in content_type or resp.text.strip().startswith("#EXTM3U"):
            return (resp.text, full_url)

        text = resp.text
        m3u8_match = re.search(r'https?://[^\s"\'<>]+\.m3u8[^\s"\'<>]*', text)
        if m3u8_match:
            m3u8_url = m3u8_match.group(0)
            resp2 = await client.get(m3u8_url, headers={"Referer": _BASE_URL + "/"})
            resp2.raise_for_status()
            return (resp2.text, m3u8_url)

        logger.warning("GogoAnime: no M3U8 found at %s", full_url)
        return None
    except Exception as e:
        logger.warning("GogoAnime M3U8 resolve failed for %s: %s", proxy_url, e)
        return None


def _resolve_url(base: str, relative: str) -> str:
    """Resolve a relative URL against a base URL."""
    if relative.startswith("http"):
        return relative
    if relative.startswith("/"):
        return f"{_BASE_URL}{relative}"
    # relative path
    base_path = base.rsplit("/", 1)[0] + "/"
    return base_path + relative


_AD_DOMAINS = {
    "p16-ad-sg.ibyteimg.com",
    "p16-ad-sg.tiktokcdn.com",
    "ad.doubleclick.net",
}


def _is_ad_url(url: str) -> bool:
    """Check if a URL belongs to an ad CDN that serves PNG/image ads instead of video segments."""
    from urllib.parse import urlparse
    try:
        host = urlparse(url).hostname or ""
        if host in _AD_DOMAINS or host.endswith(".ibyteimg.com"):
            return True
    except Exception:
        pass
    return False


def _rewrite_m3u8_urls(content: str, base_url: str) -> str:
    """Rewrite M3U8 URLs to go through our CORS proxy endpoint. Filters out ad segments."""
    from urllib.parse import urlparse
    lines = content.splitlines()
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            resolved = _resolve_url(base_url, stripped)
            if _is_ad_url(resolved):
                i += 1
                continue
            encoded = base64.urlsafe_b64encode(resolved.encode()).decode()
            result.append(f"/api/v1/streaming/gogoanime/proxy?url={encoded}")
        elif stripped.startswith("#EXTINF"):
            result.append(line)
            # Check if the next line (segment URL) is an ad
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if next_line and not next_line.startswith("#"):
                    resolved = _resolve_url(base_url, next_line)
                    if _is_ad_url(resolved):
                        i += 2
                        continue
        else:
            result.append(line)
        i += 1
    return "\n".join(result)


async def resolve_server_url(server_id: str) -> str | None:
    """Resolve a GogoAnime server ID to its actual embed/stream URL."""
    client = await _get_client()
    try:
        resp = await client.get(f"{_BASE_URL}/api/server", params={"id": server_id})
        resp.raise_for_status()
        data = resp.json()
        return data.get("url")
    except Exception as e:
        logger.warning("GogoAnime server resolve failed for %s: %s", server_id, e)
        return None


async def get_stream_sources(slug: str, episode_number: int, audio: str = "sub") -> dict | None:
    """Get quality-tagged streaming sources for an episode.
    Returns {master_m3u8: str, qualities: [{quality, url}], embed_url: str|None, server_id: str|None} or None."""
    episode = await get_episode(slug, episode_number)
    if not episode:
        return None

    # Try to resolve embed server URL (the working playback path)
    embed_url = None
    embed_server_id = None
    server_info = episode.get("server", {})
    qualities_list = server_info.get("qualities", [])

    # Pick the matching audio group first, then fall back to any other group
    preferred = audio.upper()  # "sub" -> "SUB", "dub" -> "DUB"
    ordered_groups = []
    for qg in qualities_list:
        if qg.get("title", "").upper() == preferred:
            ordered_groups.insert(0, qg)
        else:
            ordered_groups.append(qg)

    # Collect all non-anivexa server IDs from ordered groups
    server_candidates = []
    for quality_group in ordered_groups:
        for server in quality_group.get("serverList", []):
            sid = server.get("serverId", "")
            if sid.startswith("anivexa:"):
                continue
            server_candidates.append((quality_group.get("title"), server.get("title"), sid))

    # Resolve all embed servers in parallel — take first successful
    if server_candidates:
        tasks = [resolve_server_url(sid) for _, _, sid in server_candidates]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for (group_name, server_name, sid), result in zip(server_candidates, results):
            if isinstance(result, str) and result:
                embed_url = result
                embed_server_id = sid
                logger.info("GogoAnime resolved %s embed: %s → %s", group_name, server_name, result)
                break

    proxy_url = episode.get("defaultStreamingUrl", "")
    if not proxy_url:
        if not embed_url:
            logger.warning("GogoAnime: no streaming sources for %s ep-%d", slug, episode_number)
            return None
        return {"master_m3u8": None, "qualities": [], "embed_url": embed_url, "server_id": embed_server_id}

    # Skip broken M3U8 resolution if we already have an embed URL
    if embed_url:
        return {"master_m3u8": None, "qualities": [], "embed_url": embed_url, "server_id": embed_server_id}

    result = await resolve_m3u8(proxy_url)
    if not result:
        return None

    m3u8_content, resolved_url = result

    # Parse quality variants from the master M3U8
    qualities = []
    lines = m3u8_content.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith("#EXT-X-STREAM-INF"):
            attrs = {}
            for part in line.split(","):
                if "=" in part:
                    k, v = part.split("=", 1)
                    attrs[k.strip()] = v.strip().strip('"')
            quality = attrs.get("NAME") or attrs.get("RESOLUTION", "default")
            if quality == "default" and "x" in quality.lower():
                quality = quality.split("x")[-1] + "p"
            # Next non-empty, non-comment line is the URL
            i += 1
            while i < len(lines) and (not lines[i].strip() or lines[i].startswith("#")):
                i += 1
            if i < len(lines):
                variant_url = _resolve_url(resolved_url, lines[i].strip())
                qualities.append({"quality": quality, "url": variant_url})
        i += 1

    # Rewrite master M3U8 so variant URLs go through our proxy
    rewritten_master = _rewrite_m3u8_urls(m3u8_content, resolved_url)

    if not qualities:
        qualities = [{"quality": "default", "url": _resolve_url(resolved_url, "")}]

    logger.info("GogoAnime stream %s ep-%d: %d quality options, embed=%s", slug, episode_number, len(qualities), bool(embed_url))
    return {"master_m3u8": rewritten_master, "qualities": qualities, "embed_url": embed_url, "server_id": embed_server_id}


def get_catalog() -> list[dict]:
    """Return all unique catalog items as a list (deduplicated)."""
    seen_slugs: set[str] = set()
    unique: list[dict] = []
    for item in _catalog.values():
        slug = item.get("slug", "")
        if slug and slug not in seen_slugs:
            seen_slugs.add(slug)
            unique.append(item)
    return unique


async def close():
    """Detach from the shared httpx client (actual close handled by core/http.py)."""
    global _client
    _client = None
