"""
Aggregation layer: tries MAL first (primary), then AniList (secondary), 
then Jikan (fallback), then GogoAnime (streaming search fallback).
Normalizes all shapes into one consistent schema the frontend can rely on.
"""
import asyncio
import logging
from typing import Any

import httpx

from app.core.cache import cached
from app.core.config import get_settings
from app.services import anilist_client, jikan_client, mal_client, gogoanime_client, animeschedule_client

logger = logging.getLogger("anibinge.aggregator")
settings = get_settings()


def _is_valid_results(results: list[dict]) -> bool:
    """Check if normalized results actually contain usable data."""
    if not results:
        return False
    return any(r.get("id") is not None for r in results)


async def _enrich_images_anilist(results: list[dict]) -> list[dict]:
    """Replace broken/animeschedule images with AniList CDN images using MAL IDs."""
    mal_ids = [r["id"] for r in results if isinstance(r.get("id"), int)]
    if not mal_ids:
        logger.info("AniList enrichment: no MAL IDs found, skipping")
        return results
    try:
        query = """
        query($ids:[Int]){
          Page(page:1,perPage:50){
            media(idMal_in:$ids,type:ANIME){
              idMal
              coverImage{ large }
              bannerImage
            }
          }
        }
        """
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://graphql.anilist.co",
                json={"query": query, "variables": {"ids": mal_ids}},
            )
            resp.raise_for_status()
            data = resp.json().get("data", {})
        image_map = {}
        for m in data.get("Page", {}).get("media", []):
            mid = m.get("idMal")
            if mid:
                image_map[mid] = m
        for r in results:
            mid = r.get("id")
            if isinstance(mid, int) and mid in image_map:
                m = image_map[mid]
                r["image"] = m.get("coverImage", {}).get("large") or r.get("image")
                r["banner"] = m.get("bannerImage") or r.get("banner")
        logger.info("Enriched %d results with AniList images", len(image_map))
    except Exception as e:
        logger.warning("AniList image enrichment failed: %s", e)
    return results


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
        "start_date": item.get("start_date"),
    }


def _normalize_anilist(item: dict) -> dict:
    """Normalize AniList response to standard schema."""
    title = item.get("title", {})
    start = item.get("startDate") or {}
    start_date = None
    if start.get("year") and start.get("month") and start.get("day"):
        start_date = f"{start['year']}-{start['month']:02d}-{start['day']:02d}"
    elif start.get("year") and start.get("month"):
        start_date = f"{start['year']}-{start['month']:02d}"
    elif start.get("year"):
        start_date = str(start["year"])
    air_time = None
    next_ep = item.get("nextAiringEpisode") or {}
    if next_ep.get("airingAt"):
        from datetime import datetime, timezone
        dt = datetime.fromtimestamp(next_ep["airingAt"], tz=timezone.utc)
        air_time = dt.strftime("%H:%M")
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
        "start_date": start_date,
        "air_time": air_time,
    }


def _normalize_jikan(item: dict) -> dict:
    """Normalize Jikan response to standard schema."""
    aired = item.get("aired") or {}
    broadcast = item.get("broadcast") or {}
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
        "broadcast": broadcast,
        "start_date": aired.get("string", "").split(" to ")[0].strip() if aired.get("string") else None,
        "air_time": broadcast.get("time"),
    }


def _normalize_gogoanime(item: dict) -> dict:
    """Normalize GogoAnime response to standard schema."""
    return {
        "id": None,
        "source": "gogoanime",
        "title": item.get("title"),
        "title_english": None,
        "image": item.get("poster"),
        "banner": None,
        "score": item.get("score"),
        "popularity": None,
        "episodes": item.get("episodes_count") or item.get("episodes"),
        "status": None,
        "genres": [],
        "synopsis": None,
        "year": None,
        "season": None,
        "format": item.get("type"),
        "_gogoanime_slug": item.get("slug"),
    }


