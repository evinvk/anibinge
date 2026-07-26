"""
Nyaa.si search client — scrapes torrent listings for magnet links & metadata.
Uses cloudscraper to bypass Cloudflare protection.
"""
import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any

from app.core.cache import cached

logger = logging.getLogger("anibinge.nyaa")

NYAA_BASE = "https://nyaa.si"
_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

# Cache prefix & TTL
_CACHE_PREFIX = "nyaa"
_CACHE_TTL = 60 * 5  # 5 min — torrent lists change frequently

# Category: anime — English-translated (1_2)
ANIME_EN_CATEGORY = "1_2"
# Anime — non-English (1_3)
ANIME_NON_EN_CATEGORY = "1_3"
# Anime — raw (1_4)
ANIME_RAW_CATEGORY = "1_4"
# Anime — all (1_0)
ANIME_ALL = "1_0"

# Quality filters for search
QUALITY_KEYWORDS = {
    "720p": ["720p", "720"],
    "1080p": ["1080p", "1080"],
    "4k": ["4k", "2160p"],
    "x265": ["x265", "hevc"],
    "x264": ["x264", "h264", "avc"],
}


def _parse_size(size_str: str) -> int:
    """Convert size string ('1.2 GiB', '350 MiB') to bytes."""
    size_str = size_str.strip()
    num_match = re.search(r"([\d.]+)", size_str)
    if not num_match:
        return 0
    num = float(num_match.group(1))
    if "TiB" in size_str:
        return int(num * 1024 ** 4)
    if "GiB" in size_str:
        return int(num * 1024 ** 3)
    if "MiB" in size_str:
        return int(num * 1024 ** 2)
    if "KiB" in size_str:
        return int(num * 1024)
    return int(num)


def _parse_date(date_str: str) -> str | None:
    """Parse Nyaa date string into ISO format."""
    try:
        date_str = date_str.strip()
        if "UTC" in date_str:
            date_str = date_str.replace("UTC", "").strip()
        for fmt in ["%Y-%m-%d %H:%M", "%Y-%m-%d", "%m/%d/%Y"]:
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.replace(tzinfo=timezone.utc).isoformat()
            except ValueError:
                continue
        return date_str
    except Exception:
        return date_str


def _extract_magnet(row) -> str | None:
    """Extract magnet link from a search result row."""
    links = row.find_all("a", href=re.compile(r"^magnet:"))
    for a in links:
        href = a.get("href", "")
        if href.startswith("magnet:?"):
            return href
    return None


def _extract_torrent_id(row) -> str | None:
    """Extract torrent page ID from a search result row."""
    links = row.find_all("a", href=re.compile(r"^/view/"))
    for a in links:
        href = a.get("href", "")
        match = re.search(r"/view/(\d+)", href)
        if match:
            return match.group(1)
    return None


def _extract_title(row) -> str:
    """Extract the full title from a search result row."""
    tds = row.find_all("td", colspan="2")
    info_cell = tds[0] if tds else row
    title_links = info_cell.find_all("a", href=re.compile(r"^/view/"))
    for a in title_links:
        title = a.get("title", "") or a.text.strip()
        if title:
            return title
    return ""


def _extract_category(row) -> str:
    """Extract the category icon alt text."""
    img = row.find("img", class_=re.compile(r"cat-icon"))
    if img:
        alt = img.get("alt", "")
        if "Anime" in alt:
            return "anime"
        if "Audio" in alt:
            return "audio"
        if "Literature" in alt:
            return "literature"
        if "Live Action" in alt:
            return "live_action"
        if "Pictures" in alt:
            return "pictures"
        return alt.lower().replace(" ", "_")
    return "unknown"


def _infer_episode(title: str) -> int | None:
    """Try to extract episode number from the torrent title."""
    patterns = [
        r"[-–—]\s*(?:Ep|Episode|E)\s*(\d+)",
        r"\bEP(\d+)\b",
        r"\[(\d+)(?:v\d)?\]\s*(?:END|Fin)",
        r"- (\d+)\s*(?:END|\[)",
        r"-\s*(\d+)\s*$",
    ]
    for pat in patterns:
        match = re.search(pat, title, re.IGNORECASE)
        if match:
            return int(match.group(1))

    # Check for single-episode batch detection
    is_batch = any(kw in title.lower() for kw in ["batch", "complete", "全集"])
    if is_batch:
        return None
    return None


def _infer_quality(title: str) -> list[str]:
    """Extract quality tags from the title."""
    tags = []
    title_lower = title.lower()
    for tag, keywords in QUALITY_KEYWORDS.items():
        for kw in keywords:
            if kw in title_lower:
                tags.append(tag)
                break
    return tags


def _is_batch(title: str) -> bool:
    """Check if this torrent is a batch/complete series."""
    return any(kw in title.lower() for kw in ["batch", "complete", "全集", "全話"])


