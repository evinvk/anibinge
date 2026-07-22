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
from app.services import anivexa_client

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


@router.get("/gogoanime/health")
@limiter.limit("10/minute")
async def gogoanime_health(request: Request):
    """Check if GogoAnime streaming CDN is healthy.
    Tests whether the video segment CDN returns actual video data
    (vs placeholder PNGs indicating an outage)."""
    try:
        episode = await gogoanime_client.get_episode("one-piece-odmau", 1)
        if not episode:
            return {"healthy": False, "reason": "episode_api_down"}

        proxy_url = episode.get("defaultStreamingUrl", "")
        if not proxy_url:
            return {"healthy": False, "reason": "no_streaming_url"}

        result = await gogoanime_client.resolve_m3u8(proxy_url)
        if not result:
            return {"healthy": False, "reason": "m3u8_resolve_failed"}

        m3u8_text, resolved_url = result

        # Parse variant M3U8 to find a segment URL
        lines = m3u8_text.strip().split("\n")
        variant_url = None
        for i, line in enumerate(lines):
            if line.startswith("#EXT-X-STREAM-INF") and i + 1 < len(lines):
                variant_rel = lines[i + 1].strip()
                if variant_rel and not variant_rel.startswith("#"):
                    variant_url = variant_rel
                    break

        if not variant_url:
            return {"healthy": False, "reason": "no_variants"}

        # Resolve variant URL
        from urllib.parse import urlparse
        parsed = urlparse(resolved_url)
        if not variant_url.startswith("http"):
            base = resolved_url.rsplit("/", 1)[0] + "/"
            variant_url = base + variant_url

        # Fetch variant M3U8
        async with _httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
            resp = await client.get(variant_url)
            resp.raise_for_status()
            vlines = resp.text.strip().split("\n")
            segs = [l.strip() for l in vlines if l.strip() and not l.startswith("#")]

            if not segs:
                return {"healthy": False, "reason": "no_segments"}

            # Try fetching the first segment and check content type
            first_seg = segs[0]
            resp2 = await client.get(first_seg, follow_redirects=True)
            ct = resp2.headers.get("content-type", "")

            if "image/png" in ct or "image/jpeg" in ct:
                return {"healthy": False, "reason": "cdn_returns_images"}

            return {"healthy": True}

    except Exception as e:
        return {"healthy": False, "reason": "check_failed", "error": str(e)[:200]}


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


@router.get("/gogoanime/{slug}/master")
@limiter.limit("30/minute")
async def gogoanime_master_m3u8(
    request: Request,
    slug: str,
    ep: int = Query(..., ge=1, description="Episode number"),
):
    """Serve the rewritten master M3U8 directly so hls.js can resolve variant URLs correctly.
    Blob URLs break relative URL resolution; serving from our domain fixes this."""
    from urllib.parse import urlparse
    try:
        episode = await gogoanime_client.get_episode(slug, ep)
        if not episode:
            raise HTTPException(status_code=404, detail="Episode not found on GogoAnime")

        proxy_url = episode.get("defaultStreamingUrl", "")
        if not proxy_url:
            raise HTTPException(status_code=404, detail="No streaming URL available")

        m3u8_text, resolved_url = await gogoanime_client.resolve_m3u8(proxy_url)
        if not m3u8_text:
            raise HTTPException(status_code=503, detail="Failed to resolve M3U8 from GogoAnime")

        parsed = urlparse(resolved_url)
        base_url = f"{parsed.scheme}://{parsed.netloc}"
        rewritten = gogoanime_client._rewrite_m3u8_urls(m3u8_text, base_url)

        return Response(
            content=rewritten,
            media_type="application/vnd.apple.mpegurl",
            headers={**_CORS_HEADERS, "Cache-Control": "public, max-age=10"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail="GogoAnime master M3U8 unavailable")


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


# ── Anivexa fallback endpoints ──────────────────────────────────────


@router.get("/anivexa/search")
@limiter.limit("30/minute")
async def search_anivexa(
    request: Request,
    q: str = Query(..., min_length=2, description="Search query"),
):
    """Search for anime on Anivexa (Reanime provider)."""
    try:
        results = await anivexa_client.search_anime(q)
        return {"data": results}
    except Exception as e:
        raise HTTPException(status_code=503, detail="Anivexa search unavailable")


@router.get("/anivexa/{anilist_id}/episodes")
@limiter.limit("30/minute")
async def anivexa_episodes(
    request: Request,
    anilist_id: int,
):
    """Get episode list from Anivexa by AniList ID."""
    try:
        data = await anivexa_client.get_episodes(anilist_id)
        if not data or data.get("error"):
            raise HTTPException(status_code=404, detail="Anime not found on Anivexa")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail="Anivexa episodes unavailable")