def _normalize_animeschedule(item: dict) -> dict:
    """Normalize AnimeSchedule /anime response to standard schema."""
    premier = item.get("premier") or item.get("subPremier") or ""
    start_date = premier[:10] if premier and not premier.startswith("0001") else None
    if not start_date:
        month = item.get("month") or ""
        year = item.get("year") or ""
        if month and year and int(year) > 2000:
            month_map = {"January": "01", "February": "02", "March": "03", "April": "04",
                         "May": "05", "June": "06", "July": "07", "August": "08",
                         "September": "09", "October": "10", "November": "11", "December": "12"}
            mm = month_map.get(month, "01")
            start_date = f"{year}-{mm}-01"
    names = item.get("names") or {}
    image_route = item.get("imageVersionRoute", "")
    image = f"https://img.animeschedule.net/v3/img/{image_route}" if image_route else None
    genres = [g.get("name", "") for g in item.get("genres", [])]
    stats = item.get("stats") or {}
    sub_time = item.get("subTime") or item.get("jpnTime") or ""
    air_time = sub_time[11:16] if len(sub_time) > 16 else None
    # Extract MAL ID from websites.mal URL if available
    mal_id = None
    websites = item.get("websites") or {}
    mal_url = websites.get("mal") or ""
    if "/anime/" in mal_url:
        try:
            mal_id = int(mal_url.split("/anime/")[1].split("/")[0].split("_")[0])
        except (ValueError, IndexError):
            pass
    slug = item.get("route", "")
    return {
        "id": mal_id or slug,
        "source": "mal" if mal_id else "animeschedule",
        "title": item.get("title") or names.get("romaji"),
        "title_english": names.get("english"),
        "image": image,
        "banner": None,
        "score": (stats.get("averageScore") or 0) / 10 if stats.get("averageScore") else None,
        "popularity": stats.get("trackedCount"),
        "episodes": item.get("episodes"),
        "status": item.get("status"),
        "genres": genres,
        "synopsis": item.get("description"),
        "year": item.get("year"),
        "season": (item.get("season") or {}).get("season") if isinstance(item.get("season"), dict) else None,
        "format": (item.get("mediaTypes") or [{}])[0].get("name") if item.get("mediaTypes") else None,
        "start_date": start_date,
        "air_time": air_time,
    }


