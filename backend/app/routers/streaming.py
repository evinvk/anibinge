from fastapi import APIRouter, HTTPException, Query
import httpx

from app.services import aggregator, wibu_client

router = APIRouter(prefix="/api/v1/streaming", tags=["streaming"])


@router.get("/{anime_id}/episodes")
async def get_episodes(
    anime_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
):
    """
    Get available episodes for an anime.
    
    Args:
        anime_id: Anime identifier (typically AniList ID or slug)
        page: Pagination page
        per_page: Episodes per page
    """
    try:
        data = await wibu_client.get_episodes(anime_id, page=page, per_page=per_page)
        return {
            "anime_id": anime_id,
            "episodes": data.get("episodes", []),
            "total": data.get("total", 0),
            "page": page,
            "per_page": per_page,
        }
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Failed to fetch episodes")
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{anime_id}/episode/{episode_number}/sources")
async def get_episode_sources(
    anime_id: str,
    episode_number: int,
):
    """
    Get all available streaming sources for a specific episode.
    
    Args:
        anime_id: Anime identifier
        episode_number: Episode number
    """
    try:
        data = await aggregator.get_episode_sources(anime_id, episode_number)
        return {
            "anime_id": anime_id,
            "episode_number": episode_number,
            "sources": data.get("sources", []),
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to fetch episode sources")


@router.get("/{anime_id}/episode/{episode_number}/sources/{source_id}/servers/{server}/link")
async def get_streaming_link(
    anime_id: str,
    episode_number: int,
    source_id: str,
    server: str,
):
    """
    Get direct streaming link for a specific episode/source/server configuration.
    
    Args:
        anime_id: Anime identifier
        episode_number: Episode number
        source_id: Source identifier (e.g., 'gogoanime', 'zoro')
        server: Server identifier (e.g., 'vidstream', 'mp4upload')
    """
    try:
        data = await aggregator.get_streaming_link(
            anime_id, episode_number, source_id, server
        )
        
        if not data.get("url"):
            raise HTTPException(
                status_code=404,
                detail="Streaming link not available",
            )
        
        return {
            "anime_id": anime_id,
            "episode_number": episode_number,
            "source_id": source_id,
            "server": server,
            "url": data.get("url"),
            "headers": data.get("headers"),
            "referer": data.get("referer"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to fetch streaming link")


@router.get("/{anime_id}/episode/{episode_number}/subtitles")
async def get_subtitles(
    anime_id: str,
    episode_number: int,
):
    """
    Get available subtitles for an episode.
    
    Args:
        anime_id: Anime identifier
        episode_number: Episode number
    """
    try:
        data = await wibu_client.get_subtitles(anime_id, episode_number)
        return {
            "anime_id": anime_id,
            "episode_number": episode_number,
            "subtitles": data.get("subtitles", []),
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to fetch subtitles")