@router.get("/anivexa/{anilist_id}/stream")
@limiter.limit("30/minute")
async def anivexa_stream(
    request: Request,
    anilist_id: int,
    ep: int = Query(..., ge=1, description="Episode number"),
    audio: str = Query("sub", description="Audio type: sub or dub"),
):
    """Get streaming URL from Anivexa for a specific episode."""
    try:
        data = await anivexa_client.get_stream_data(anilist_id, ep, audio)
        if not data or data.get("error"):
            raise HTTPException(status_code=404, detail="Stream not available on Anivexa")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail="Anivexa stream unavailable")


@router.get("/anivexa/{anilist_id}/master")
@limiter.limit("30/minute")
async def anivexa_master_m3u8(
    request: Request,
    anilist_id: int,
    ep: int = Query(..., ge=1, description="Episode number"),
    audio: str = Query("sub", description="Audio type: sub or dub"),
):
    """Proxy the Anivexa M3U8 stream through our domain for CORS and URL rewriting."""
    try:
        stream_data = await anivexa_client.get_stream_data(anilist_id, ep, audio)
        if not stream_data or stream_data.get("error"):
            raise HTTPException(status_code=404, detail="Stream not available")

        m3u8_url = stream_data.get("stream_url", "")
        if not m3u8_url:
            raise HTTPException(status_code=404, detail="No M3U8 URL in response")

        # Fetch the M3U8 content and rewrite URLs to proxy through us
        async with _httpx.AsyncClient(timeout=_PROXY_TIMEOUT, headers=_PROXY_HEADERS, follow_redirects=True) as client:
            resp = await client.get(m3u8_url)
            resp.raise_for_status()
            m3u8_text = resp.text

        # If it's a master playlist, rewrite variant URLs to go through our proxy
        if "#EXT-X-STREAM-INF" in m3u8_text:
            from urllib.parse import urlparse
            parsed = urlparse(m3u8_url)
            base_url = f"{parsed.scheme}://{parsed.netloc}"
            m3u8_text = _rewrite_anivexa_m3u8(m3u8_text, m3u8_url, base_url)

        return Response(
            content=m3u8_text,
            media_type="application/vnd.apple.mpegurl",
            headers={**_CORS_HEADERS, "Cache-Control": "public, max-age=10"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail="Anivexa master M3U8 unavailable")


@router.get("/anivexa/proxy")
@limiter.limit("120/minute")
async def anivexa_proxy(
    request: Request,
    url: str = Query(..., description="Base64-encoded URL to proxy"),
):
    """CORS proxy for Anivexa M3U8 and .ts segment requests."""
    try:
        decoded_url = _b64.urlsafe_b64decode(url.encode()).decode()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid proxy URL encoding")

    try:
        async with _httpx.AsyncClient(
            timeout=_PROXY_TIMEOUT, headers=_PROXY_HEADERS, follow_redirects=True
        ) as client:
            resp = await client.get(decoded_url)
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "")
            body = resp.text

            # Rewrite M3U8 content to go through this proxy
            if "mpegurl" in content_type or body.strip().startswith("#EXTM3U"):
                from urllib.parse import urlparse
                parsed = urlparse(decoded_url)
                base_url = f"{parsed.scheme}://{parsed.netloc}"
                body = _rewrite_anivexa_m3u8(body, decoded_url, base_url)
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


