"""
Streaming router — provides unified episode streaming, HLS M3U8 proxying,
and server selection via GogoAnime and AniList integration.
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
from app.services import streaming_provider
from app.services import gogoanime_client
from app.services import anivexa_client
from app.services import wibu_client
from app.services import anitsu_client as anitsu_client_mod

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
    Get episode list for an anime with streaming info.
    
    Returns paginated episodes with episode number, title, air date, and available sources.
    """
    try:
        data = await streaming_provider.get_anime_episodes(anime_id, page=page)
        if "error" in data:
            raise HTTPException(status_code=404, detail="Anime episodes not found")
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to fetch episodes for anime %d: %s", anime_id, e)
        raise HTTPException(status_code=503, detail="Episodes temporarily unavailable")


@router.get("/anime/{anime_id}/episode/{episode_number}")
@limiter.limit("60/minute")
async def get_episode_detail(
    request: Request,
    anime_id: int,
    episode_number: int,
    audio: str = Query("sub", description="Audio type: sub or dub"),
):
    """
    Get detailed information about a specific episode.
    
    Returns episode metadata, all available streaming servers, subtitles, and quality options.
    """
    try:
        data = await streaming_provider.get_episode_detail(anime_id, episode_number, audio=audio)
        if "error" in data:
            raise HTTPException(status_code=404, detail="Episode not found")
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to fetch episode detail for anime %d ep %d: %s", anime_id, episode_number, e)
        raise HTTPException(status_code=503, detail="Episode data unavailable")


@router.get("/anime/{anime_id}/episode/{episode_number}/sources")
@limiter.limit("60/minute")
async def get_episode_sources(
    request: Request,
    anime_id: int,
    episode_number: int,
    server: str | None = Query(None, description="Optional: specific server (vidstream, streamtape, etc)"),
    audio: str = Query("sub", description="Audio type: sub or dub"),
):
    """
    Get streaming sources for an episode.
    
    Returns list of available servers with direct streaming links and quality options.
    """
    try:
        data = await streaming_provider.get_episode_sources(anime_id, episode_number, server=server, audio=audio)
        if "error" in data and not data.get("sources"):
            raise HTTPException(status_code=404, detail="No streaming sources found")
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to fetch episode sources for anime %d ep %d: %s", anime_id, episode_number, e)
        raise HTTPException(status_code=503, detail="Sources temporarily unavailable")


@router.get("/anime/{anime_id}/episode/{episode_number}/subtitles")
@limiter.limit("60/minute")
async def get_episode_subtitles(
    request: Request,
    anime_id: int,
    episode_number: int,
    audio: str = Query("sub", description="Audio type: sub or dub"),
):
    """
    Get available subtitle tracks for an episode.
    
    Returns subtitle options in various languages with download/embed URLs.
    """
    try:
        data = await streaming_provider.get_episode_sources(anime_id, episode_number, audio=audio)
        return {"subtitles": data.get("subtitles", []), "languages": []}
    except Exception as e:
        return {"subtitles": [], "languages": []}


