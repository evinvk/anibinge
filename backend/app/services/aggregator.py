"""
Aggregator Service

Centralized service that normalizes AniList metadata and merges with Wibu streaming data.
The only service used by routers - handles:
- Metadata retrieval from AniList
- Streaming info from Wibu
- Response normalization
- Caching
- Error handling and retry logic
"""
import logging
from typing import Any, Optional

import httpx

from app.core.cache import cached
from app.core.config import get_settings
from app.services import anilist_client, wibu_client

logger = logging.getLogger("anibinge.aggregator")
settings = get_settings()


class NormalizationError(Exception):
    """Raised when data normalization fails."""
    pass


def _normalize_anilist(item: dict) -> dict:
    """
    Normalize AniList media object to standardized schema.
    
    This is the consistent format all frontend code expects.
    """
    if not item:
        return {}
        
    title = item.get("title", {})
    cover = item.get("coverImage", {})
    score = item.get("averageScore")
    
    return {
        "id": item.get("id"),
        "id_mal": item.get("idMal"),  # MAL ID for cross-reference if available
        "source": "anilist",
        "title": title.get("romaji") or title.get("english"),
        "title_romaji": title.get("romaji"),
        "title_english": title.get("english"),
        "title_native": title.get("native"),
        "image": cover.get("large"),
        "image_extra_large": cover.get("extraLarge"),
        "banner": item.get("bannerImage"),
        "score": (score / 10) if score is not None else None,
        "popularity": item.get("popularity"),
        "episodes": item.get("episodes"),
        "duration": item.get("duration"),  # minutes per episode
        "status": item.get("status"),  # RELEASING, FINISHED, NOT_YET_RELEASED, CANCELLED
        "genres": item.get("genres", []),
        "format": item.get("format"),  # TV, MOVIE, OVA, ONA, SPECIAL
        "synopsis": item.get("description"),
        "year": item.get("seasonYear"),
        "season": item.get("season"),  # WINTER, SPRING, SUMMER, FALL
        "studios": [
            {"id": s.get("id"), "name": s.get("name")}
            for s in (item.get("studios", {}).get("nodes") or [])
        ],
        "tags": [
            {
                "id": t.get("id"),
                "name": t.get("name"),
                "rank": t.get("rank"),
                "is_adult": t.get("isAdult"),
            }
            for t in (item.get("tags") or [])
        ],
        "next_airing_episode": item.get("nextAiringEpisode"),
    }


# ============== SEARCH & DISCOVERY ==============

@cached("agg:search", ttl=settings.CACHE_TTL_SHORT)
async def search(query: str, page: int = 1, per_page: int = 20) -> dict[str, Any]:
    """
    Search for anime across AniList.
    Returns normalized results.
    """
    try:
        data = await anilist_client.search_anime(query, page=page, per_page=per_page)
        media_list = data.get("Page", {}).get("media", [])
        page_info = data.get("Page", {}).get("pageInfo", {})
        
        return {
            "results": [_normalize_anilist(item) for item in media_list],
            "pagination": {
                "current_page": page_info.get("currentPage"),
                "has_next_page": page_info.get("hasNextPage"),
                "last_page": page_info.get("lastPage"),
                "total": page_info.get("total"),
            },
        }
    except httpx.HTTPError as e:
        logger.error(f"Search failed: {e}")
        raise


@cached("agg:trending", ttl=settings.CACHE_TTL_SHORT)
async def get_trending(page: int = 1, per_page: int = 20) -> dict[str, Any]:
    """
    Get trending anime from AniList.
    """
    try:
        data = await anilist_client.get_trending(page=page, per_page=per_page)
        media_list = data.get("Page", {}).get("media", [])
        page_info = data.get("Page", {}).get("pageInfo", {})
        
        return {
            "results": [_normalize_anilist(item) for item in media_list],
            "pagination": {
                "current_page": page_info.get("currentPage"),
                "has_next_page": page_info.get("hasNextPage"),
                "last_page": page_info.get("lastPage"),
                "total": page_info.get("total"),
            },
        }
    except httpx.HTTPError as e:
        logger.error(f"Get trending failed: {e}")
        raise