def _rewrite_anivexa_m3u8(m3u8_text: str, current_url: str, base_url: str) -> str:
    """Rewrite relative URLs in M3U8 to go through the anivexa proxy endpoint."""
    from urllib.parse import urljoin, urlparse
    import re

    proxy_base = "/api/v1/streaming/anivexa/proxy"
    lines = m3u8_text.split("\n")
    result = []

    for line in lines:
        stripped = line.strip()
        # Skip empty lines and tags
        if not stripped or stripped.startswith("#"):
            result.append(line)
            continue

        # Resolve relative URLs
        if not stripped.startswith("http"):
            resolved = urljoin(current_url, stripped)
        else:
            resolved = stripped

        # Encode and rewrite to proxy
        encoded = _b64.urlsafe_b64encode(resolved.encode()).decode()
        result.append(f"{proxy_base}?url={encoded}")

    return "\n".join(result)


# ── Fallback-aware endpoints ────────────────────────────────────────


@router.get("/fallback/search")
@limiter.limit("30/minute")
async def fallback_search(
    request: Request,
    q: str = Query(..., min_length=2, description="Search query"),
):
    """Search GogoAnime first, fall back to Anivexa if no results."""
    # Try GogoAnime
    try:
        results = await gogoanime_client.search_anime(q)
        if results:
            return {"data": results, "source": "gogoanime"}
    except Exception:
        pass

    # Fallback to Anivexa
    try:
        results = await anivexa_client.search_anime(q)
        if results:
            return {"data": results, "source": "anivexa"}
    except Exception:
        pass

    return {"data": [], "source": "none"}


@router.get("/fallback/stream")
@limiter.limit("30/minute")
async def fallback_stream(
    request: Request,
    q: str = Query(..., min_length=2, description="Anime title to search"),
    ep: int = Query(1, ge=1, description="Episode number"),
    audio: str = Query("sub", description="Audio type: sub or dub"),
):
    """
    Try to get a streaming URL for an episode.
    First tries GogoAnime (by title search), then falls back to Anivexa (by AniList ID).
    Returns the M3U8 URL and which source it came from.
    """
    # Try GogoAnime first
    try:
        results = await gogoanime_client.search_anime(q)
        if results:
            slug = results[0]["slug"]
            episode_data = await gogoanime_client.get_episode(slug, ep)
            if episode_data:
                proxy_url = episode_data.get("defaultStreamingUrl", "")
                if proxy_url:
                    result = await gogoanime_client.resolve_m3u8(proxy_url)
                    if result:
                        m3u8_text, resolved_url = result
                        from urllib.parse import urlparse
                        parsed = urlparse(resolved_url)
                        base_url = f"{parsed.scheme}://{parsed.netloc}"
                        rewritten = gogoanime_client._rewrite_m3u8_urls(m3u8_text, base_url)
                        master_path = f"/api/v1/streaming/gogoanime/{slug}/master?ep={ep}"
                        return {
                            "source": "gogoanime",
                            "master_url": master_path,
                            "qualities": episode_data.get("qualities", []),
                            "slug": slug,
                            "episodes_count": results[0].get("episodes_count"),
                        }
    except Exception:
        pass

    # Fallback to Anivexa — search by title, get AniList ID, then stream
    try:
        search_results = await anivexa_client.search_anime(q)
        if search_results:
            # Anivexa search returns results with anilist_id
            anilist_id = search_results[0].get("anilist_id") or search_results[0].get("id")
            if anilist_id:
                stream_data = await anivexa_client.get_stream_data(int(anilist_id), ep, audio)
                if stream_data and stream_data.get("stream_url"):
                    master_path = f"/api/v1/streaming/anivexa/{anilist_id}/master?ep={ep}&audio={audio}"
                    return {
                        "source": "anivexa",
                        "master_url": master_path,
                        "stream_url": stream_data["stream_url"],
                        "subtitles": stream_data.get("subtitles", []),
                        "anilist_id": anilist_id,
                        "title": search_results[0].get("title", q),
                    }
    except Exception:
        pass

    raise HTTPException(status_code=404, detail="No streaming sources available from any provider")
