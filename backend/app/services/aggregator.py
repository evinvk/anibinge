"""
Aggregation layer: tries Jikan first (primary), transparently falls back
to AniList if Jikan errors out or rate-limits. Normalizes both shapes
into one consistent schema the frontend can rely on.
"""
import logging

import httpx

from app.services import anilist_client, jikan_client

logger = logging.getLogger("anibinge.aggregator")


def _normalize_jikan(item: dict) -> dict:
    return {
        "id": item.get("mal_id"),
        "source": "jikan",
        "title": item.get("title"),
        "title_english": item.get("title_english"),
        "image": (item.get("images", {}).get("jpg", {}) or {}).get("large_image_url"),
        "banner": item.get("trailer", {}).get("images", {}).get("maximum_image_url"),
        "score": item.get("score"),
        "popularity": item.get("popularity"),
        "episodes": item.get("episodes"),
        "status": item.get("status"),
        "genres": [g["name"] for g in item.get("genres", [])],
        "synopsis": item.get("synopsis"),
        "year": item.get("year"),
        "season": item.get("season"),
        "format": item.get("type"),
    }


def _normalize_anilist(item: dict) -> dict:
    title = item.get("title", {})
    return {
        "id": item.get("id"),
        "source": "anilist",
        "title": title.get("romaji") or title.get("english"),
        "title_english": title.get("english"),
        "image": item.get("coverImage", {}).get("large"),
        "banner": item.get("bannerImage"),
        "score": (item.get("averageScore") or 0) / 10,
        "popularity": item.get("popularity"),
        "episodes": item.get("episodes"),
        "status": item.get("status"),
        "genres": item.get("genres", []),
        "synopsis": None,
        "year": item.get("seasonYear"),
        "season": item.get("season"),
        "format": item.get("format"),
    }


async def get_trending(page: int = 1) -> list[dict]:
    try:
        data = await jikan_client.get_top_anime(page=page, filter_type="bypopularity")
        return [_normalize_jikan(x) for x in data.get("data", [])]
    except httpx.HTTPError as e:
        logger.warning("Jikan trending failed (%s), falling back to AniList", e)
        data = await anilist_client.get_trending(page=page)
        return [_normalize_anilist(x) for x in data.get("Page", {}).get("media", [])]


async def search(query: str, page: int = 1, **filters) -> list[dict]:
    try:
        data = await jikan_client.search_anime(query, page=page, **filters)
        return [_normalize_jikan(x) for x in data.get("data", [])]
    except httpx.HTTPError as e:
        logger.warning("Jikan search failed (%s), falling back to AniList", e)
        data = await anilist_client.search_anime(query, page=page)
        return [_normalize_anilist(x) for x in data.get("Page", {}).get("media", [])]
