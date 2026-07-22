"""
Streaming router — integrates Wibu API for episode streaming and video sources.
Also provides GogoAnime endpoints for search, episodes, and HLS streaming.
"""
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
from slowapi import Limiter
from slowapi.util import get_remote_address
import base64 as _b64
import httpx as _httpx

from app.core.config import get_settings
from app.services import wibu_client
from app.services import gogoanime_client

router = APIRouter(prefix="/api/v1/streaming", tags=["streaming"])
limiter = Limiter(key_func=get_remote_address)
settings = get_settings()


@router.get("/anime/{anime_id}/episodes")
@limiter.limit("60/minute")
async def get_episodes(
    request: Request,
    anime_id: int,
    page: int = Query(1, ge=1, description="Page number"),
):
    """
    Get episode list for an anime with basic streaming info.
    
    Returns paginated episodes with episode number, title, air date, and available sources.
    """
    try:
        data = await wibu_client.get_anime_episodes(anime_id, page=page)
        if "error" in data:
            raise HTTPException(status_code=404, detail="Anime not found on Wibu")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail="Streaming data temporarily unavailable")


@router.get("/anime/{anime_id}/episode/{episode_number}")
@limiter.limit("60/minute")
async def get_episode_detail(
    request: Request,
    anime_id: int,
    episode_number: int,
):
    """
    Get detailed information about a specific episode.
    
    Returns episode metadata, all available streaming servers, subtitles, and quality options.
    """
    try:
        data = await wibu_client.get_episode_detail(anime_id, episode_number)
        if "error" in data:
            raise HTTPException(status_code=404, detail="Episode not found")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail="Episode data unavailable")


@router.get("/anime/{anime_id}/episode/{episode_number}/sources")
@limiter.limit("60/minute")
async def get_episode_sources(
    request: Request,
    anime_id: int,
    episode_number: int,
    server: str | None = Query(None, description="Optional: specific server (vidstream, streamtape, etc)"),
):
    """
    Get streaming sources for an episode.
    
    Returns list of available servers with direct streaming links and quality options.
    Servers may include: vidstream, streamtape, doodstream, mp4upload, etc.
    """
    try:
        data = await wibu_client.get_episode_sources(anime_id, episode_number, server=server)
        if "error" in data and not data.get("sources"):
            raise HTTPException(status_code=404, detail="No streaming sources found")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail="Sources temporarily unavailable")


@router.get("/anime/{anime_id}/episode/{episode_number}/subtitles")
@limiter.limit("60/minute")
async def get_episode_subtitles(
    request: Request,
    anime_id: int,
    episode_number: int,
):
    """
    Get available subtitle tracks for an episode.
    
    Returns subtitle options in various languages with download/embed URLs.
    """
    try:
        data = await wibu_client.get_episode_subtitles(anime_id, episode_number)
        return data
    except Exception as e:
        # Subtitles are optional, return empty list if not available
        return {"subtitles": [], "languages": []}


@router.get("/servers")
@limiter.limit("30/minute")
async def list_streaming_servers(request: Request):
    """
    Get list of all available streaming servers on Wibu.
    
    Returns metadata about each server: name, reliability, quality, region, etc.
    Useful for frontend to let users choose preferred server.
    """
    try:
        data = await wibu_client.get_available_servers()
        return data
    except Exception as e:
        raise HTTPException(status_code=503, detail="Server list unavailable")


@router.get("/recent")
@limiter.limit("30/minute")
async def get_recent_episodes(
    request: Request,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=50, description="Results per page"),
):
    """
    Get recently uploaded episodes across all anime on Wibu.
    
    Useful for "Latest Episodes" section showing recently aired/uploaded content.
    """
    try:
        data = await wibu_client.get_recent_episodes(page=page, limit=limit)
        return data
    except Exception as e:
        raise HTTPException(status_code=503, detail="Recent episodes unavailable")


@router.get("/trending")
@limiter.limit("30/minute")
async def get_trending_on_wibu(
    request: Request,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=50, description="Results per page"),
):
    """
    Get trending anime on Wibu based on streaming views and popularity.
    
    Alternative ranking source for "What's Popular" or trending sections.
    """
    try:
        data = await wibu_client.get_trending_anime(page=page, limit=limit)
        return data
    except Exception as e:
        raise HTTPException(status_code=503, detail="Trending data unavailable")


@router.get("/search")
@limiter.limit("60/minute")
async def search_wibu(
    request: Request,
    q: str = Query(..., description="Search query"),
    page: int = Query(1, ge=1, description="Page number"),
):
    """
    Search for anime on Wibu by title.
    
    Useful for verifying if anime is available for streaming.
    """
    try:
        data = await wibu_client.search_anime(q, page=page)
        return data
    except Exception as e:
        raise HTTPException(status_code=503, detail="Search unavailable")


