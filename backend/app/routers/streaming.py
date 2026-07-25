"""
Streaming router — integrates Wibu API for episode streaming and video sources.
Also provides GogoAnime endpoints for search, episodes, and HLS streaming.
"""
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
import base64 as _b64
import httpx as _httpx
import re as _re
import asyncio as _asyncio
import logging

from app.core.config import get_settings
from app.core.http import get_shared_client
from app.services import wibu_client
from app.services import gogoanime_client
from app.services import anivexa_client

logger = logging.getLogger("anibinge.streaming")

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
    Get recently uploaded episodes across all anime.

    GogoAnime-catalog-first: preserves the catalog's natural order (already sorted
    by last update time — most recently updated anime appear first). Each card
    shows the latest_episode number and links directly to /watch/{slug}?ep={N}.
    """
    try:
        from app.services import gogoanime_client, anilist_client

        gogo_catalog = gogoanime_client.get_catalog()

        ongoing = [
            (idx, item) for idx, item in enumerate(gogo_catalog)
            if (item.get("latest_episode") or 0) > 0
        ]

        start = (page - 1) * limit
        end = start + limit + 1
        page_items = ongoing[start:end]

        titles = set()
        for _, item in page_items:
            for t in [item.get("title", ""), item.get("title_english", ""), item.get("title_japanese", "")]:
                if t:
                    titles.add(t)

        anilist_map: dict[str, dict] = {}
        try:
            schedule = await anilist_client.get_schedule(page=1, per_page=50)
            for m in schedule.get("Page", {}).get("media", []):
                title_obj = m.get("title", {})
                for key in ["english", "romaji", "native"]:
                    t = title_obj.get(key, "")
                    if t:
                        anilist_map[gogoanime_client._normalize(t)] = m
        except Exception:
            pass

        episodes = []
        for catalog_idx, item in page_items:
            latest = item.get("latest_episode") or 0
            if latest < 1:
                continue

            title = item.get("title_english") or item.get("title") or ""
            title_jp = item.get("title_japanese") or item.get("title") or ""
            slug = item.get("slug")
            poster = item.get("poster") or item.get("image")

            genres: list[str] = []
            anilist_id = None

            for try_title in [title, title_jp]:
                norm = gogoanime_client._normalize(try_title)
                if norm and norm in anilist_map:
                    m = anilist_map[norm]
                    anilist_id = m.get("id")
                    genres = m.get("genres", [])
                    break

            if not genres:
                genres = item.get("genres", []) if isinstance(item.get("genres"), list) else []

            episodes.append({
                "title": title,
                "episode": latest,
                "poster": poster,
                "slug": slug,
                "aired_ago": catalog_idx,
                "genres": genres,
                "anilist_id": anilist_id,
            })

        has_next = len(page_items) > limit
        return {
            "data": episodes[:limit],
            "page": page,
            "has_next": has_next,
        }
    except Exception as e:
        logger.warning("Recent episodes failed: %s", e)
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


def _dub_slug(slug: str, audio: str) -> str:
    """Convert slug based on audio type. GogoAnime uses '-dub' suffix for dubbed versions."""
    if audio == "dub":
        if not slug.endswith("-dub"):
            return f"{slug}-dub"
    else:
        if slug.endswith("-dub"):
            return slug[:-4]
    return slug


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
        client = get_shared_client(timeout=_PROXY_TIMEOUT, headers=_PROXY_HEADERS)
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
async def gogoanime_latest_releases(request: Request, day: str | None = Query(None, description="Filter by day of week (monday-sunday). Omit for all ongoing.")):
    """Return ongoing anime from GogoAnime catalog. If day is provided, only return anime airing on that day."""
    try:
        catalog = gogoanime_client.get_catalog()
        if not catalog:
            return {"data": []}
        ongoing = [a for a in catalog if a.get("status") == "Ongoing"]

        if day:
            day_lower = day.lower().strip()
            # Cross-reference with today's schedule to find which titles air today
            from app.services import aggregator
            try:
                schedule_result = await aggregator.get_schedule(day=day_lower)
                schedule_titles = {
                    (item.get("title") or "").lower().strip()
                    for item in schedule_result.get("data", [])
                }
                schedule_titles_jp = {
                    (item.get("title_japanese") or "").lower().strip()
                    for item in schedule_result.get("data", [])
                }
                # Filter ongoing to only those airing today
                today_items = []
                for a in ongoing:
                    t = (a.get("title") or "").lower().strip()
                    t_en = (a.get("title_english") or "").lower().strip()
                    t_jp = (a.get("title_japanese") or "").lower().strip()
                    if t in schedule_titles or t_en in schedule_titles or t_jp in schedule_titles_jp or t in schedule_titles_jp:
                        today_items.append(a)
                if today_items:
                    today_items.sort(key=lambda x: x.get("latest_episode", 0) or 0, reverse=True)
                    return {"data": today_items[:30], "day": day_lower}
            except Exception as e:
                logger.warning("Schedule cross-reference failed for day=%s: %s", day_lower, e)

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
    audio: str = Query("sub", description="Audio type: sub or dub"),
):
    """Get episode streaming data for a specific episode on GogoAnime."""
    try:
        data = await gogoanime_client.get_episode(slug, ep)
        if not data:
            raise HTTPException(status_code=404, detail="Episode not found on GogoAnime")
        return {"data": data, "slug": slug, "audio": audio}
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
    audio: str = Query("sub", description="Audio type: sub or dub"),
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
    audio: str = Query("sub", description="Audio type: sub or dub"),
):
    """Get M3U8 streaming URLs for an episode on GogoAnime."""
    try:
        sources = await gogoanime_client.get_stream_sources(slug, ep, audio)
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

_PROXY_ALLOWED_HOSTS = {
    "gogocdn.net", "gogostream.com", "gogohd.net",
    "vidstreaming.io", "gogoservers.mema",
    "anivexa-api-eight.vercel.app",
    "megap.kotocdn.site", "fxpy7.watching.onl", "lostproject.club",
    "hls.anidb.app", "anidb.app", "1oe.lostproject.club",
    "ani.pm", "cdn.ani.pm", "kwik.cx", "animepahe.ru",
    "animetsu-scraper-nine.vercel.app",
    "megaplay.buzz",
    "vidtube.site",
    "vidwish.live",
    # Additional provider CDN hosts
    "animeyubi.com", "cdn.animeyubi.com", "anigamers.app", "hls.anigamers.app",
    "omegatroupe.com", "cdn.omegatroupe.com",
    # Wibu/streaming CDN hosts
    "vidcache.net", "sbplay.com", "sbplay2.com", "sbvideo.net",
    "streamtape.com", "doodstream.com", "mp4upload.com", "streamsb.com",
    "streamwish.to", "dood.pm", "dood.wf", "dood.watch",
    "embtaku.pro", "kwik.cx", "pahe.win",
}


def _is_proxy_url_allowed(url: str) -> bool:
    from urllib.parse import urlparse
    try:
        host = urlparse(url).hostname or ""
    except Exception:
        return False
    return any(host == h or host.endswith("." + h) for h in _PROXY_ALLOWED_HOSTS)


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

    if not _is_proxy_url_allowed(decoded_url):
        from urllib.parse import urlparse
        blocked_host = urlparse(decoded_url).hostname
        logger.warning("GogoAnime proxy blocked host: %s (URL: %.200s)", blocked_host, decoded_url)
        raise HTTPException(status_code=400, detail="URL not in allowed proxy list")

    try:
        client = get_shared_client(timeout=_PROXY_TIMEOUT, headers=_PROXY_HEADERS, follow_redirects=True)
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

            if "#EXTINF" not in body:
                raise HTTPException(status_code=404, detail="M3U8 has no real video segments after ad filtering")

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


@router.get("/anivexa/resolve")
@limiter.limit("30/minute")
async def resolve_anilist_id(
    request: Request,
    q: str = Query(..., min_length=2, description="Anime title to search"),
):
    """Search AniList by title and return the AniList ID for Anivexa streaming."""
    try:
        from app.services import anilist_client
        result = await anilist_client.search_anime(q, per_page=5)
        media = result.get("Page", {}).get("media", [])
        if media:
            return {"anilist_id": media[0]["id"], "title": media[0].get("title", {})}
        return {"anilist_id": None, "title": None}
    except Exception as e:
        logger.warning("AniList resolve failed for '%s': %s", q, e)
        return {"anilist_id": None, "title": None}


@router.get("/anivexa/search")
@limiter.limit("30/minute")
async def search_anivexa(
    request: Request,
    q: str = Query(..., min_length=2, description="Search query"),
):
    """Anivexa search not available — returns empty (Anivexa uses AniList IDs only)."""
    return {"data": []}


@router.get("/anivexa/{anilist_id}/episodes")
@limiter.limit("30/minute")
async def anivexa_episodes(
    request: Request,
    anilist_id: int,
    provider: str = Query("anikoto", description="Provider: anikoto, animegg, anizone"),
):
    """Get episode list from Anivexa by AniList ID."""
    try:
        data = await anivexa_client.get_episodes(anilist_id, provider)
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
    provider: str | None = Query(None, description="Optional: force specific provider"),
    source: str | None = Query(None, description="Force source: 'anitsu' (Animetsu only) or 'anivexa' (Anivexa providers only)"),
):
    """Get streaming URL + subtitles from Anivexa for a specific episode.
    Uses provider fallback chain if no specific provider is given (anidbapp → anikoto → ...).
    Use source=anitsu to only try Animetsu, source=anivexa to only try Anivexa providers."""
    try:
        if provider:
            data = await anivexa_client.get_stream_data(anilist_id, ep, provider, audio)
            if not data or data.get("error"):
                raise HTTPException(status_code=404, detail="Stream not available on Anivexa")
            m3u8_url, subtitles, referer, embed_url, stream_type = anivexa_client._extract_stream_info(data, audio)
            return {
                "stream_url": m3u8_url,
                "stream_type": stream_type,
                "subtitles": subtitles,
                "provider": provider,
                "referer": referer,
                "embed_url": embed_url,
            }
        if source == "anitsu":
            from app.services import anitsu_client
            result = await anitsu_client.get_stream(anilist_id, ep)
            if not result or (not result.get("stream_url") and not result.get("embed_url")):
                raise HTTPException(status_code=404, detail="Stream not available on Animetsu")
            return result
        if source == "anivexa":
            result = await anivexa_client.get_stream_with_fallback(anilist_id, ep, audio, skip_anitsu=True)
            if not result or (not result.get("stream_url") and not result.get("embed_url")):
                raise HTTPException(status_code=404, detail="Stream not available on Anivexa providers")
            return result
        result = await anivexa_client.get_stream_with_fallback(anilist_id, ep, audio)
        if not result or (not result.get("stream_url") and not result.get("embed_url")):
            raise HTTPException(status_code=404, detail="Stream not available on Anivexa")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail="Anivexa stream unavailable")


@router.get("/wibu/stream")
@limiter.limit("30/minute")
async def wibu_stream(
    request: Request,
    q: str = Query(..., min_length=2, description="Anime title to search"),
    ep: int = Query(..., ge=1, description="Episode number"),
    server: str = Query("vidstream", description="Streaming server"),
):
    """Search Wibu by title and get streaming URL for an episode.
    Used as a third fallback source when Animetsu and Anivexa both fail."""
    try:
        result = await wibu_client.search_and_get_stream(q, ep, server)
        if not result or (not result.get("stream_url") and not result.get("embed_url")):
            raise HTTPException(status_code=404, detail="Stream not available on Wibu")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail="Wibu stream unavailable")


@router.get("/anivexa/subtitle")
@limiter.limit("120/minute")
async def anivexa_subtitle_proxy(
    request: Request,
    url: str = Query(..., description="URL of the VTT subtitle file"),
    referer: str = Query("", description="Referer header for upstream request"),
):
    """CORS proxy for Anivexa subtitle files (VTT)."""
    try:
        decoded_url = _b64.urlsafe_b64decode(url.encode()).decode()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid subtitle URL encoding")

    if not _is_proxy_url_allowed(decoded_url):
        raise HTTPException(status_code=400, detail="URL not in allowed proxy list")

    headers = {**_PROXY_HEADERS}
    if referer:
        headers["Referer"] = referer

    try:
        client = get_shared_client(timeout=_PROXY_TIMEOUT, headers=headers, follow_redirects=True)
        resp = await client.get(decoded_url)
        resp.raise_for_status()
        return Response(
            content=resp.text,
            media_type="text/vtt",
            headers={**_CORS_HEADERS, "Cache-Control": "public, max-age=3600"},
        )
    except _httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Upstream error")
    except Exception as e:
        raise HTTPException(status_code=502, detail="Subtitle proxy request failed")


@router.get("/anivexa/{anilist_id}/master")
@limiter.limit("30/minute")
async def anivexa_master_m3u8(
    request: Request,
    anilist_id: int,
    ep: int = Query(..., ge=1, description="Episode number"),
    audio: str = Query("sub", description="Audio type: sub or dub"),
    provider: str = Query("anikoto", description="Provider"),
):
    """Proxy the Anivexa M3U8 stream through our domain for CORS and URL rewriting."""
    try:
        result = await anivexa_client.get_stream_with_fallback(anilist_id, ep, audio)
        if not result or not result.get("stream_url"):
            raise HTTPException(status_code=404, detail="Stream not available")

        m3u8_url = result["stream_url"]
        referer = result.get("referer")

        # Fetch the M3U8 content and rewrite URLs to proxy through us
        fetch_headers = {**_PROXY_HEADERS}
        if referer:
            fetch_headers["Referer"] = referer
        client = get_shared_client(timeout=_PROXY_TIMEOUT, headers=fetch_headers, follow_redirects=True)
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


_REFERER_MAP = {
    "megap.kotocdn.site": "https://megaplay.buzz/",
    "ani.pm": "https://ani.pm/",
    "cdn.ani.pm": "https://ani.pm/",
    "kwik.cx": "https://animepahe.ru/",
    "1oe.lostproject.club": "https://megaplay.buzz/",
    "hls.anidb.app": "https://anidb.app/",
    "fxpy7.watching.onl": "https://anidb.app/",
    "megaplay.buzz": "https://ani.pm/",
    "vidcache.net": "https://wibuapi.com/",
    "sbplay.com": "https://wibuapi.com/",
    "sbplay2.com": "https://wibuapi.com/",
    "sbvideo.net": "https://wibuapi.com/",
    "streamtape.com": "https://wibuapi.com/",
    "doodstream.com": "https://wibuapi.com/",
    "dood.pm": "https://wibuapi.com/",
    "dood.wf": "https://wibuapi.com/",
    "dood.watch": "https://wibuapi.com/",
    "mp4upload.com": "https://wibuapi.com/",
    "streamsb.com": "https://wibuapi.com/",
    "streamwish.to": "https://wibuapi.com/",
    "embtaku.pro": "https://wibuapi.com/",
    "pahe.win": "https://wibuapi.com/",
}


def _get_upstream_referer(url: str) -> str:
    """Determine the correct Referer header for a given upstream URL."""
    from urllib.parse import urlparse
    try:
        host = urlparse(url).hostname or ""
    except Exception:
        return "https://gogoanimehd.to/"
    for domain, referer in _REFERER_MAP.items():
        if host == domain or host.endswith("." + domain):
            return referer
    return "https://gogoanimehd.to/"


@router.get("/anivexa/proxy")
@limiter.limit("120/minute")
async def anivexa_proxy(
    request: Request,
    url: str = Query(..., description="Base64-encoded URL to proxy"),
    referer: str = Query("", description="Optional referer override"),
):
    """CORS proxy for Anivexa M3U8 and .ts segment requests.
    Automatically selects the correct Referer header based on the upstream domain."""
    try:
        decoded_url = _b64.urlsafe_b64decode(url.encode()).decode()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid proxy URL encoding")

    if not _is_proxy_url_allowed(decoded_url):
        from urllib.parse import urlparse
        blocked_host = urlparse(decoded_url).hostname
        logger.warning("Anivexa proxy blocked host: %s (URL: %.200s)", blocked_host, decoded_url)
        raise HTTPException(status_code=400, detail="URL not in allowed proxy list")

    upstream_referer = referer or _get_upstream_referer(decoded_url)
    fetch_headers = {**_PROXY_HEADERS, "Referer": upstream_referer}

    try:
        client = get_shared_client(timeout=_PROXY_TIMEOUT, headers=fetch_headers, follow_redirects=True)
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

            if "#EXTINF" not in body:
                raise HTTPException(status_code=404, detail="M3U8 has no real video segments after ad filtering")

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
    """Rewrite relative URLs in M3U8 to go through the anivexa proxy endpoint. Filters ad segments."""
    from urllib.parse import urljoin, urlparse
    import re

    proxy_base = "/api/v1/streaming/anivexa/proxy"
    lines = m3u8_text.split("\n")
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Skip empty lines and tags (but check #EXTINF for ad following it)
        if not stripped or stripped.startswith("#"):
            if stripped.startswith("#EXTINF") and i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if next_line and not next_line.startswith("#"):
                    resolved = urljoin(current_url, next_line) if not next_line.startswith("http") else next_line
                    if gogoanime_client._is_ad_url(resolved):
                        i += 2
                        continue
            result.append(line)
            i += 1
            continue

        # Resolve relative URLs
        if not stripped.startswith("http"):
            resolved = urljoin(current_url, stripped)
        else:
            resolved = stripped

        # Filter ad segments
        if gogoanime_client._is_ad_url(resolved):
            i += 1
            continue

        # Encode and rewrite to proxy
        encoded = _b64.urlsafe_b64encode(resolved.encode()).decode()
        result.append(f"{proxy_base}?url={encoded}")
        i += 1

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

    return {"data": [], "source": "none"}


@router.get("/fallback/stream")
@limiter.limit("30/minute")
async def fallback_stream(
    request: Request,
    q: str = Query(..., min_length=2, description="Anime title to search"),
    ep: int = Query(1, ge=1, description="Episode number"),
    audio: str = Query("sub", description="Audio type: sub or dub"),
    anilist_id: int | None = Query(None, description="AniList ID (optional, speeds up lookup)"),
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

    # Fallback to Anivexa
    if anilist_id:
        try:
            result = await anivexa_client.get_stream_with_fallback(anilist_id, ep, audio)
            if result and (result.get("stream_url") or result.get("embed_url")):
                master_path = f"/api/v1/streaming/anivexa/{anilist_id}/master?ep={ep}&audio={audio}"
                return {
                    "source": "anivexa",
                    "provider": result.get("provider", "anikoto"),
                    "master_url": master_path if result.get("stream_url") else None,
                    "stream_url": result.get("stream_url"),
                    "embed_url": result.get("embed_url"),
                    "subtitles": result.get("subtitles", []),
                    "anilist_id": anilist_id,
                }
        except Exception:
            pass

    raise HTTPException(status_code=404, detail="No streaming sources available from any provider")


@router.get("/download")
@limiter.limit("10/minute")
async def download_episode(
    request: Request,
    slug: str = Query(None, description="GogoAnime slug"),
    anilist_id: int = Query(None, description="AniList ID for Anivexa fallback"),
    ep: int = Query(1, ge=1, description="Episode number"),
    audio: str = Query("sub", description="Audio type: sub or dub"),
    filename: str = Query("episode", description="Download filename"),
):
    """
    Resolve a stream internally and force browser download via Content-Disposition.
    For m3u8, downloads all .ts segments and concatenates them.
    """
    from urllib.parse import urlparse, urljoin
    from app.services import gogoanime_client, anivexa_client

    dl_client = _httpx.AsyncClient(
        timeout=_httpx.Timeout(120.0, connect=15.0),
        headers={**_PROXY_HEADERS, "Referer": "https://gogoanimehd.to/"},
        follow_redirects=True,
    )

    try:
        stream_url = None
        referer = ""

        if slug:
            effective = _dub_slug(slug, audio)
            try:
                episode_data = await gogoanime_client.get_episode(effective, ep)
                if episode_data:
                    proxy_url = episode_data.get("defaultStreamingUrl", "")
                    if proxy_url:
                        full = proxy_url if proxy_url.startswith("http") else f"{gogoanime_client._BASE_URL}{proxy_url}"
                        resp = await dl_client.get(full)
                        resp.raise_for_status()
                        text = resp.text
                        m3u8_match = _re.search(r'https?://[^\s"\'<>]+\.m3u8[^\s"\'<>]*', text)
                        if m3u8_match:
                            stream_url = m3u8_match.group(0)
                            referer = gogoanime_client._BASE_URL + "/"
            except Exception as e:
                logger.warning("GogoAnime download resolve failed for %s: %s", slug, e)

        if not stream_url and anilist_id:
            try:
                result = await anivexa_client.get_stream_with_fallback(anilist_id, ep, audio)
                if result and result.get("stream_url"):
                    stream_url = result["stream_url"]
                    referer = result.get("referer", "")

                    if result.get("stream_type") == "mp4":
                        headers = {"Referer": referer} if referer else {}
                        resp = await dl_client.get(stream_url, headers=headers)
                        resp.raise_for_status()
                        safe_name = _re.sub(r'[^\w\-]', '_', filename)
                        return Response(
                            content=resp.content,
                            media_type=resp.headers.get("content-type", "video/mp4"),
                            headers={
                                "Content-Disposition": f'attachment; filename="{safe_name}.mp4"',
                                "Content-Length": str(len(resp.content)),
                            },
                        )
            except Exception as e:
                logger.warning("Anivexa download resolve failed: %s", e)

        if not stream_url:
            raise HTTPException(status_code=404, detail="No streaming source available")

        resp = await dl_client.get(stream_url, headers={"Referer": referer} if referer else {})
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        body = resp.text
        is_hls = "mpegurl" in content_type or body.strip().startswith("#EXTM3U")

        if not is_hls:
            safe_name = _re.sub(r'[^\w\-]', '_', filename)
            return Response(
                content=resp.content,
                media_type=content_type or "video/mp4",
                headers={
                    "Content-Disposition": f'attachment; filename="{safe_name}.mp4"',
                    "Content-Length": str(len(resp.content)),
                },
            )

        parsed = urlparse(stream_url)
        base = f"{parsed.scheme}://{parsed.netloc}"

        variant_url = None
        for line in body.splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                variant_url = urljoin(stream_url, line)
                break

        if variant_url:
            try:
                var_resp = await dl_client.get(variant_url, headers={"Referer": referer} if referer else {})
                var_resp.raise_for_status()
                body = var_resp.text
                parsed = urlparse(variant_url)
                base = f"{parsed.scheme}://{parsed.netloc}"
            except Exception:
                pass

        segment_urls = []
        for line in body.splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                segment_urls.append(urljoin(base + "/", line))

        if not segment_urls:
            raise HTTPException(status_code=404, detail="No segments found in playlist")

        async def stream_segments():
            try:
                for seg_url in segment_urls:
                    try:
                        seg_resp = await dl_client.get(seg_url, headers={"Referer": referer or base})
                        seg_resp.raise_for_status()
                        yield seg_resp.content
                    except Exception:
                        continue
            finally:
                await dl_client.aclose()

        safe_name = _re.sub(r'[^\w\-]', '_', filename)
        return StreamingResponse(
            stream_segments(),
            media_type="video/mp2t",
            headers={
                "Content-Disposition": f'attachment; filename="{safe_name}.ts"',
            },
        )
    except HTTPException:
        await dl_client.aclose()
        raise
    except Exception as e:
        await dl_client.aclose()
        logger.warning("Download failed: %s", e)
        raise HTTPException(status_code=502, detail="Download failed")


# ── Diagnostic endpoint ──────────────────────────────────────────────


@router.get("/diagnose")
@limiter.limit("10/minute")
async def diagnose_streaming(
    request: Request,
    q: str = Query(..., min_length=2, description="Anime title to diagnose"),
    ep: int = Query(1, ge=1, description="Episode number"),
    anilist_id: int | None = Query(None, description="Optional AniList ID"),
):
    """Diagnose which streaming sources are available for a given anime.
    Tests each scraper in order and reports which ones work/fail."""
    from app.services import anilist_client
    import time

    report = {"title": q, "episode": ep, "sources": {}}

    # 1. Resolve AniList ID
    aid = anilist_id
    if not aid:
        try:
            result = await anilist_client.search_anime(q, per_page=5)
            media = result.get("Page", {}).get("media", [])
            if media:
                aid = media[0]["id"]
                report["anilist_id"] = aid
        except Exception as e:
            report["anilist_id_error"] = str(e)[:200]
    else:
        report["anilist_id"] = aid

    # 2. Test GogoAnime catalog search
    try:
        t0 = time.monotonic()
        gogo_results = await gogoanime_client.search_anime(q)
        elapsed = time.monotonic() - t0
        report["sources"]["gogoanime"] = {
            "available": len(gogo_results) > 0,
            "results_count": len(gogo_results),
            "elapsed_ms": round(elapsed * 1000),
            "slug": gogo_results[0].get("slug") if gogo_results else None,
        }
    except Exception as e:
        report["sources"]["gogoanime"] = {"available": False, "error": str(e)[:200]}

    # 3. Test Animetsu (if AniList ID available)
    if aid:
        try:
            t0 = time.monotonic()
            anitsu_result = await anitsu_client.get_stream(aid, ep)
            elapsed = time.monotonic() - t0
            report["sources"]["animetsu"] = {
                "available": bool(anitsu_result.get("stream_url")),
                "has_embed": bool(anitsu_result.get("embed_url")),
                "provider": anitsu_result.get("provider"),
                "stream_type": anitsu_result.get("stream_type"),
                "elapsed_ms": round(elapsed * 1000),
            }
        except Exception as e:
            report["sources"]["animetsu"] = {"available": False, "error": str(e)[:200]}

    # 4. Test Anivexa providers (if AniList ID available)
    if aid:
        try:
            t0 = time.monotonic()
            anivexa_result = await anivexa_client.get_stream_with_fallback(aid, ep, skip_anitsu=True)
            elapsed = time.monotonic() - t0
            report["sources"]["anivexa"] = {
                "available": bool(anivexa_result.get("stream_url")),
                "has_embed": bool(anivexa_result.get("embed_url")),
                "provider": anivexa_result.get("provider"),
                "stream_type": anivexa_result.get("stream_type"),
                "elapsed_ms": round(elapsed * 1000),
            }
        except Exception as e:
            report["sources"]["anivexa"] = {"available": False, "error": str(e)[:200]}

    # 5. Test Wibu
    try:
        t0 = time.monotonic()
        wibu_result = await wibu_client.search_and_get_stream(q, ep)
        elapsed = time.monotonic() - t0
        report["sources"]["wibu"] = {
            "available": bool(wibu_result.get("stream_url")),
            "has_embed": bool(wibu_result.get("embed_url")),
            "elapsed_ms": round(elapsed * 1000),
        }
    except Exception as e:
        report["sources"]["wibu"] = {"available": False, "error": str(e)[:200]}

    # Summary
    working = [k for k, v in report["sources"].items() if v.get("available")]
    report["working_sources"] = working
    report["has_any_source"] = len(working) > 0

    return report
