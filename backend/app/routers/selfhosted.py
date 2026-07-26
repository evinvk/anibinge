"""
Self-hosted streaming router — search Nyaa.si for torrents,
return magnet links for the frontend WebTorrent player.
"""
from fastapi import APIRouter, HTTPException, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
import logging

from app.services import nyaa_client

logger = logging.getLogger("anibinge.selfhosted")

router = APIRouter(prefix="/api/v1/selfhosted", tags=["selfhosted"])
limiter = Limiter(key_func=get_remote_address)


@router.get("/search")
@limiter.limit("30/minute")
async def search_selfhosted(
    request: Request,
    q: str = Query(..., min_length=2, description="Anime title to search on Nyaa"),
    episode: int | None = Query(None, ge=1, description="Episode number (optional)"),
    quality: str | None = Query("720p", description="Preferred quality: 720p, 1080p, x265, or null for any"),
    page: int = Query(1, ge=1, description="Page number"),
):
    """
    Search for anime torrents on Nyaa.si.

    Returns magnet links that can be loaded directly by the WebTorrent player
    in the browser. No download or storage needed — the browser streams
    directly from the BitTorrent swarm via WebRTC.
    """
    try:
        result = await nyaa_client.search_for_anime(
            title=q,
            episode=episode,
            quality=quality if quality != "any" else None,
            page=page,
        )
        return result
    except Exception as e:
        logger.error("Self-hosted search failed for '%s': %s", q, e, exc_info=True)
        raise HTTPException(status_code=503, detail="Nyaa search temporarily unavailable")


@router.get("/search/simple")
@limiter.limit("30/minute")
async def search_selfhosted_simple(
    request: Request,
    q: str = Query(..., min_length=2, description="Anime title to search on Nyaa"),
    page: int = Query(1, ge=1, description="Page number"),
    min_seeders: int = Query(1, ge=0, description="Minimum seeders"),
):
    """
    Simple Nyaa search — returns all results without episode/quality filtering.
    Useful for browsing available torrents manually.
    """
    try:
        result = await nyaa_client.search(
            query=q,
            page=page,
            min_seeders=min_seeders,
        )
        # Sanitize magnets for frontend
        for item in result.get("data", []):
            if item.get("magnet"):
                item["magnet_safe"] = item["magnet"]
        return result
    except Exception as e:
        logger.error("Nyaa simple search failed: %s", e)
        raise HTTPException(status_code=503, detail="Nyaa search unavailable")


@router.get("/resolve")
@limiter.limit("60/minute")
async def resolve_torrent(
    request: Request,
    magnet: str = Query(..., description="Magnet link to resolve"),
):
    """
    Validate and return torrent metadata for a magnet link.
    Helps the frontend verify the magnet is valid before starting WebTorrent.
    """
    if not magnet.startswith("magnet:?"):
        raise HTTPException(status_code=400, detail="Invalid magnet link")

    # Extract info hash from magnet
    import re
    match = re.search(r"xt=urn:btih:([a-fA-F0-9]+)", magnet)
    info_hash = match.group(1).lower() if match else None

    if not info_hash:
        raise HTTPException(status_code=400, detail="Could not parse info hash from magnet")

    return {
        "valid": True,
        "info_hash": info_hash,
        "magnet": magnet,
        "trackers": [
            "wss://tracker.webtorrent.dev",
            "wss://tracker.btorrent.xyz",
            "wss://tracker.openwebtorrent.com",
            "udp://tracker.opentrackr.org:1337",
            "udp://tracker.coppersurfer.tk:6969",
        ],
    }