def _normalize_animeschedule_timetable(item: dict) -> dict:
    """Normalize AnimeSchedule /anime response (for schedule view)."""
    names = item.get("names") or {}
    image_route = item.get("imageVersionRoute", "")
    image = f"https://img.animeschedule.net/v3/img/{image_route}" if image_route else None
    genres = [g.get("name", "") for g in item.get("genres", [])]
    stats = item.get("stats") or {}
    premier = item.get("premier") or item.get("subPremier") or ""
    start_date = premier[:10] if premier and not premier.startswith("0001") else None
    if not start_date:
        month = item.get("month") or ""
        year = item.get("year") or ""
        if month and year and int(year) > 2000:
            month_map = {"January": "01", "February": "02", "March": "03", "April": "04",
                         "May": "05", "June": "06", "July": "07", "August": "08",
                         "September": "09", "October": "10", "November": "11", "December": "12"}
            mm = month_map.get(month, "01")
            start_date = f"{year}-{mm}-01"
    sub_time = item.get("subTime") or item.get("jpnTime") or ""
    air_time = sub_time[11:16] if len(sub_time) > 16 else None
    # Extract MAL ID from websites.mal URL if available
    mal_id = None
    websites = item.get("websites") or {}
    mal_url = websites.get("mal") or ""
    if "/anime/" in mal_url:
        try:
            mal_id = int(mal_url.split("/anime/")[1].split("/")[0].split("_")[0])
        except (ValueError, IndexError):
            pass
    slug = item.get("route", "")
    season_raw = item.get("season")
    season = season_raw.get("season") if isinstance(season_raw, dict) else season_raw
    return {
        "id": mal_id or slug,
        "source": "mal" if mal_id else "animeschedule",
        "title": item.get("title") or names.get("romaji"),
        "title_english": names.get("english"),
        "image": image,
        "banner": None,
        "score": (stats.get("averageScore") or 0) / 10 if stats.get("averageScore") else None,
        "popularity": stats.get("trackedCount"),
        "episodes": item.get("episodes"),
        "status": item.get("status"),
        "genres": genres,
        "synopsis": None,
        "year": item.get("year"),
        "season": season,
        "format": (item.get("mediaTypes") or [{}])[0].get("name") if item.get("mediaTypes") else None,
        "start_date": start_date,
        "air_time": air_time,
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
    """Search anime: MAL (primary) → AniList → Jikan → GogoAnime (fallback chain)."""
    has_filters = any(v for k, v in filters.items() if v is not None)

    if not has_filters:
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
        data = await anilist_client.search_anime(
            query, page=page,
            status=filters.get("status"),
            type=filters.get("type"),
            genres=filters.get("genres"),
            order_by=filters.get("order_by"),
            sort=filters.get("sort"),
        )
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
        if _is_valid_results(results):
            logger.info("Search '%s' from Jikan: %d results", query, len(results))
            return results
        logger.warning("Jikan search returned invalid data for '%s', falling back to GogoAnime", query)
    except Exception as e3:
        logger.warning("Jikan search failed (%s), falling back to GogoAnime", e3)
    try:
        gogo_results = await gogoanime_client.search_anime(query)
        results = [_normalize_gogoanime(x) for x in gogo_results]
        if _is_valid_results(results):
            logger.info("Search '%s' from GogoAnime: %d results", query, len(results))
            return results
    except Exception as e4:
        logger.warning("GogoAnime search failed for '%s': %s", query, e4)
    logger.error("All search sources failed for '%s'", query)
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


@cached("agg:detail:v3", ttl=settings.CACHE_TTL_MEDIUM)
async def get_detail(id_: int, source: str = "mal") -> dict:
    """
    Get anime detail with comprehensive fallback chain.
    Tries the preferred source first, then all others.
    Skips Jikan when MAL explicitly 404s (Jikan wraps MAL, same IDs).
    """
    tried = set()
    mal_404 = False

    async def _try_anilist():
        if "anilist" in tried:
            return None
        tried.add("anilist")
        try:
            media = await anilist_client.get_anime_detail(id_)
            m = media.get("Media")
            if m:
                logger.info("Anime detail %s from AniList", id_)
                return _denormalize_anilist_detail(m)
        except Exception as e:
            logger.warning("AniList detail failed for %s: %s", id_, e)
        return None

    async def _try_mal():
        nonlocal mal_404
        if "mal" in tried:
            return None
        tried.add("mal")
        try:
            data = await mal_client.get_anime_details(id_)
            logger.info("Anime detail %s from MAL", id_)
            return _denormalize_mal_detail(data)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                mal_404 = True
            logger.warning("MAL detail failed for %s: %s", id_, e)
        except Exception as e:
            logger.warning("MAL detail failed for %s: %s", id_, e)
        return None

    async def _try_jikan():
        # Jikan wraps MAL — same IDs. If MAL 404'd, Jikan will too.
        if mal_404:
            return None
        if "jikan" in tried:
            return None
        tried.add("jikan")
        try:
            data = await jikan_client.get_anime_full(id_)
            logger.info("Anime detail %s from Jikan", id_)
            return data.get("data", data)
        except Exception as e:
            logger.warning("Jikan detail failed for %s: %s", id_, e)
        return None

    # Build priority order based on requested source
    if source == "anilist":
        chain = [_try_anilist, _try_mal, _try_jikan]
    elif source == "jikan":
        chain = [_try_jikan, _try_mal, _try_anilist]
    else:
        chain = [_try_mal, _try_jikan, _try_anilist]

    for fn in chain:
        result = await fn()
        if result:
            return result

    logger.error("All detail sources failed for %s (tried: %s)", id_, tried)
    raise Exception(f"No detail source available for anime {id_}")


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


@cached("agg:upcoming", ttl=settings.CACHE_TTL_MEDIUM)
async def get_upcoming(page: int = 1) -> list[dict]:
    """Get upcoming (not yet aired) anime: AnimeSchedule only."""
    if not settings.ANIMESCHEDULE_API_TOKEN:
        logger.error("AnimeSchedule API token not configured")
        return []
    items = await animeschedule_client.animeschedule.get_anime_list(
        airing_statuses="upcoming", page=page, per_page=25
    )
    results = [_normalize_animeschedule(x) for x in items]
    results = await _enrich_images_anilist(results)
    logger.info("Upcoming from AnimeSchedule: %d results", len(results))
    return results


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


@cached("agg:weekly_schedule:v5", ttl=settings.CACHE_TTL_SHORT)
async def get_weekly_schedule() -> dict:
    """Fetch the weekly schedule grouped by broadcast day.

    Uses AnimeSchedule timetable only.
    """
    from datetime import datetime

    DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    grouped: dict[str, list[dict]] = {d: [] for d in DAYS}

    if not settings.ANIMESCHEDULE_API_TOKEN:
        raise ValueError("ANIMESCHEDULE_API_TOKEN not configured")

    for pg in range(1, 4):
        items = await animeschedule_client.animeschedule.get_anime_list(
            airing_statuses="ongoing", page=pg, per_page=50
        )
        if not items:
            break
        for item in items:
            if not isinstance(item, dict):
                continue
            sub_time = item.get("subTime") or item.get("jpnTime") or ""
            if not sub_time or len(sub_time) < 10:
                continue
            try:
                dt = datetime.fromisoformat(sub_time.replace("Z", "+00:00"))
                day_name = DAYS[dt.weekday()]
                grouped[day_name].append(_normalize_animeschedule_timetable(item))
            except (ValueError, IndexError):
                continue

    counts = {d: len(v) for d, v in grouped.items() if v}
    if counts:
        all_items = [item for v in grouped.values() for item in v]
        enriched = await _enrich_images_anilist(all_items)
        enriched_grouped = {d: [] for d in grouped}
        idx = 0
        for d in grouped:
            for _ in grouped[d]:
                enriched_grouped[d].append(enriched[idx])
                idx += 1
        logger.info("Weekly schedule from AnimeSchedule: %s", counts)
        return {"data": enriched_grouped}

    return {"data": grouped}


@cached("agg:schedule:v4", ttl=settings.CACHE_TTL_SHORT)
async def get_schedule(day: str | None = None, page: int = 1) -> dict:
    """Get schedule/airing anime for a single day.

    Primary: AnimeSchedule timetable (has per-day broadcast info).
    Fallback 1: AniList — RELEASING anime with nextAiringEpisode timestamps.
    Fallback 2: Jikan per-day filter.
    """
    if day:
        # --- 1. AnimeSchedule: filter ongoing anime by subTime day-of-week ---
        if settings.ANIMESCHEDULE_API_TOKEN:
            try:
                from datetime import datetime as _dt, timezone as _tz
                _DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
                for pg in range(1, 4):
                    items = await animeschedule_client.animeschedule.get_anime_list(
                        airing_statuses="ongoing", page=pg, per_page=50
                    )
                    if not items:
                        break
                    for item in items:
                        if not isinstance(item, dict):
                            continue
                        sub_time = item.get("subTime") or item.get("jpnTime") or ""
                        if not sub_time or len(sub_time) < 10:
                            continue
                        try:
                            dt = _dt.fromisoformat(sub_time.replace("Z", "+00:00"))
                            if _DAYS[dt.weekday()] == day:
                                day_items.append(_normalize_animeschedule_timetable(item))
                        except (ValueError, IndexError):
                            continue
                if day_items:
                    day_items = await _enrich_images_anilist(day_items)
                    logger.info("Schedule for %s from AnimeSchedule: %d results", day, len(day_items))
                    return {"data": day_items}
            except Exception as e:
                logger.warning("AnimeSchedule schedule failed for %s: %s", day, e)

        # --- 2. AniList: filter by nextAiringEpisode day-of-week ---
        try:
            from datetime import datetime, timezone
            DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
            data = await anilist_client.get_schedule(page=1, per_page=50)
            media_list = data.get("Page", {}).get("media", [])
            day_items = []
            for item in media_list:
                next_ep = item.get("nextAiringEpisode")
                if not next_ep or not next_ep.get("airingAt"):
                    continue
                dt = datetime.fromtimestamp(next_ep["airingAt"], tz=timezone.utc)
                if DAYS[dt.weekday()] == day:
                    day_items.append(_normalize_anilist(item))
            if day_items:
                logger.info("Schedule for %s from AniList: %d results", day, len(day_items))
                return {"data": day_items}
        except Exception as e:
            logger.warning("AniList schedule failed for %s: %s", day, e)

        # --- 3. Jikan: per-day filter ---
        try:
            data = await jikan_client.get_schedule(day)
            results = [_normalize_jikan(x) for x in data.get("data", [])]
            if results:
                logger.info("Schedule for %s from Jikan filter: %d results", day, len(results))
                return {"data": results}
        except Exception as e:
            logger.warning("Jikan schedule filter failed for %s: %s", day, e)

        return {"data": []}
    else:
        # No day — "currently airing" overview
        try:
            data = await mal_client.get_anime_ranking(ranking_type="airing", page=page)
            results = [_normalize_mal(x) for x in data.get("data", [])]
            if _is_valid_results(results):
                logger.info("Airing from MAL: %d results", len(results))
                return {"data": results}
        except Exception as e:
            logger.warning("MAL airing failed (%s), falling back to AniList", e)
        try:
            data = await anilist_client.get_schedule(page=page)
            results = [_normalize_anilist(x) for x in data.get("Page", {}).get("media", [])]
            if _is_valid_results(results):
                logger.info("Airing from AniList: %d results", len(results))
                return {"data": results}
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


@cached("agg:characters:v3", ttl=settings.CACHE_TTL_MEDIUM)
async def get_characters(anime_id: int) -> dict:
    """Get characters for an anime: Jikan (primary) → MAL → AniList.
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
        logger.warning("MAL characters returned incomplete data for %s, trying AniList", anime_id)
    except Exception as e:
        logger.warning("MAL characters failed (%s), trying AniList", e)
    try:
        data = await anilist_client.get_anime_characters(anime_id)
        edges = data.get("Media", {}).get("characters", {}).get("edges", [])
        normalized = []
        for edge in edges:
            node = edge.get("node", {})
            name = node.get("name", {})
            full_name = name.get("full") or f"{name.get('first', '')} {name.get('last', '')}".strip()
            if full_name:
                normalized.append({
                    "character": {
                        "mal_id": node.get("id"),
                        "name": full_name,
                        "images": {
                            "jpg": {
                                "image_url": (node.get("image") or {}).get("large")
                                or (node.get("image") or {}).get("medium")
                            }
                        },
                    },
                    "role": (edge.get("role") or "supporting").lower(),
                })
        if normalized:
            logger.info("Characters for %s from AniList: %d results", anime_id, len(normalized))
            return {"data": normalized}
    except Exception as e:
        logger.warning("AniList characters failed for %s: %s", anime_id, e)
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
