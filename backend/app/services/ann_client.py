"""
Client for AnimeNewsNetwork news via RSS feeds.

ANN doesn't have a public JSON API — it publishes RSS feeds which we
parse server-side into structured dicts.  No API key required; we use
the public RSS endpoints and cache aggressively to stay respectful.
"""
import asyncio
import logging
import re
import xml.etree.ElementTree as ET
from html import unescape
from typing import Any

import httpx

from app.core.cache import cached
from app.core.config import get_settings
from app.core.http import get_shared_client

logger = logging.getLogger("anibinge.ann")
settings = get_settings()

_client = get_shared_client(
    base_url="https://www.animenewsnetwork.com",
    timeout=20.0,
    follow_redirects=True,
    headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
        "Accept-Language": "en-US,en;q=0.9",
    },
)

_RSS_NEWS = "/all/rss.xml"
_RSS_REVIEWS = "/review/rss.xml"


async def _fetch_rss(path: str, retries: int = 3) -> str:
    """Fetch raw XML text from an ANN RSS endpoint."""
    last_exc = None
    for attempt in range(retries + 1):
        try:
            resp = await _client.get(path)
            if resp.status_code == 429 and attempt < retries:
                await asyncio.sleep(2 * (attempt + 1))
                continue
            if resp.status_code >= 400:
                logger.warning("ANN RSS %s returned HTTP %s (attempt %d)", path, resp.status_code, attempt + 1)
                if attempt < retries:
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
            resp.raise_for_status()
            return resp.text
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout) as e:
            last_exc = e
            logger.warning("ANN RSS %s fetch error (attempt %d): %s", path, attempt + 1, e)
            if attempt < retries:
                await asyncio.sleep(2 * (attempt + 1))
                continue
    if last_exc:
        raise last_exc
    return ""


def _strip_html(text: str) -> str:
    """Remove HTML tags and decode entities."""
    clean = re.sub(r"<[^>]+>", "", text)
    return unescape(clean).strip()


def _extract_image(item_elem: ET.Element) -> str | None:
    """Try to pull an image URL from RSS <item> or its <media:content>."""
    # media:content
    ns = {"media": "http://search.yahoo.com/mrss/"}
    for media in item_elem.findall("media:content", ns):
        url = media.get("url")
        if url:
            return url
    # enclosure
    enc = item_elem.find("enclosure")
    if enc is not None:
        url = enc.get("url", "")
        if url and ("image" in enc.get("type", "") or url.lower().endswith((".jpg", ".png", ".webp"))):
            return url
    # <img> inside description/description_html
    for tag in ("description", "description_html"):
        node = item_elem.find(tag)
        if node is not None and node.text:
            m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', node.text)
            if m:
                return m.group(1)
    return None


def _parse_rss_items(xml_text: str) -> list[dict]:
    """Parse ANN RSS XML into a list of normalised article dicts."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        logger.error("Failed to parse ANN RSS XML: %s", e)
        return []

    items: list[dict] = []
    for item in root.iter("item"):
        title_node = item.find("title")
        title = (title_node.text or "").strip() if title_node is not None else ""
        if not title:
            continue

        link_node = item.find("link")
        link = (link_node.text or "").strip() if link_node is not None else ""

        desc_node = item.find("description")
        description = _strip_html(desc_node.text or "") if desc_node is not None else ""

        pub_node = item.find("pubDate")
        published = (pub_node.text or "").strip() if pub_node is not None else ""

        cat_node = item.find("category")
        category = (cat_node.text or "news").strip().lower() if cat_node is not None else "news"

        image = _extract_image(item)

        items.append({
            "id": link or title,
            "title": title,
            "url": link,
            "summary": description[:300] if description else "",
            "image": image,
            "category": category,
            "published_at": published,
        })

    return items


@cached("ann:news", ttl=settings.CACHE_TTL_SHORT)
async def get_anime_news(page: int = 1, limit: int = 20) -> dict:
    """Fetch the latest anime news articles from ANN RSS."""
    try:
        xml = await _fetch_rss(_RSS_NEWS)
        all_items = _parse_rss_items(xml)
        total = len(all_items)
        start = (page - 1) * limit
        page_items = all_items[start : start + limit]
        logger.info("ANN news: fetched %d items, returning page %d (%d items)", total, page, len(page_items))
        return {"data": page_items, "total": total, "page": page, "limit": limit}
    except Exception as e:
        logger.error("ANN news fetch failed: %s", e, exc_info=True)
        return {"data": [], "total": 0, "page": page, "limit": limit}


@cached("ann:reviews", ttl=settings.CACHE_TTL_MEDIUM)
async def get_anime_reviews(anime_id: str | None = None, page: int = 1) -> dict:
    """Fetch anime reviews from ANN RSS."""
    try:
        xml = await _fetch_rss(_RSS_REVIEWS)
        all_items = _parse_rss_items(xml)
        if anime_id:
            all_items = [i for i in all_items if anime_id in i.get("url", "")]
        total = len(all_items)
        start = (page - 1) * 20
        page_items = all_items[start : start + 20]
        return {"data": page_items, "total": total, "page": page}
    except Exception as e:
        logger.error("ANN reviews fetch failed: %s", e)
        return {"data": [], "total": 0, "page": page}


@cached("ann:featured", ttl=settings.CACHE_TTL_SHORT)
async def get_featured_content() -> dict:
    """Fetch featured content from ANN RSS (same as latest news, top 5)."""
    try:
        xml = await _fetch_rss(_RSS_NEWS)
        all_items = _parse_rss_items(xml)
        return {"data": all_items[:5]}
    except Exception as e:
        logger.error("ANN featured fetch failed: %s", e)
        return {"data": []}
