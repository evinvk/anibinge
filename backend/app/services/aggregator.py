"""
Aggregation layer: tries MyAnimeList first (primary), transparently falls back
to Jikan if MAL fails, then AniList if both error out. Normalizes all shapes
into one consistent schema the frontend can rely on.
"""
import logging

import httpx

from app.services import anilist_client, jikan_client, mal_client

logger = logging.getLogger("anibinge.aggregator")


def _normalize_mal(item: dict) -> dict:
    """Normalize MyAnimeList response to standard schema."""
    main_pic = item.get("main_picture", {})
    return {
        "id": item.get("id"),
        "source": "mal",
        "title": item.get("title"),
        "title_english": item.get("alternative_titles", {}).get("en"),
        "image": main_pic.get("large") or main_pic.get("medium"),
        "banner": item.get("main_picture", {}).get("large"),
        "score": item.get("mean"),
        "popularity": item.get("popularity"),
        "episodes": item.get("num_episodes"),
        "status": item.get("status"),
        "genres": [g["name"] for g in item.get("genres", [])],
        "synopsis": item.get("synopsis"),
        "year": int(item.get("start_date", "")[:4]) if item.get("start_date") else None,
        "season": item.get("season"),
        "format": item.get("media_type"),
    }


def _normalize_jikan(item: dict) -> dict:
    """Normalize Jikan response to standard schema."""
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
    """Normalize AniList response to standard schema."""
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
    """Get trending anime: MAL (primary) ��� Jikan → AniList (fallback chain)."""
    try:
        data = await mal_client.get_anime_ranking(ranking_type="by_popularity", page=page)
        return [_normalize_mal(x) for x in data.get("data", [])]
    except httpx.HTTPError as e:
        logger.warning("MAL trending failed (%s), falling back to Jikan", e)
        try:
            data = await jikan_client.get_top_anime(page=page, filter_type="bypopularity")
            return [_normalize_jikan(x) for x in data.get("data", [])]
        except httpx.HTTPError as e2:
            logger.warning("Jikan trending failed (%s), falling back to AniList", e2)
            data = await anilist_client.get_trending(page=page)
            return [_normalize_anilist(x) for x in data.get("Page", {}).get("media", [])]


async def search(query: str, page: int = 1, **filters) -> list[dict]:
    """Search anime: MAL (primary) → Jikan → AniList (fallback chain)."""
    try:
        data = await mal_client.search_anime(query, page=page)
        return [_normalize_mal(x) for x in data.get("data", [])]
    except httpx.HTTPError as e:
        logger.warning("MAL search failed (%s), falling back to Jikan", e)
        try:
            data = await jikan_client.search_anime(query, page=page, **filters)
            return [_normalize_jikan(x) for x in data.get("data", [])]
        except httpx.HTTPError as e2:
            logger.warning("Jikan search failed (%s), falling back to AniList", e2)
            data = await anilist_client.search_anime(query, page=page)
            return [_normalize_anilist(x) for x in data.get("Page", {}).get("media", [])]


def _denormalize_mal_detail(m: dict) -> dict:
    """Reshape MAL response to match expected detail schema."""
    main_pic = m.get("main_picture", {})
    return {
        "mal_id": m.get("id"),
        "title": m.get("title"),
        "title_english": m.get("alternative_titles", {}).get("en"),
        "title_japanese": m.get("alternative_titles", {}).get("ja"),
        "images": {"jpg": {"large_image_url": main_pic.get("large")}},
        "trailer": {"images": {"maximum_image_url": None}},
        "score": m.get("mean"),
        "popularity": m.get("popularity"),
        "members": m.get("num_list_users"),
        "genres": [{"mal_id": g.get("id"), "name": g.get("name")} for g in m.get("genres", [])],
        "synopsis": m.get("synopsis"),
        "studios": [{"name": s["name"]} for s in m.get("studios", [])],
        "status": m.get("status"),
        "episodes": m.get("num_episodes"),
        "rating": m.get("rating"),
        "year": int(m.get("start_date", "")[:4]) if m.get("start_date") else None,
    }


def _denormalize_jikan_detail(m: dict) -> dict:
    """Already in expected format from Jikan."""
    return m


def _denormalize_anilist_detail(m: dict) -> dict:
    """Reshape AniList response to match expected detail schema."""
    title = m.get("title") or {}
    score = m.get("averageScore")
    return {
        "mal_id": m.get("id"),
        "title": title.get("romaji") or title.get("english"),
        "title_english": title.get("english"),
        "title_japanese": title.get("native"),
        "images": {"jpg": {"large_image_url": (m.get("coverImage") or {}).get("large")}},
        "trailer": {"images": {"maximum_image_url": m.get("bannerImage")}},
        "score": (score / 10) if score is not None else None,
        "popularity": m.get("popularity"),
        "members": m.get("favourites"),
        "genres": [{"mal_id": None, "name": g} for g in m.get("genres", [])],
        "synopsis": m.get("description"),
        "studios": [{"name": s["name"]} for s in ((m.get("studios") or {}).get("nodes") or [])],
        "status": m.get("status"),
        "episodes": m.get("episodes"),
        "rating": None,
    }


async def get_detail(id_: int, source: str = "mal") -> dict:
    """
    Get anime detail: MAL (primary) → Jikan → AniList (fallback chain).
    
    source param lets frontend override source preference (for known AniList ids).
    """
    if source == "anilist":
        try:
            media = await anilist_client.get_anime_detail(id_)
            return _denormalize_anilist_detail(media)
        except httpx.HTTPError as e:
            logger.warning("AniList detail failed (%s), falling back to Jikan", e)
    elif source == "jikan":
        try:
            data = await jikan_client.get_anime_full(id_)
            return data.get("data", data)
        except httpx.HTTPError as e:
            logger.warning("Jikan detail failed (%s), trying MAL", e)

    # Try MAL first (default)
    try:
        data = await mal_client.get_anime_details(id_)
        return _denormalize_mal_detail(data)
    except httpx.HTTPError as e:
        logger.warning("MAL detail failed (%s), falling back to Jikan", e)
        try:
            data = await jikan_client.get_anime_full(id_)
            return data.get("data", data)
        except httpx.HTTPError as e2:
            logger.warning("Jikan detail failed (%s), falling back to AniList", e2)
            media = await anilist_client.get_anime_detail(id_)
            return _denormalize_anilist_detail(media)
