"""
Unified Streaming Provider Service.

Connects AniList/MAL anime IDs to live streaming servers (GogoAnime, HLS proxy, embed hosts).
Replaces the defunct Wibu API provider with a resilient, multi-server streaming architecture.
"""
import logging

from app.core.cache import cached
from app.core.config import get_settings
from app.services import anilist_client, gogoanime_client

logger = logging.getLogger("anibinge.streaming_provider")
settings = get_settings()


@cached("streaming:id_to_slug", ttl=86400)
async def resolve_anime_slug(anime_id: int) -> tuple[str | None, dict | None]:
    """
    Resolve an AniList/MAL anime_id to its corresponding GogoAnime slug and metadata.
    Uses AniList GraphQL to fetch titles (English, Romaji, Native), then fuzzy matches
    against the GogoAnime catalog.
    """
    try:
        # Step 1: Fetch metadata from AniList
        title_en = ""
        title_rom = ""
        episodes = 12

        try:
            anilist_data = await anilist_client.get_anime_detail(anime_id)
            if isinstance(anilist_data, dict):
                media = anilist_data.get("Media") or anilist_data.get("data", {}).get("Media")
                if media:
                    titles = media.get("title", {})
                    title_en = titles.get("english") or ""
                    title_rom = titles.get("romaji") or ""
                    episodes = media.get("episodes") or 12
        except Exception as e:
            logger.warning("AniList resolution failed for %d: %s", anime_id, e)

        if not (title_en or title_rom):
            try:
                from app.services import jikan_client
                jikan_meta = await jikan_client.get_anime_full(anime_id)
                data = jikan_meta.get("data", {}) if isinstance(jikan_meta, dict) else {}
                title_en = data.get("title_english") or data.get("title") or ""
                title_rom = data.get("title") or ""
                episodes = data.get("episodes") or 12
            except Exception as e:
                logger.warning("Jikan resolution failed for %d: %s", anime_id, e)

        if not (title_en or title_rom):
            return None, None

        # Step 2: Query GogoAnime with titles
        gogo_matches = []
        for search_title in [title_en, title_rom]:
            if not search_title:
                continue
            results = await gogoanime_client.search_anime(search_title)
            if results:
                gogo_matches.extend(results)
                break

        if not gogo_matches:
            logger.warning("No GogoAnime slug found for anime_id %d (titles: %s / %s)", anime_id, title_en, title_rom)
            return None, {"title": title_en or title_rom, "episodes": episodes}

        # Pick top match
        best_match = gogo_matches[0]
        slug = best_match.get("slug")
        meta = {
            "title": title_en or title_rom,
            "episodes": episodes or best_match.get("episodes_count") or 12,
            "poster": best_match.get("poster"),
            "slug": slug,
        }
        return slug, meta

    except Exception as e:
        logger.error("Failed to resolve slug for anime_id %d: %s", anime_id, e)
        return None, None


@cached("streaming:episodes_list", ttl=3600)
async def get_anime_episodes(anime_id: int, page: int = 1, limit: int = 20) -> dict:
    """
    Get paginated episode list for an anime_id with streaming capabilities.
    """
    slug, meta = await resolve_anime_slug(anime_id)
    total_episodes = meta.get("episodes") if meta else 12

    # Calculate pagination bounds
    start_ep = (page - 1) * limit + 1
    end_ep = min(start_ep + limit - 1, total_episodes)

    episodes = []
    for ep_num in range(start_ep, end_ep + 1):
        episodes.append({
            "episode_number": ep_num,
            "title": f"Episode {ep_num}",
            "slug": slug,
            "audio": ["sub", "dub"],
            "has_stream": slug is not None,
            "stream_url": f"/api/v1/streaming/gogoanime/{slug}/master?ep={ep_num}" if slug else None,
        })

    return {
        "anime_id": anime_id,
        "title": meta.get("title") if meta else None,
        "slug": slug,
        "page": page,
        "total_episodes": total_episodes,
        "has_next": end_ep < total_episodes,
        "episodes": episodes,
        "data": episodes,
    }


