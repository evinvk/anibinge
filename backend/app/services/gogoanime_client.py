"""
GogoAnime streaming client — searches anime, fetches episodes, and resolves M3U8 streaming links.
Uses the gogoanimehd.to JSON API (no browser required).

NOTE: The /api/search?keyword= endpoint on gogoanimehd.to is BROKEN — it returns
the same trending list regardless of the keyword. We work around this by fetching
the full catalog and doing local fuzzy title matching.
"""
import asyncio
import base64
import logging
import re
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

_client: httpx.AsyncClient | None = None
_catalog: dict[str, dict] = {}  # normalized_title -> item
_catalog_loaded = False
_catalog_lock = asyncio.Lock()
_catalog_loaded_at: float = 0


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
    """Load the full GogoAnime catalog into memory. Runs in background."""
    global _catalog, _catalog_loaded, _catalog_loaded_at

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

    # Ensure catalog is loaded
    if not _catalog_loaded:
        async with _catalog_lock:
            if not _catalog_loaded:
                # Start loading in background, but also try to get immediate results
                load_task = asyncio.create_task(_load_catalog())

                # Wait a bit for partial results, or wait for full load
                try:
                    await asyncio.wait_for(asyncio.shield(load_task), timeout=10.0)
                except asyncio.TimeoutError:
                    logger.info("GogoAnime: catalog still loading, using partial results")

    if not _catalog:
        logger.warning("GogoAnime: catalog empty, cannot search")
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


def _rewrite_m3u8_urls(content: str, base_url: str) -> str:
    """Rewrite M3U8 URLs to go through our CORS proxy endpoint."""
    lines = content.splitlines()
    result = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            resolved = _resolve_url(base_url, stripped)
            encoded = base64.urlsafe_b64encode(resolved.encode()).decode()
            result.append(f"/api/v1/streaming/gogoanime/proxy?url={encoded}")
        else:
            result.append(line)
    return "\n".join(result)


async def get_stream_sources(slug: str, episode_number: int) -> dict | None:
    """Get quality-tagged streaming sources for an episode.
    Returns {master_m3u8: str, qualities: [{quality, url}]} or None."""
    episode = await get_episode(slug, episode_number)
    if not episode:
        return None

    proxy_url = episode.get("defaultStreamingUrl", "")
    if not proxy_url:
        logger.warning("GogoAnime: no defaultStreamingUrl for %s ep-%d", slug, episode_number)
        return None

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

    logger.info("GogoAnime stream %s ep-%d: %d quality options", slug, episode_number, len(qualities))
    return {"master_m3u8": rewritten_master, "qualities": qualities}


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
    """Close the httpx client."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
    _client = None