@router.get("/play/{anime_id}/{episode_number}")
@limiter.limit("120/minute")
async def get_play_url(
    request: Request,
    anime_id: int,
    episode_number: int,
    server: str = Query("vidstream", description="Streaming server to use"),
):
    """
    Get a direct play URL for an episode (for embedding in player).
    
    Returns the streaming link and metadata for the selected server.
    Server options: vidstream, streamtape, doodstream, mp4upload, etc.
    """
    try:
        data = await wibu_client.get_stream_url(anime_id, episode_number, server=server)
        if "error" in data:
            raise HTTPException(status_code=404, detail=data.get("error", "Stream not available"))
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail="Stream URL unavailable")


# ── GogoAnime endpoints ─────────────────────────────────────────────


@router.get("/gogoanime/latest")
@limiter.limit("30/minute")
async def gogoanime_latest_releases(request: Request):
    """Return ongoing anime from GogoAnime catalog, sorted by latest episode."""
    try:
        catalog = await gogoanime_client.get_catalog()
        if not catalog:
            return {"data": []}
        ongoing = [a for a in catalog if a.get("status") == "Ongoing"]
        ongoing.sort(key=lambda x: x.get("latest_episode", 0) or 0, reverse=True)
        return {"data": ongoing[:30]}
    except Exception as e:
        raise HTTPException(status_code=503, detail="GogoAnime latest unavailable")


@router.get("/gogoanime/search")
@limiter.limit("30/minute")
async def search_gogoanime(
    request: Request,
    q: str = Query(..., min_length=2, description="Search query"),
):
    """Search for anime on GogoAnime."""
    try:
        results = await gogoanime_client.search_anime(q)
        return {"data": results}
    except Exception as e:
        raise HTTPException(status_code=503, detail="GogoAnime search unavailable")


@router.get("/gogoanime/{slug}/episodes")
@limiter.limit("30/minute")
async def get_gogoanime_episode(
    request: Request,
    slug: str,
    ep: int = Query(..., ge=1, description="Episode number"),
):
    """Get episode streaming data for a specific episode on GogoAnime."""
    try:
        data = await gogoanime_client.get_episode(slug, ep)
        if not data:
            raise HTTPException(status_code=404, detail="Episode not found on GogoAnime")
        return {"data": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail="GogoAnime episode unavailable")


@router.get("/gogoanime/{slug}/stream")
@limiter.limit("30/minute")
async def get_gogoanime_stream(
    request: Request,
    slug: str,
    ep: int = Query(..., ge=1, description="Episode number"),
):
    """Get M3U8 streaming URLs for an episode on GogoAnime."""
    try:
        sources = await gogoanime_client.get_stream_sources(slug, ep)
        if not sources:
            raise HTTPException(status_code=404, detail="No streaming sources found")
        return {"data": sources}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail="GogoAnime stream unavailable")


_PROXY_TIMEOUT = _httpx.Timeout(15.0, connect=10.0)
_PROXY_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
}
_CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
}


@router.get("/gogoanime/proxy")
@limiter.limit("120/minute")
async def gogoanime_proxy(
    request: Request,
    url: str = Query(..., description="Base64-encoded URL to proxy"),
):
    """CORS proxy for GogoAnime M3U8 and .ts segment requests.
    URL parameter is base64-encoded to avoid query string conflicts.
    Rewrites M3U8 content so variant/segment URLs also go through this proxy."""
    if request.method == "OPTIONS":
        return Response(status_code=204, headers=_CORS_HEADERS)

    try:
        decoded_url = _b64.urlsafe_b64decode(url.encode()).decode()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid proxy URL encoding")

    try:
        async with _httpx.AsyncClient(
            timeout=_PROXY_TIMEOUT, headers=_PROXY_HEADERS, follow_redirects=True
        ) as client:
            resp = await client.get(decoded_url, headers={"Referer": "https://gogoanimehd.to/"})
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "")
            body = resp.text

            # If it's M3U8 content, rewrite URLs to go through this proxy
            if "mpegurl" in content_type or body.strip().startswith("#EXTM3U"):
                from urllib.parse import urlparse
                parsed = urlparse(decoded_url)
                base_url = f"{parsed.scheme}://{parsed.netloc}"
                body = gogoanime_client._rewrite_m3u8_urls(body, base_url)
                return Response(
                    content=body,
                    media_type="application/vnd.apple.mpegurl",
                    headers={**_CORS_HEADERS, "Cache-Control": "public, max-age=10"},
                )

            # Binary content (.ts segments, etc.)
            return Response(
                content=resp.content,
                media_type=content_type or "video/mp2t",
                headers={
                    **_CORS_HEADERS,
                    "Cache-Control": "public, max-age=86400",
                    "Content-Length": str(len(resp.content)),
                },
            )
    except _httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Upstream error")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail="Proxy request failed")
