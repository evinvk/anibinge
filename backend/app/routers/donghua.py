"""
Donghua router — dedicated endpoints for the /donghua section.
Uses AnimeXin (animexin.dev) as the primary data source.
"""
import logging
import re
from base64 import b64decode

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, StreamingResponse

from app.core.http import get_shared_client
from app.services import animexin_client

logger = logging.getLogger("anibinge.donghua")

router = APIRouter(prefix="/api/v1/donghua", tags=["donghua"])

_PROXY_TTL = 300
_EMBED_ALLOWED_HOSTS = {
    "dailymotion.com", "www.dailymotion.com", "dmcdn.net",
    "odysee.com", "www.odysee.com",
    "ok.ru",
    "rumble.com", "rumble.com",
    "mega.nz", "mega.co.nz",
    "doodstream.com", "dood.pm", "dood.wf", "dood.watch",
    "streamwish.com", "streamwish.to",
    "dtube.life",
}


@router.get("/trending")
async def trending():
    """Popular/trending donghua from AnimeXin homepage."""
    try:
        items = await animexin_client.get_trending()
        return {"data": items}
    except Exception as e:
        logger.error("Donghua trending error: %s", e)
        raise HTTPException(status_code=503, detail="Unable to fetch trending donghua")


@router.get("/latest")
async def latest(page: int = Query(1, ge=1)):
    """Latest donghua releases."""
    try:
        items = await animexin_client.get_latest(page)
        return {"data": items, "page": page}
    except Exception as e:
        logger.error("Donghua latest error: %s", e)
        raise HTTPException(status_code=503, detail="Unable to fetch latest donghua")


@router.get("/search")
async def search(q: str = Query(..., min_length=1)):
    """Search AnimeXin for donghua."""
    try:
        results = await animexin_client.search(q)
        return {"data": results, "query": q}
    except Exception as e:
        logger.error("Donghua search error: %s", e)
        raise HTTPException(status_code=503, detail="Search failed")


@router.get("/anime/{slug}")
async def anime_detail(slug: str):
    """Get anime detail page with episode list."""
    try:
        detail = await animexin_client.get_anime_detail(slug)
        if not detail:
            raise HTTPException(status_code=404, detail="Donghua not found")
        return {"data": detail}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Donghua detail error for '%s': %s", slug, e)
        raise HTTPException(status_code=503, detail="Unable to fetch anime details")


@router.get("/anime/{slug}/episode/{episode}")
async def episode_servers(slug: str, episode: int):
    """Get streaming servers for a specific episode."""
    try:
        detail = await animexin_client.get_anime_detail(slug)
        if not detail:
            raise HTTPException(status_code=404, detail="Donghua not found")

        ep_list = detail.get("episode_list", [])
        ep_info = None
        for ep in ep_list:
            if ep["number"] == episode:
                ep_info = ep
                break

        if not ep_info:
            ep_url = f"https://animexin.dev/{slug}-episode-{episode}-indonesia-english-sub/"
            ep_info = {"number": episode, "url": ep_url, "slug": f"{slug}-episode-{episode}"}

        result = await animexin_client.get_episode_servers(ep_info["url"])
        return {"data": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Donghua episode servers error: %s", e)
        raise HTTPException(status_code=503, detail="Unable to fetch episode servers")


@router.get("/stream")
async def stream(slug: str = Query(...), episode: int = Query(...), server: int = Query(0, ge=0)):
    """Get stream URL for an episode."""
    try:
        detail = await animexin_client.get_anime_detail(slug)
        if not detail:
            raise HTTPException(status_code=404, detail="Donghua not found")

        ep_list = detail.get("episode_list", [])
        ep_info = None
        for ep in ep_list:
            if ep["number"] == episode:
                ep_info = ep
                break

        if not ep_info:
            ep_url = f"https://animexin.dev/{slug}-episode-{episode}-indonesia-english-sub/"
        else:
            ep_url = ep_info["url"]

        result = await animexin_client.get_stream_for_episode(ep_url, server)
        return {"data": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Donghua stream error: %s", e)
        raise HTTPException(status_code=503, detail="Unable to resolve stream")


@router.get("/proxy")
async def proxy_embed(url: str = Query(...), referer: str = Query("")):
    """CORS proxy for embedded content (Dailymotion, Odysee, etc.)."""
    try:
        client = get_shared_client(timeout=20.0)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        if referer:
            headers["Referer"] = referer

        resp = await client.get(url, headers=headers)
        content_type = resp.headers.get("content-type", "text/html")

        if "text/html" in content_type:
            body = resp.text
            body = body.replace('crossoriginPolicy="true"', '')
            body = re.sub(r'crossoriginPolicy\s*=\s*["\'].*?["\']', '', body)
            return HTMLResponse(
                content=body,
                status_code=resp.status_code,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Content-Type": "text/html; charset=utf-8",
                },
            )
        else:
            return StreamingResponse(
                iter([resp.content]),
                status_code=resp.status_code,
                media_type=content_type,
                headers={"Access-Control-Allow-Origin": "*"},
            )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Upstream error")
    except Exception as e:
        logger.error("Donghua proxy error: %s", e)
        raise HTTPException(status_code=502, detail="Proxy request failed")


@router.get("/servers")
async def list_servers():
    """List available donghua streaming servers."""
    return {
        "data": [
            {"id": "animexin", "name": "AnimeXin", "primary": True},
        ]
    }
