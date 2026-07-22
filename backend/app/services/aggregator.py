"""
Aggregation layer: tries MAL first (primary), then AniList (secondary), 
then Jikan (fallback). Normalizes all shapes into one consistent schema 
the frontend can rely on.
"""
import logging
from typing import Any

import httpx

from app.core.cache import cached
from app.core.config import get_settings
from app.services import anilist_client, jikan_client, mal_client

logger = logging.getLogger("anibinge.aggregator")
settings = get_settings()


def _is_valid_results(results: list[dict]) -> bool:
    """Check if normalized results actually contain usable data."""
    if not results:
        return False
    return any(r.get("id") is not None for r in results)


def _normalize_mal(item: dict) -> dict:
    """Normalize MyAnimeList response to standard schema."""
    if "node" in item:
        item = item["node"]
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
        "synopsis": item.get("description"),
        "year": item.get("seasonYear"),
        "season": item.get("season"),
        "format": item.get("format"),
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
        "broadcast": item.get("broadcast"),
    }


@cached("agg:trending", ttl=settings.CACHE_TTL_SHORT)
async def get_trending(page: int = 1) -> list[dict]:
    """Get trending anime: MAL (primary) → AniList → Jikan (fallback chain)."""
    try:
        data = await mal_client.get_anime_ranking(ranking_type="by_popularity", page=page)
        results = [_normalize_mal(x) for x in data.get("data", [])]
        if _is_valid_results(results):
            logger.info("Trending from MAL: %d results", len(results))
            return results
        logger.warning("MAL trending returned invalid data, falling back to AniList")
    except Exception as e:
        logger.warning("MAL trending failed (%s), falling back to AniList", e)
    try:
        data = await anilist_client.get_trending(page=page)
        results = [_normalize_anilist(x) for x in data.get("Page", {}).get("media", [])]
        if _is_valid_results(results):
            logger.info("Trending from AniList: %d results", len(results))
            return results
        logger.warning("AniList trending returned invalid data, falling back to Jikan")
    except Exception as e2:
        logger.warning("AniList trending failed (%s), falling back to Jikan", e2)
    try:
        data = await jikan_client.get_top_anime(page=page, filter_type="bypopularity")
        results = [_normalize_jikan(x) for x in data.get("data", [])]
        logger.info("Trending from Jikan: %d results", len(results))
        return results
    except Exception as e3:
        logger.error("All trending sources failed: %s", e3)
        return []


@cached("agg:search", ttl=settings.CACHE_TTL_SHORT)
async def search(query: str, page: int = 1, **filters) -> list[dict]:
    """Search anime: MAL (primary) → AniList → Jikan (fallback chain)."""
    try:
        data = await mal_client.search_anime(query, page=page)
        results = [_normalize_mal(x) for x in data.get("data", [])]
        if _is_valid_results(results):
            logger.info("Search '%s' from MAL: %d results", query, len(results))
            return results
        logger.warning("MAL search returned invalid data for '%s', falling back to AniList", query)
    except Exception as e:
        logger.warning("MAL search failed (%s), falling back to AniList", e)
    try:
        data = await anilist_client.search_anime(query, page=page)
        results = [_normalize_anilist(x) for x in data.get("Page", {}).get("media", [])]
        if _is_valid_results(results):
            logger.info("Search '%s' from AniList: %d results", query, len(results))
            return results
        logger.warning("AniList search returned invalid data for '%s', falling back to Jikan", query)
    except Exception as e2:
        logger.warning("AniList search failed (%s), falling back to Jikan", e2)
    try:
        data = await jikan_client.search_anime(query, page=page, **filters)
        results = [_normalize_jikan(x) for x in data.get("data", [])]
        logger.info("Search '%s' from Jikan: %d results", query, len(results))
        return results
    except Exception as e3:
        logger.error("All search sources failed for '%s': %s", query, e3)
        return []


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


def _denormalize_jikan_detail(m: dict) -> dict:
    """Already in expected format from Jikan."""
    return m