@cached("agg:popular", ttl=settings.CACHE_TTL_SHORT)
async def get_popular(page: int = 1, per_page: int = 20) -> dict[str, Any]:
    """
    Get popular anime from AniList.
    """
    try:
        data = await anilist_client.get_popular(page=page, per_page=per_page)
        media_list = data.get("Page", {}).get("media", [])
        page_info = data.get("Page", {}).get("pageInfo", {})
        
        return {
            "results": [_normalize_anilist(item) for item in media_list],
            "pagination": {
                "current_page": page_info.get("currentPage"),
                "has_next_page": page_info.get("hasNextPage"),
                "last_page": page_info.get("lastPage"),
                "total": page_info.get("total"),
            },
        }
    except httpx.HTTPError as e:
        logger.error(f"Get popular failed: {e}")
        raise


# ============== SEASONAL & SCHEDULE ==============

@cached("agg:seasonal", ttl=settings.CACHE_TTL_MEDIUM)
async def get_seasonal(
    season: str, year: int, page: int = 1, per_page: int = 20
) -> dict[str, Any]:
    """
    Get anime for a specific season and year.
    
    Args:
        season: WINTER, SPRING, SUMMER, or FALL
        year: Year (e.g., 2024)
        page: Pagination
        per_page: Results per page
    """
    try:
        data = await anilist_client.get_seasonal(
            season=season, year=year, page=page, per_page=per_page
        )
        media_list = data.get("Page", {}).get("media", [])
        page_info = data.get("Page", {}).get("pageInfo", {})
        
        return {
            "results": [_normalize_anilist(item) for item in media_list],
            "pagination": {
                "current_page": page_info.get("currentPage"),
                "has_next_page": page_info.get("hasNextPage"),
                "last_page": page_info.get("lastPage"),
                "total": page_info.get("total"),
            },
        }
    except httpx.HTTPError as e:
        logger.error(f"Get seasonal failed for {season} {year}: {e}")
        raise


@cached("agg:airing_schedule", ttl=settings.CACHE_TTL_SHORT)
async def get_airing_schedule(page: int = 1, per_page: int = 50) -> dict[str, Any]:
    """
    Get currently airing anime with next episode information.
    """
    try:
        data = await anilist_client.get_airing_schedule(page=page, per_page=per_page)
        schedules = data.get("Page", {}).get("airingSchedules", [])
        page_info = data.get("Page", {}).get("pageInfo", {})
        
        results = []
        for schedule in schedules:
            media = schedule.get("media", {})
            results.append({
                "airing_id": schedule.get("id"),
                "episode": schedule.get("episode"),
                "airing_at": schedule.get("airingAt"),
                "time_until_airing": schedule.get("timeUntilAiring"),
                "media": _normalize_anilist(media),
            })
        
        return {
            "results": results,
            "pagination": {
                "current_page": page_info.get("currentPage"),
                "has_next_page": page_info.get("hasNextPage"),
                "last_page": page_info.get("lastPage"),
                "total": page_info.get("total"),
            },
        }
    except httpx.HTTPError as e:
        logger.error(f"Get airing schedule failed: {e}")
        raise


# ============== DETAIL PAGES ==============

@cached("agg:detail", ttl=settings.CACHE_TTL_MEDIUM)
async def get_anime_detail(anilist_id: int) -> dict[str, Any]:
    """
    Get detailed anime information from AniList.
    Merges metadata with streaming availability.
    """
    try:
        data = await anilist_client.get_anime(anilist_id)
        normalized = _normalize_anilist(data)
        
        # Try to get streaming info from Wibu if available
        try:
            # Use AniList ID or MAL ID if available
            anime_identifier = str(data.get("idMal") or anilist_id)
            episodes_data = await wibu_client.get_episodes(anime_identifier)
            normalized["streaming"] = {
                "available": True,
                "episodes": episodes_data.get("episodes", []),
                "total_episodes": episodes_data.get("total", data.get("episodes")),
            }
        except Exception as e:
            logger.warning(f"Failed to get Wibu streaming data for {anilist_id}: {e}")
            normalized["streaming"] = {
                "available": False,
                "episodes": [],
            }
        
        return normalized
    except httpx.HTTPError as e:
        logger.error(f"Get anime detail failed for {anilist_id}: {e}")
        raise


# ============== CHARACTERS & STAFF ==============