@cached("streaming:episode_sources", ttl=1800)
async def get_episode_sources(
    anime_id: int, episode_number: int, server: str | None = None
) -> dict:
    """
    Get streaming sources for a specific episode of an anime.
    """
    slug, meta = await resolve_anime_slug(anime_id)
    if not slug:
        return {
            "error": "No streaming source mapped for this anime",
            "anime_id": anime_id,
            "episode": episode_number,
            "sources": [],
        }

    # Fetch stream sources from GogoAnime client
    sources_data = await gogoanime_client.get_stream_sources(slug, episode_number, audio="sub")
    if not sources_data:
        # Try dub if sub yields no sources
        sources_data = await gogoanime_client.get_stream_sources(slug + "-dub", episode_number, audio="dub")

    if not sources_data:
        return {
            "error": "Episode stream currently unavailable",
            "anime_id": anime_id,
            "episode": episode_number,
            "slug": slug,
            "sources": [],
        }

    formatted_sources = []

    # Priority 1: Master M3U8 Direct Stream Proxy
    master = sources_data.get("master_m3u8")
    if master:
        formatted_sources.append({
            "server": "GogoAnime (HLS Direct)",
            "type": "hls",
            "url": f"/api/v1/streaming/gogoanime/{slug}/master?ep={episode_number}",
            "quality": "auto",
            "is_m3u8": True,
        })

    # Priority 2: Direct stream proxy
    direct = sources_data.get("direct_stream")
    if direct and direct.get("stream_url"):
        formatted_sources.append({
            "server": "GogoCDN",
            "type": "hls",
            "url": direct.get("stream_url"),
            "quality": direct.get("quality", "default"),
            "is_m3u8": True,
        })

    # Priority 3: Qualities list
    for q in sources_data.get("qualities", []):
        if q.get("url"):
            formatted_sources.append({
                "server": f"GogoAnime ({q.get('quality', '720p')})",
                "type": "hls",
                "url": q.get("url"),
                "quality": q.get("quality", "720p"),
                "is_m3u8": True,
            })

    # Priority 4: Embed URL fallback
    embed_url = sources_data.get("embed_url")
    if embed_url:
        formatted_sources.append({
            "server": "GogoAnime Embed",
            "type": "embed",
            "url": embed_url,
            "quality": "default",
            "is_m3u8": False,
        })

    return {
        "anime_id": anime_id,
        "episode": episode_number,
        "slug": slug,
        "title": meta.get("title") if meta else f"Episode {episode_number}",
        "sources": formatted_sources,
        "subtitles": [],
    }


async def get_episode_detail(anime_id: int, episode_number: int) -> dict:
    """
    Get detailed information and sources for a specific episode.
    """
    sources_info = await get_episode_sources(anime_id, episode_number)
    if "error" in sources_info and not sources_info.get("sources"):
        return {"error": sources_info.get("error", "Episode not found")}

    servers = [s.get("server") for s in sources_info.get("sources", [])]
    return {
        "anime_id": anime_id,
        "episode_number": episode_number,
        "title": sources_info.get("title", f"Episode {episode_number}"),
        "available_servers": servers or ["GogoAnime"],
        "sources": sources_info.get("sources", []),
        "subtitles": [],
    }


async def get_available_servers() -> dict:
    """
    Return list of active streaming servers.
    """
    return {
        "servers": [
            {
                "id": "gogoanime_hls",
                "name": "GogoAnime HLS (Recommended)",
                "quality": "Multi-Quality (1080p/720p/480p/360p)",
                "status": "online",
            },
            {
                "id": "gogocdn",
                "name": "GogoCDN Fast Proxy",
                "quality": "720p/1080p",
                "status": "online",
            },
            {
                "id": "embed_player",
                "name": "GogoAnime Embed Player",
                "quality": "Auto",
                "status": "online",
            },
        ]
    }


async def get_stream_url(anime_id: int, episode_number: int, server: str = "gogoanime_hls") -> dict:
    """
    Get direct stream play URL for embedding in video player.
    """
    slug, meta = await resolve_anime_slug(anime_id)
    if not slug:
        return {"error": "Stream not available for this anime ID"}

    master_proxy_url = f"/api/v1/streaming/gogoanime/{slug}/master?ep={episode_number}"
    return {
        "anime_id": anime_id,
        "episode_number": episode_number,
        "slug": slug,
        "server": server,
        "stream_url": master_proxy_url,
        "type": "hls",
    }