@cached("agg:detail", ttl=settings.CACHE_TTL_MEDIUM)
async def get_detail(id_: int, source: str = "mal") -> dict:
    """
    Get anime detail: MAL → Jikan (fallback chain).
    AniList IDs are different from MAL IDs, so we only try AniList
    when the source is explicitly "anilist".
    """
    if source == "anilist":
        try:
            media = await anilist_client.get_anime_detail(id_)
            logger.info("Anime detail %s from AniList", id_)
            return _denormalize_anilist_detail(media.get("Media", {}))
        except Exception as e:
            logger.warning("AniList detail failed (%s), trying Jikan", e)
        try:
            data = await jikan_client.get_anime_full(id_)
            logger.info("Anime detail %s from Jikan (fallback)", id_)
            return data.get("data", data)
        except Exception as e2:
            logger.error("All detail sources failed for %s: %s", id_, e2)
            raise

    if source == "jikan":
        try:
            data = await jikan_client.get_anime_full(id_)
            logger.info("Anime detail %s from Jikan", id_)
            return data.get("data", data)
        except Exception as e:
            logger.warning("Jikan detail failed (%s), trying MAL", e)
        try:
            data = await mal_client.get_anime_details(id_)
            logger.info("Anime detail %s from MAL (fallback)", id_)
            return _denormalize_mal_detail(data)
        except Exception as e2:
            logger.error("All detail sources failed for %s: %s", id_, e2)
            raise

    # Default: MAL → Jikan (no AniList cross-reference, IDs don't match)
    try:
        data = await mal_client.get_anime_details(id_)
        logger.info("Anime detail %s from MAL", id_)
        return _denormalize_mal_detail(data)
    except Exception as e:
        logger.warning("MAL detail failed (%s), trying Jikan", e)
        try:
            data = await jikan_client.get_anime_full(id_)
            logger.info("Anime detail %s from Jikan (fallback)", id_)
            return data.get("data", data)
        except Exception as e2:
            logger.error("All detail sources failed for %s: %s", id_, e2)
            raise


@cached("agg:top", ttl=settings.CACHE_TTL_MEDIUM)
async def get_top(page: int = 1) -> list[dict]:
    """Get top-rated anime: MAL → AniList → Jikan."""
    try:
        data = await mal_client.get_anime_ranking(ranking_type="all", page=page)
        results = [_normalize_mal(x) for x in data.get("data", [])]
        if _is_valid_results(results):
            logger.info("Top anime from MAL: %d results", len(results))
            return results
        logger.warning("MAL top returned invalid data, falling back to AniList")
    except Exception as e:
        logger.warning("MAL top failed (%s), falling back to AniList", e)
    try:
        data = await anilist_client.get_top(page=page)
        results = [_normalize_anilist(x) for x in data.get("Page", {}).get("media", [])]
        if _is_valid_results(results):
            logger.info("Top anime from AniList: %d results", len(results))
            return results
        logger.warning("AniList top returned invalid data, falling back to Jikan")
    except Exception as e2:
        logger.warning("AniList top failed (%s), falling back to Jikan", e2)
    try:
        data = await jikan_client.get_top_anime(page=page, filter_type="favorite")
        results = [_normalize_jikan(x) for x in data.get("data", [])]
        logger.info("Top anime from Jikan: %d results", len(results))
        return results
    except Exception as e3:
        logger.error("All top sources failed: %s", e3)
        return []


@cached("agg:seasonal", ttl=settings.CACHE_TTL_MEDIUM)
async def get_seasonal(year: int, season: str, page: int = 1) -> list[dict]:
    """Get seasonal anime: MAL → AniList → Jikan."""
    try:
        data = await mal_client.get_seasonal_anime(year, season.lower(), page=page)
        results = [_normalize_mal(x) for x in data.get("data", [])]
        if _is_valid_results(results):
            logger.info("Seasonal %s %d from MAL: %d results", season, year, len(results))
            return results
        logger.warning("MAL seasonal returned invalid data for %s %d, falling back to AniList", season, year)
    except Exception as e:
        logger.warning("MAL seasonal failed (%s), falling back to AniList", e)
    try:
        data = await anilist_client.get_seasonal(year, season, page=page)
        results = [_normalize_anilist(x) for x in data.get("Page", {}).get("media", [])]
        if _is_valid_results(results):
            logger.info("Seasonal %s %d from AniList: %d results", season, year, len(results))
            return results
        logger.warning("AniList seasonal returned invalid data for %s %d, falling back to Jikan", season, year)
    except Exception as e2:
        logger.warning("AniList seasonal failed (%s), falling back to Jikan", e2)
    try:
        data = await jikan_client.get_seasonal_anime(year, season.lower(), page=page)
        results = [_normalize_jikan(x) for x in data.get("data", [])]
        logger.info("Seasonal %s %d from Jikan: %d results", season, year, len(results))
        return results
    except Exception as e3:
        logger.error("All seasonal sources failed for %s %d: %s", season, year, e3)
        return []