@cached("agg:characters", ttl=settings.CACHE_TTL_LONG)
async def get_characters(anilist_id: int) -> dict[str, Any]:
    """
    Get anime characters with voice actor information.
    """
    try:
        data = await anilist_client.get_characters(anilist_id)
        characters = data.get("Media", {}).get("characters", {}).get("edges", [])
        
        return {
            "characters": [
                {
                    "character_id": char.get("node", {}).get("id"),
                    "role": char.get("role"),
                    "character": {
                        "name": char.get("node", {}).get("name", {}),
                        "image": char.get("node", {}).get("image", {}).get("large"),
                        "description": char.get("node", {}).get("description"),
                    },
                    "voice_actors": [
                        {
                            "id": va.get("id"),
                            "name": va.get("name", {}),
                            "image": va.get("image", {}).get("large"),
                            "language": va.get("language"),
                        }
                        for va in (char.get("voiceActors") or [])
                    ],
                }
                for char in characters
            ]
        }
    except httpx.HTTPError as e:
        logger.error(f"Get characters failed for {anilist_id}: {e}")
        raise


@cached("agg:staff", ttl=settings.CACHE_TTL_LONG)
async def get_staff(anilist_id: int) -> dict[str, Any]:
    """
    Get anime staff (directors, writers, etc).
    """
    try:
        data = await anilist_client.get_staff(anilist_id)
        staff_list = data.get("Media", {}).get("staff", {}).get("edges", [])
        
        return {
            "staff": [
                {
                    "staff_id": staff.get("node", {}).get("id"),
                    "role": staff.get("role"),
                    "staff_member": {
                        "name": staff.get("node", {}).get("name", {}),
                        "image": staff.get("node", {}).get("image", {}).get("large"),
                        "description": staff.get("node", {}).get("description"),
                    },
                }
                for staff in staff_list
            ]
        }
    except httpx.HTTPError as e:
        logger.error(f"Get staff failed for {anilist_id}: {e}")
        raise


# ============== RECOMMENDATIONS ==============

@cached("agg:recommendations", ttl=settings.CACHE_TTL_MEDIUM)
async def get_recommendations(anilist_id: int) -> dict[str, Any]:
    """
    Get anime recommendations.
    """
    try:
        data = await anilist_client.get_recommendations(anilist_id)
        recommendations = data.get("Media", {}).get("recommendations", {}).get("edges", [])
        
        return {
            "recommendations": [
                {
                    "rating": rec.get("rating"),
                    "recommended_anime": _normalize_anilist(rec.get("node", {}).get("mediaRecommendation", {})),
                }
                for rec in recommendations
            ]
        }
    except httpx.HTTPError as e:
        logger.error(f"Get recommendations failed for {anilist_id}: {e}")
        raise


# ============== STREAMING ==============

async def get_episode_sources(
    anime_identifier: str, episode_number: int
) -> dict[str, Any]:
    """
    Get all available streaming sources for an episode.
    
    Args:
        anime_identifier: Anime ID or slug
        episode_number: Episode number to fetch
        
    Returns:
        Dictionary with available sources and servers
    """
    try:
        sources = await wibu_client.get_episode_sources(anime_identifier, episode_number)
        return sources
    except Exception as e:
        logger.error(f"Failed to get episode sources: {e}")
        return {"sources": [], "error": str(e)}


async def get_streaming_link(
    anime_identifier: str,
    episode_number: int,
    source_id: str,
    server: str,
) -> dict[str, Any]:
    """
    Get direct streaming link for a specific configuration.
    
    Args:
        anime_identifier: Anime ID or slug
        episode_number: Episode number
        source_id: Source identifier
        server: Server identifier
        
    Returns:
        Dictionary with streaming URL and metadata
    """
    try:
        link_data = await wibu_client.get_streaming_link(
            anime_identifier, episode_number, source_id, server
        )
        return link_data
    except Exception as e:
        logger.error(f"Failed to get streaming link: {e}")
        return {"url": None, "error": str(e)}


# ============== GENRES ==============

@cached("agg:genres", ttl=settings.CACHE_TTL_LONG)
async def get_genres() -> dict[str, Any]:
    """
    Get all available anime genres from AniList.
    """
    try:
        data = await anilist_client.get_genres()
        return {"genres": data.get("GenreCollection", [])}
    except httpx.HTTPError as e:
        logger.error(f"Get genres failed: {e}")
        raise