@router.get("/servers")
@limiter.limit("30/minute")
async def list_streaming_servers(request: Request):
    """
    Get list of all available streaming servers.
    
    Returns metadata about each server: name, reliability, quality, region, etc.
    Useful for frontend to let users choose preferred server.
    """
    try:
        data = await streaming_provider.get_available_servers()
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
    Get recently aired episodes across all anime.

    Uses AniList global airing schedule (sorted by air time desc) and
    cross-references with GogoAnime catalog for streaming slugs.
    """
    try:
        from app.services import gogoanime_client, anilist_client
        import time as _time

        now = _time.time()

        # Fetch recently aired episodes from AniList (3 pages to have enough)
        aired = []
        for pg in range(1, 4):
            try:
                batch = await anilist_client.get_recently_aired(page=pg, per_page=50)
                if not batch:
                    break
                aired.extend(batch)
            except Exception:
                break

        if not aired:
            return {"data": [], "page": page, "has_next": False}

        # Dedupe by (mediaId, episode) — keep first (most recent)
        seen = set()
        unique = []
        for a in aired:
            key = (a.get("mediaId"), a.get("episode"))
            if key in seen:
                continue
            seen.add(key)
            unique.append(a)

        # Build GogoAnime catalog lookup: normalized_title -> item
        gogo_catalog = gogoanime_client.get_catalog()
        gogo_by_norm: dict[str, dict] = {}
        for item in gogo_catalog:
            slug = item.get("slug", "")
            if not slug:
                continue
            for title_field in ["title", "title_english", "title_japanese"]:
                t = item.get(title_field, "")
                if t:
                    norm = gogoanime_client._normalize(t)
                    if norm:
                        gogo_by_norm[norm] = item

        # Build results
        results = []
        for a in unique:
            title = a.get("title") or ""
            episode = a.get("episode")
            airing_at = a.get("airingAt") or 0
            aired_ago = int(now - airing_at) if airing_at > 0 else 0

            # Try to find GogoAnime slug
            slug = None
            poster = a.get("coverImage")
            for try_title in [title, a.get("title_jp", "")]:
                norm = gogoanime_client._normalize(try_title)
                if norm and norm in gogo_by_norm:
                    gogo_item = gogo_by_norm[norm]
                    slug = gogo_item.get("slug")
                    if not poster:
                        poster = gogo_item.get("poster") or gogo_item.get("image")
                    break

            results.append({
                "title": title,
                "episode": episode,
                "poster": poster,
                "slug": slug,
                "aired_ago": aired_ago,
                "genres": a.get("genres") or [],
                "anilist_id": a.get("mediaId"),
            })

        start = (page - 1) * limit
        page_eps = results[start:start + limit]
        has_next = len(results) > start + limit

        return {
            "data": page_eps,
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
    Get trending anime based on streaming views and popularity.
    """
    try:
        results = await gogoanime_client.search_anime("")
        return {"data": results[:limit], "page": page}
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
    Search for anime by title.
    """
    try:
        data = await gogoanime_client.search_anime(q)
        return {"data": data, "query": q, "page": page}
    except Exception as e:
        raise HTTPException(status_code=503, detail="Search unavailable")


@router.get("/play/{anime_id}/{episode_number}")
@limiter.limit("120/minute")
async def get_play_url(
    request: Request,
    anime_id: int,
    episode_number: int,
    server: str = Query("gogoanime_hls", description="Streaming server to use"),
    audio: str = Query("sub", description="Audio type: sub or dub"),
):
    """
    Get a direct play URL for an episode (for embedding in player).
    """
    try:
        data = await streaming_provider.get_stream_url(anime_id, episode_number, server=server)
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


@router.get("/gogoanime/{slug}/info")
@limiter.limit("30/minute")
async def gogoanime_info(
    request: Request,
    slug: str,
):
    """Get anime info (title, episode count) by GogoAnime slug."""
    info = gogoanime_client.get_info_by_slug(slug)
    if info:
        return {
            "data": {
                "slug": slug,
                "title": info.get("title"),
                "episodes_count": info.get("episodes_count") or None,
            }
        }
    return {"data": None}


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
    try:
        effective_slug = _dub_slug(slug, audio)
        episode = await gogoanime_client.get_episode(effective_slug, ep)
        if not episode:
            raise HTTPException(status_code=404, detail="Episode not found on GogoAnime")

        proxy_url = episode.get("defaultStreamingUrl", "")
        if not proxy_url:
            raise HTTPException(status_code=404, detail="No streaming URL available")

        m3u8_text, resolved_url = await gogoanime_client.resolve_m3u8(proxy_url)
        if not m3u8_text:
            raise HTTPException(status_code=503, detail="Failed to resolve M3U8 from GogoAnime")

        # Pass the full resolved URL as base so _rewrite_m3u8_urls can resolve
        # relative segment/variant URLs against the correct CDN origin and path.
        rewritten = gogoanime_client._rewrite_m3u8_urls(m3u8_text, resolved_url)

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
    """Resolve GogoAnime HLS stream for an episode. Returns direct_stream (M3U8 via proxy)
    or qualities (master playlist path) for hls.js playback."""
    try:
        from app.services import gogoanime_client
        effective_slug = _dub_slug(slug, audio)
        sources = await gogoanime_client.get_stream_sources(effective_slug, ep, audio)
        if not sources:
            raise HTTPException(status_code=404, detail="No streaming sources found")

        direct = sources.get("direct_stream")
        if direct and direct.get("stream_url"):
            return {"data": {
                "direct_stream": direct,
            }}

        master = sources.get("master_m3u8")
        if master:
            return {"data": {
                "master_m3u8": master,
                "qualities": sources.get("qualities", []),
            }}

        # If get_stream_sources returned only an embed_url, try to extract from it
        embed = sources.get("embed_url")
        if embed:
            extracted = await gogoanime_client.extract_embed_stream(embed)
            if extracted and extracted.get("stream_url"):
                return {"data": {
                    "direct_stream": extracted,
                }}

        raise HTTPException(status_code=404, detail="No playable HLS stream found on GogoAnime")
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
    "gogoanimehd.to",
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
    # Embed server CDN domains (extracted stream URLs)
    "cdn-video.xyz", "cdn77.org", "sw-cdnstreamwish.com",
    "streamtape.com", "doodstream.com", "mp4upload.com", "streamsb.com",
    "streamwish.to", "dood.pm", "dood.wf", "dood.watch",
    "embtaku.pro", "kwik.cx", "pahe.win",
    # Wibu/streaming CDN hosts
    "vidcache.net", "sbplay.com", "sbplay2.com", "sbvideo.net",
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
            body = gogoanime_client._rewrite_m3u8_urls(body, decoded_url)

            if "#EXTINF" not in body and "#EXT-X-STREAM-INF" not in body:
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


@router.get("/gogoanime/embed-proxy")
@limiter.limit("120/minute")
async def gogoanime_embed_proxy(
    request: Request,
    url: str = Query(..., description="Base64-encoded URL to proxy"),
    referer: str = Query("", description="Referer header for upstream request"),
):
    """CORS proxy for GogoAnime embed server streams (M3U8 + segments).
    Spoofs Referer/Origin headers so CDN tokens work."""
    try:
        decoded_url = _b64.urlsafe_b64decode(url.encode()).decode()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid proxy URL encoding")

    if not _is_proxy_url_allowed(decoded_url):
        from urllib.parse import urlparse
        blocked_host = urlparse(decoded_url).hostname
        logger.warning("Embed proxy blocked host: %s (URL: %.200s)", blocked_host, decoded_url)
        raise HTTPException(status_code=400, detail="URL not in allowed proxy list")

    upstream_referer = referer or "https://megaplay.buzz/"
    fetch_headers = {**_PROXY_HEADERS, "Referer": upstream_referer, "Origin": upstream_referer.rstrip("/")}

    try:
        client = get_shared_client(timeout=_PROXY_TIMEOUT, headers=fetch_headers, follow_redirects=True)
        resp = await client.get(decoded_url)
        resp.raise_for_status()

        content_type = resp.headers.get("content-type", "")
        body = resp.text

        if "mpegurl" in content_type or body.strip().startswith("#EXTM3U"):
            from urllib.parse import urlparse
            parsed = urlparse(decoded_url)
            base_url = f"{parsed.scheme}://{parsed.netloc}"

            # Rewrite segment/variant URLs to go through our embed-proxy
            proxy_base = "/api/v1/streaming/gogoanime/embed-proxy"
            lines = body.split("\n")
            rewritten = []
            i = 0
            while i < len(lines):
                line = lines[i]
                stripped = line.strip()

                if stripped and not stripped.startswith("#"):
                    # Resolve relative URL
                    if not stripped.startswith("http"):
                        from urllib.parse import urljoin
                        resolved = urljoin(decoded_url, stripped)
                    else:
                        resolved = stripped

                    if gogoanime_client._is_ad_url(resolved):
                        i += 1
                        continue

                    encoded = _b64.urlsafe_b64encode(resolved.encode()).decode()
                    rewritten.append(f"{proxy_base}?url={encoded}&referer={_b64.urlsafe_b64encode(upstream_referer.encode()).decode()}")
                elif stripped.startswith("#EXTINF") and i + 1 < len(lines):
                    rewritten.append(line)
                    next_line = lines[i + 1].strip()
                    if next_line and not next_line.startswith("#"):
                        if not next_line.startswith("http"):
                            from urllib.parse import urljoin
                            resolved = urljoin(decoded_url, next_line)
                        else:
                            resolved = next_line
                        if gogoanime_client._is_ad_url(resolved):
                            i += 2
                            continue
                else:
                    rewritten.append(line)
                i += 1

            body = "\n".join(rewritten)

            if "#EXTINF" not in body and "#EXT-X-STREAM-INF" not in body:
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
        raise HTTPException(status_code=502, detail="Embed proxy request failed")


# ── Anivexa fallback endpoints ──────────────────────────────────────


# In-memory cache for AniList ID resolution (avoids repeated AniList calls)
_resolve_cache: dict[str, tuple[float, dict]] = {}
_RESOLVE_CACHE_TTL = 60 * 60 * 24  # 24 hours


@router.get("/anivexa/resolve")
@limiter.limit("30/minute")
async def resolve_anilist_id(
    request: Request,
    q: str = Query(..., min_length=2, description="Anime title to search"),
):
    """Search AniList by title and return the AniList ID for Anivexa streaming."""
    import time
    cache_key = q.lower().strip()
    cached = _resolve_cache.get(cache_key)
    if cached and (time.monotonic() - cached[0]) < _RESOLVE_CACHE_TTL:
        return cached[1]
    try:
        from app.services import anilist_client
        result = await anilist_client.search_anime(q, per_page=5)
        media = result.get("Page", {}).get("media", [])
        if media:
            m = media[0]
            response = {"anilist_id": m["id"], "title": m.get("title", {}), "episodes": m.get("episodes")}
        else:
            response = {"anilist_id": None, "title": None, "episodes": None}
        _resolve_cache[cache_key] = (time.monotonic(), response)
        return response
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
            result = await anitsu_client_mod.get_stream(anilist_id, ep, audio=audio)
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


@router.get("/subtitles")
@limiter.limit("30/minute")
async def fetch_subtitles(
    request: Request,
    q: str = Query(..., min_length=2, description="Anime title"),
    ep: int = Query(..., ge=1, description="Episode number"),
    anilist_id: int | None = Query(None, description="Optional AniList ID"),
    audio: str = Query("sub", description="Audio type: sub or dub"),
):
    """Fetch subtitles for an episode from fallback providers (Anitsu → Wibu).
    Returns only subtitle data, no stream URL. Used by the frontend to get
    subtitles even when the primary stream comes from GogoAnime.
    Now accepts audio parameter for dub/sub subtitle matching."""
    if anilist_id:
        try:
            result = await anitsu_client_mod.get_stream(anilist_id, ep, audio=audio)
            if result and result.get("subtitles"):
                return {"subtitles": result["subtitles"], "provider": "anitsu"}
        except Exception:
            pass
    else:
        try:
            from app.services import anilist_client
            result = await anilist_client.search_anime(q, per_page=5)
            media = result.get("Page", {}).get("media", [])
            if media:
                anilist_id = media[0]["id"]
                stream_data = await anitsu_client_mod.get_stream(anilist_id, ep, audio=audio)
                if stream_data and stream_data.get("subtitles"):
                    return {"subtitles": stream_data["subtitles"], "provider": "anitsu"}
        except Exception:
            pass

    return {"subtitles": [], "provider": None}


@router.get("/anitsu/stream")
@limiter.limit("30/minute")
async def anitsu_stream(
    request: Request,
    q: str = Query(..., min_length=2, description="Anime title to search"),
    ep: int = Query(..., ge=1, description="Episode number"),
    audio: str = Query("sub", description="Audio type: sub or dub"),
):
    """Search by title, resolve to AniList ID, and get stream from Animetsu (AnimeXin).
    Used as second fallback after GogoAnime. Supports sub/dub audio selection."""
    try:
        from app.services import anilist_client
        result = await anilist_client.search_anime(q, per_page=5)
        media = result.get("Page", {}).get("media", [])
        if not media:
            raise HTTPException(status_code=404, detail="Anime not found on AniList")
        anilist_id = media[0]["id"]

        stream_data = await anitsu_client_mod.get_stream(anilist_id, ep, audio=audio)
        if not stream_data or (not stream_data.get("stream_url") and not stream_data.get("embed_url")):
            raise HTTPException(status_code=404, detail="Stream not available on AnimeXin")
        return stream_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail="AnimeXin stream unavailable")


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

            if "#EXTINF" not in body and "#EXT-X-STREAM-INF" not in body:
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
                        rewritten = gogoanime_client._rewrite_m3u8_urls(m3u8_text, resolved_url)
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


@router.get("/donghua/stream")
@limiter.limit("30/minute")
async def donghua_stream(
    request: Request,
    q: str = Query(..., min_length=1, description="Donghua title to search"),
    ep: int = Query(1, ge=1, description="Episode number"),
    audio: str = Query("sub", description="Audio type: sub or dub"),
    anilist_id: int | None = Query(None, description="Optional AniList ID for direct lookup"),
):
    """Donghua-specific streaming endpoint.
    Tries Anitsu/Animetsu first (which supports donghua better than GogoAnime),
    then falls back to Anivexa providers.
    Donghua titles often have different metadata on AniList."""
    if anilist_id:
        try:
            result = await anitsu_client_mod.get_stream(anilist_id, ep, audio=audio)
            if result and (result.get("stream_url") or result.get("embed_url")):
                return {"source": "donghua", "data": result}
        except Exception:
            pass

        try:
            result = await anivexa_client.get_stream_with_fallback(anilist_id, ep, audio)
            if result and (result.get("stream_url") or result.get("embed_url")):
                return {"source": "donghua", "data": result}
        except Exception:
            pass

    try:
        from app.services import anilist_client as _al
        search_result = await _al.search_anime(q, per_page=10)
        media_list = search_result.get("Page", {}).get("media", [])
        for media in media_list:
            mid = media.get("id")
            if not mid:
                continue
            try:
                result = await anitsu_client_mod.get_stream(mid, ep, audio=audio)
                if result and (result.get("stream_url") or result.get("embed_url")):
                    return {"source": "donghua", "anilist_id": mid, "data": result}
            except Exception:
                continue
            try:
                result = await anivexa_client.get_stream_with_fallback(mid, ep, audio)
                if result and (result.get("stream_url") or result.get("embed_url")):
                    return {"source": "donghua", "anilist_id": mid, "data": result}
            except Exception:
                continue
    except Exception as e:
        logger.warning("Donghua search failed: %s", e)

    raise HTTPException(status_code=404, detail="Donghua stream not available from any provider")


@router.get("/donghua/resolve")
@limiter.limit("30/minute")
async def donghua_resolve(
    request: Request,
    q: str = Query(..., min_length=1, description="Donghua title"),
):
    """Resolve a donghua title to AniList ID and metadata."""
    try:
        from app.services import anilist_client as _al
        result = await _al.search_anime(q, per_page=10)
        media_list = result.get("Page", {}).get("media", [])
        results = []
        for m in media_list:
            results.append({
                "anilist_id": m.get("id"),
                "title": m.get("title", {}),
                "episodes": m.get("episodes"),
                "format": m.get("format"),
                "status": m.get("status"),
                "genres": m.get("genres", []),
            })
        return {"data": results, "query": q}
    except Exception as e:
        raise HTTPException(status_code=503, detail="Donghua resolve failed")


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
    Uses the same resolution chain as the watch player.
    """
    from urllib.parse import urlparse, urljoin
    from app.services import gogoanime_client, anivexa_client

    dl_client = _httpx.AsyncClient(
        timeout=_httpx.Timeout(180.0, connect=15.0),
        headers={**_PROXY_HEADERS, "Referer": "https://gogoanimehd.to/"},
        follow_redirects=True,
    )

    try:
        stream_url = None
        referer = ""
        stream_type = None

        # Path 1: GogoAnime — reuse the proven get_stream_sources()
        if slug:
            effective = _dub_slug(slug, audio)
            try:
                sources = await gogoanime_client.get_stream_sources(effective, ep, audio)
                if sources:
                    direct = sources.get("direct_stream")
                    if direct:
                        stream_url = direct.get("stream_url")
                        referer = direct.get("referer", "")
                        stream_type = "hls" if (stream_url or "").endswith(".m3u8") or ".m3u8" in (stream_url or "") else "mp4"
                    elif sources.get("embed_url"):
                        extracted = await gogoanime_client.extract_embed_stream(sources["embed_url"])
                        if extracted:
                            stream_url = extracted.get("stream_url")
                            referer = extracted.get("referer", "")
                            stream_type = "hls" if (stream_url or "").endswith(".m3u8") or ".m3u8" in (stream_url or "") else "mp4"
                    elif sources.get("master_m3u8"):
                        stream_url = sources["master_m3u8"]
                        stream_type = "hls"
            except Exception as e:
                logger.warning("GogoAnime download resolve failed for %s ep-%d: %s", slug, ep, e)

        # Path 2: Try Anivexa — resolve anilist_id from title if needed
        if not stream_url and not anilist_id:
            try:
                from app.services import anilist_client as _al_client
                title_from_filename = filename.rsplit("_E", 1)[0].replace("_", " ")
                result = await _al_client.search_anime(title_from_filename, per_page=1)
                media = result.get("Page", {}).get("media", [])
                if media:
                    anilist_id = media[0]["id"]
            except Exception:
                pass

        if not stream_url and anilist_id:
            try:
                result = await anivexa_client.get_stream_with_fallback(anilist_id, ep, audio)
                if result:
                    stream_url = result.get("stream_url")
                    referer = result.get("referer", "")
                    stream_type = result.get("stream_type", "mp4")
            except Exception as e:
                logger.warning("Anivexa download resolve failed: %s", e)

        if not stream_url:
            raise HTTPException(status_code=404, detail="No streaming source available")

        # --- MP4 path: download directly and serve ---
        if stream_type == "mp4":
            dl_headers = {"Referer": referer} if referer else {}
            resp = await dl_client.get(stream_url, headers=dl_headers)
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

        # --- HLS path: fetch playlist, download segments, concatenate ---
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

        import asyncio as _aio
        import tempfile as _tmpfile
        import os as _os
        import shutil as _shutil

        # Parse master m3u8 to pick best variant — ffmpeg can't auto-select from multi-program masters
        if "EXT-X-STREAM-INF" in body:
            best_url = None
            best_bw = -1
            for line in body.splitlines():
                line = line.strip()
                if line.startswith("#EXT-X-STREAM-INF"):
                    bw = 0
                    for part in line.split(","):
                        if "BANDWIDTH=" in part:
                            try:
                                bw = int(part.split("=")[1].strip())
                            except ValueError:
                                pass
                elif line and not line.startswith("#") and best_bw is not None:
                    if bw > best_bw:
                        best_bw = bw
                        from urllib.parse import urljoin as _urljoin
                        best_url = _urljoin(stream_url, line)
                    bw = 0
            if best_url:
                stream_url = best_url

        safe_name = _re.sub(r'[^\w\-]', '_', filename)
        tmp_dir = _tmpfile.mkdtemp()
        mp4_path = _os.path.join(tmp_dir, f"{safe_name}.mp4")
        try:
            cmd = [
                "ffmpeg", "-y",
                "-referer", referer or "",
                "-user_agent", _PROXY_HEADERS.get("User-Agent", ""),
                "-headers", f"Referer: {referer or ''}\r\n",
                "-allowed_extensions", "ALL",
                "-i", stream_url,
                "-map", "0",
                "-c", "copy",
                "-movflags", "+faststart",
                mp4_path,
            ]
            proc = await _aio.create_subprocess_exec(
                *cmd,
                stdout=_aio.subprocess.PIPE,
                stderr=_aio.subprocess.PIPE,
            )
            stdout, stderr = await _aio.wait_for(proc.communicate(), timeout=300)

            if proc.returncode != 0:
                err_msg = stderr.decode(errors="replace")[-500:]
                logger.error("ffmpeg HLS→MP4 failed (code %d): %s", proc.returncode, err_msg)
                raise RuntimeError(f"ffmpeg failed: {err_msg}")

            with open(mp4_path, "rb") as f:
                mp4_content = f.read()

            await dl_client.aclose()
            return Response(
                content=mp4_content,
                media_type="video/mp4",
                headers={
                    "Content-Disposition": f'attachment; filename="{safe_name}.mp4"',
                    "Content-Length": str(len(mp4_content)),
                },
            )
        finally:
            try:
                _shutil.rmtree(tmp_dir, ignore_errors=True)
            except Exception:
                pass
    except HTTPException:
        await dl_client.aclose()
        raise
    except Exception as e:
        await dl_client.aclose()
        logger.error("Download failed (slug=%s, ep=%s, audio=%s): %s", slug, ep, audio, e, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Download failed: {type(e).__name__}: {e}")


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
            anitsu_result = await anitsu_client_mod.get_stream(aid, ep)
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