_DAY_MAP = {
    "monday": "monday", "mondays": "monday",
    "tuesday": "tuesday", "tuesdays": "tuesday",
    "wednesday": "wednesday", "wednesdays": "wednesday",
    "thursday": "thursday", "thursdays": "thursday",
    "friday": "friday", "fridays": "friday",
    "saturday": "saturday", "saturdays": "saturday",
    "sunday": "sunday", "sundays": "sunday",
}


def _extract_day(item: dict) -> str | None:
    """Pull the broadcast day from a Jikan anime item and normalize it."""
    broadcast = item.get("broadcast") or {}
    day_str = (broadcast.get("day") or "").strip().lower()
    return _DAY_MAP.get(day_str)


@cached("agg:weekly_schedule:v2", ttl=settings.CACHE_TTL_SHORT)
async def get_weekly_schedule() -> dict:
    """Fetch the full weekly schedule and group by broadcast day.

    Instead of trusting Jikan's day filter (which is unreliable), we fetch
    ALL schedules once, then group client-side using the broadcast.day field
    that each anime carries. This guarantees each day shows only the anime
    that actually air on that day.
    """
    DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    grouped: dict[str, list[dict]] = {d: [] for d in DAYS}

    # --- 1. Try Jikan (best source for broadcast-day grouping) ---
    try:
        data = await jikan_client.get_all_schedules()
        items = data.get("data", [])
        if items:
            for raw in items:
                day = _extract_day(raw)
                if day and day in grouped:
                    grouped[day].append(_normalize_jikan(raw))
            logger.info(
                "Weekly schedule from Jikan: %d total, %s per-day counts",
                len(items),
                {d: len(v) for d, v in grouped.items() if v},
            )
            # If we got a reasonable distribution, return it
            if any(len(v) > 0 for v in grouped.values()):
                return {"data": grouped}
    except Exception as e:
        logger.warning("Jikan weekly schedule failed (%s), trying fallback", e)

    # --- 2. Fallback: MAL airing ranking (no broadcast-day info) ---
    try:
        data = await mal_client.get_anime_ranking(ranking_type="airing", page=1, limit=100)
        results = [_normalize_mal(x) for x in data.get("data", [])]
        if results:
            # MAL doesn't provide broadcast day in ranking data,
            # so put everything under a generic key and let the frontend
            # show it as "today's airing" or similar.
            logger.info("Weekly schedule fallback from MAL: %d results", len(results))
            return {"data": grouped, "fallback": results}
    except Exception as e:
        logger.warning("MAL ranking fallback failed for weekly schedule: %s", e)

    return {"data": grouped}


@cached("agg:schedule:v2", ttl=settings.CACHE_TTL_SHORT)
async def get_schedule(day: str | None = None, page: int = 1) -> dict:
    """Get schedule/airing anime for a single day.

    Uses the weekly schedule (which groups by broadcast.day) and extracts
    the requested day — more reliable than Jikan's per-day filter.
    """
    if day:
        weekly = await get_weekly_schedule()
        day_data = weekly.get("data", {}).get(day, [])
        if day_data:
            logger.info("Schedule for %s from grouped weekly: %d results", day, len(day_data))
            return {"data": day_data}

        # Fallback: try Jikan's per-day filter directly
        try:
            data = await jikan_client.get_schedule(day)
            results = [_normalize_jikan(x) for x in data.get("data", [])]
            if results:
                logger.info("Schedule for %s from Jikan filter: %d results", day, len(results))
                return {"data": results}
        except Exception as e:
            logger.warning("Jikan schedule filter failed for %s: %s", day, e)

        # AniList doesn't have day-of-week filtering, but returns
        # currently releasing anime which is better than nothing.
        try:
            data = await anilist_client.get_schedule(page=page)
            results = [_normalize_anilist(x) for x in data.get("Page", {}).get("media", [])]
            if _is_valid_results(results):
                logger.info("Schedule for %s from AniList (no day filter): %d results", day, len(results))
                return {"data": results}
        except Exception as e:
            logger.warning("AniList schedule failed for %s: %s", day, e)

        try:
            data = await mal_client.get_anime_ranking(ranking_type="airing", page=page)
            results = [_normalize_mal(x) for x in data.get("data", [])]
            if _is_valid_results(results):
                logger.info("Schedule for %s from MAL ranking: %d results", day, len(results))
                return {"data": results}
        except Exception as e:
            logger.warning("MAL ranking failed for schedule %s: %s", day, e)

        return {"data": []}
    else:
        # No day filter — "currently airing" overview. Try MAL first,
        # then AniList, then Jikan.
        try:
            data = await mal_client.get_anime_ranking(ranking_type="airing", page=page)
            results = [_normalize_mal(x) for x in data.get("data", [])]
            if _is_valid_results(results):
                logger.info("Airing from MAL: %d results", len(results))
                return {"data": results}
            logger.warning("MAL airing returned invalid data, falling back to AniList")
        except Exception as e:
            logger.warning("MAL airing failed (%s), falling back to AniList", e)
        try:
            data = await anilist_client.get_schedule(page=page)
            results = [_normalize_anilist(x) for x in data.get("Page", {}).get("media", [])]
            if _is_valid_results(results):
                logger.info("Airing from AniList: %d results", len(results))
                return {"data": results}
            logger.warning("AniList schedule returned invalid data, falling back to Jikan")
        except Exception as e2:
            logger.warning("AniList schedule failed (%s), falling back to Jikan", e2)
        try:
            data = await jikan_client.get_schedule()
            results = [_normalize_jikan(x) for x in data.get("data", [])]
            logger.info("Airing from Jikan: %d results", len(results))
            return {"data": results}
        except Exception as e3:
            logger.error("All airing sources failed: %s", e3)
            return {"data": []}