async def search_nyaa(
    query: str,
    category: str = ANIME_EN_CATEGORY,
    page: int = 1,
    filter_quality: str | None = None,
    min_seeders: int = 0,
) -> list[dict[str, Any]]:
    """
    Search Nyaa.si for torrents matching the query.

    Args:
        query: Search term
        category: Nyaa category ID (default 1_2 = Anime English-translated)
        page: Page number
        filter_quality: Optional quality filter ("720p", "1080p", "x265")
        min_seeders: Minimum seeders filter

    Returns:
        List of torrent dicts with keys: title, magnet, torrent_id, size_bytes,
        seeders, leechers, completed, date, category, quality, episode, is_batch
    """
    try:
        import cloudscraper
        from bs4 import BeautifulSoup
    except ImportError:
        logger.error("cloudscraper or beautifulsoup4 not installed")
        return []

    scraper = cloudscraper.create_scraper(
        browser={"custom": _USER_AGENT},
        delay=1,
    )

    params = {
        "q": query,
        "c": category,
        "p": page,
        "s": "seeders",
        "o": "desc",
    }

    try:
        resp = scraper.get(f"{NYAA_BASE}/", params=params, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        logger.warning("Nyaa search failed for '%s': %s", query, e)
        return []

    soup = BeautifulSoup(resp.text, "lxml")
    table = soup.find("table", class_="torrent-list")
    if not table:
        logger.info("Nyaa: no results table for '%s'", query)
        return []

    rows = table.find_all("tr")[1:]  # skip header
    results: list[dict[str, Any]] = []

    for row in rows:
        try:
            magnet = _extract_magnet(row)
            if not magnet:
                continue

            title = _extract_title(row)
            torrent_id = _extract_torrent_id(row)

            cells = row.find_all("td")
            size_str = cells[3].text.strip() if len(cells) > 3 else "0"
            date_str = cells[4].text.strip() if len(cells) > 4 else ""

            seeders_str = cells[5].text.strip() if len(cells) > 5 else "0"
            leechers_str = cells[6].text.strip() if len(cells) > 6 else "0"
            completed_str = cells[7].text.strip() if len(cells) > 7 else "0"

            seeders = int(re.sub(r"\D", "", seeders_str)) if seeders_str != "—" else 0
            leechers = int(re.sub(r"\D", "", leechers_str)) if leechers_str != "—" else 0
            completed = int(re.sub(r"\D", "", completed_str)) if completed_str != "—" else 0
            size_bytes = _parse_size(size_str)

            if seeders < min_seeders:
                continue

            quality = _infer_quality(title)
            episode = _infer_episode(title)
            is_batch = _is_batch(title)

            if filter_quality and filter_quality not in quality:
                continue

            results.append({
                "title": title,
                "magnet": magnet,
                "torrent_id": torrent_id,
                "size_bytes": size_bytes,
                "size_human": size_str,
                "seeders": seeders,
                "leechers": leechers,
                "completed": completed,
                "date": _parse_date(date_str),
                "category": _extract_category(row),
                "quality": quality,
                "episode": episode,
                "is_batch": is_batch,
            })
        except Exception as e:
            logger.debug("Nyaa: skipped row: %s", e)
            continue

    return results


async def search(
    query: str,
    category: str = ANIME_EN_CATEGORY,
    page: int = 1,
    filter_quality: str | None = None,
    min_seeders: int = 1,
) -> dict[str, Any]:
    """Cached Nyaa search — returns dict with data and metadata."""
    cache_key = f"search:{query}:{category}:{page}:{filter_quality}:{min_seeders}"
    results = await search_nyaa(query, category, page, filter_quality, min_seeders)
    return {
        "data": results,
        "query": query,
        "page": page,
        "total": len(results),
    }


async def search_for_anime(
    title: str,
    episode: int | None = None,
    quality: str | None = "720p",
    page: int = 1,
) -> dict[str, Any]:
    """
    Smart search for an anime episode on Nyaa.
    Tries English-translated anime category first, falls back to all anime.

    Args:
        title: Anime title to search
        episode: Episode number (None for batch search)
        quality: Preferred quality ("720p", "1080p", "x265", None for any)
        page: Page number

    Returns:
        Search results with metadata
    """
    queries = [title]

    # Add quality to query if specified
    if quality and quality not in ["x265", "x264"]:
        queries = [f"{title} {quality}"] + queries

    all_results: list[dict] = []
    seen_magnets: set[str] = set()

    for q in queries:
        for cat in [ANIME_EN_CATEGORY, ANIME_ALL]:
            results = await search_nyaa(
                q, category=cat, page=page,
                filter_quality=quality, min_seeders=1,
            )
            for r in results:
                if r["magnet"] not in seen_magnets:
                    seen_magnets.add(r["magnet"])
                    all_results.append(r)

    # Filter by episode if specified
    if episode is not None:
        ep_results = [r for r in all_results if r["episode"] == episode]
        if ep_results:
            all_results = ep_results

    # Sort: best seeders first, then by size (prefer smaller for streaming)
    all_results.sort(key=lambda r: (-r["seeders"], r["size_bytes"]))

    return {
        "data": all_results,
        "query": title,
        "episode": episode,
        "page": page,
        "total": len(all_results),
    }