@cached("agg:recommendations:v2", ttl=settings.CACHE_TTL_MEDIUM)
async def get_recommendations(anime_id: int, page: int = 1) -> list[dict]:
    """Get recommendations for an anime: Jikan (primary) → AniList (secondary).
    MAL has no recommendations endpoint, so we skip it entirely."""
    try:
        data = await jikan_client.get_anime_recommendations(anime_id)
        results = [
            _normalize_jikan(x.get("entry", {}))
            for x in data.get("data", [])
            if x.get("entry")
        ]
        if results:
            logger.info("Recommendations for %s from Jikan: %d results", anime_id, len(results))
            return results
        logger.warning("Jikan recommendations empty for %s, trying AniList", anime_id)
    except Exception as e:
        logger.warning("Jikan recommendations failed (%s), trying AniList", e)
    try:
        data = await anilist_client.get_recommendations(anime_id, page=page)
        results = [
            _normalize_anilist(x.get("mediaRecommendation", {}))
            for x in data.get("Media", {}).get("recommendations", {}).get("nodes", [])
            if x.get("mediaRecommendation")
        ]
        if results:
            logger.info("Recommendations for %s from AniList: %d results", anime_id, len(results))
            return results
    except Exception as e2:
        logger.warning("AniList recommendations failed for %s: %s", anime_id, e2)
    return []


@cached("agg:characters:v2", ttl=settings.CACHE_TTL_MEDIUM)
async def get_characters(anime_id: int) -> dict:
    """Get characters for an anime: Jikan (primary) → MAL (fallback).
    Returns empty if no source provides usable data (names/images)."""
    try:
        data = await jikan_client.get_anime_characters(anime_id)
        results = data.get("data", [])
        if results and any(c.get("character", {}).get("name") for c in results):
            logger.info("Characters for %s from Jikan", anime_id)
            return data
        logger.warning("Jikan characters returned incomplete data for %s, trying MAL", anime_id)
    except Exception as e:
        logger.warning("Jikan characters failed (%s), trying MAL", e)
    try:
        data = await mal_client.get_anime_characters(anime_id)
        results = data.get("data", [])
        if results and any(c.get("node", {}).get("name") for c in results):
            logger.info("Characters for %s from MAL", anime_id)
            return data
        logger.warning("MAL characters returned incomplete data for %s", anime_id)
    except Exception as e:
        logger.warning("MAL characters failed (%s)", e)
    return {"data": []}


@cached("agg:staff", ttl=settings.CACHE_TTL_MEDIUM)
async def get_staff(anime_id: int) -> dict:
    """Get staff for an anime: MAL → Jikan."""
    try:
        # MAL doesn't expose staff directly, use Jikan
        data = await jikan_client.get_anime_staff(anime_id)
        logger.info("Staff for %s from Jikan", anime_id)
        return data
    except Exception as e:
        logger.error("All staff sources failed for %s: %s", anime_id, e)
        return {"data": []}


@cached("agg:genres", ttl=settings.CACHE_TTL_LONG)
async def get_genres() -> dict:
    """Get all genres: MAL → AniList → Jikan."""
    try:
        data = await mal_client.get_genres()
        logger.info("Genres from MAL")
        return data
    except Exception as e:
        logger.warning("MAL genres failed (%s), falling back to Jikan", e)
        try:
            data = await jikan_client.get_genres()
            logger.info("Genres from Jikan")
            return data
        except Exception as e2:
            logger.error("All genre sources failed: %s", e2)
            return {"data": []}
