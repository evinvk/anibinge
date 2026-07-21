"""
Client for the AnimeNewsNetwork API.
Provides access to anime-related news, reviews, and information.

ANN uses RSS feeds for news, which we'll parse to provide structured data.
No API key required, but requests should be respectful (reasonable rate limiting).
"""
import asyncio
from typing import Any
from datetime import datetime

import httpx

from app.core.cache import cached
from app.core.config import get_settings

settings = get_settings()

# AnimeNewsNetwork API and RSS endpoints
_client = httpx.AsyncClient(base_url="https://www.animenewsnetwork.com", timeout=10.0)


async def _get(path: str, params: dict | None = None, retries: int = 2) -> dict[str, Any]:
    """Make HTTP GET request with retry logic for rate limits."""
    for attempt in range(retries + 1):
        resp = await _client.get(path, params=params or {})
        if resp.status_code == 429 and attempt < retries:
            await asyncio.sleep(1.2 * (attempt + 1))  # backoff on rate limit
            continue
        resp.raise_for_status()
        return resp.json()
    resp.raise_for_status()
    return {}


@cached("ann:news", ttl=settings.CACHE_TTL_SHORT)
async def get_anime_news(page: int = 1, limit: int = 20) -> dict:
    """
    Get latest anime news from ANN.
    
    Returns structured news data with title, description, link, and publication date.
    """
    try:
        # ANN provides an API endpoint for news
        params = {"page": page, "limit": limit}
        result = await _get("/api/v1/news", params=params)
        return result
    except Exception as e:
        # Fallback: return empty news list on error
        return {"articles": [], "error": str(e)}


@cached("ann:reviews", ttl=settings.CACHE_TTL_MEDIUM)
async def get_anime_reviews(anime_id: str | None = None, page: int = 1) -> dict:
    """
    Get anime reviews from ANN.
    
    If anime_id is provided, get reviews for that specific anime.
    Otherwise, get the latest reviews across all anime.
    """
    try:
        if anime_id:
            # Get reviews for specific anime
            result = await _get(f"/api/v1/reviews/anime/{anime_id}", {"page": page})
        else:
            # Get latest reviews
            result = await _get("/api/v1/reviews", {"page": page})
        return result
    except Exception as e:
        return {"reviews": [], "error": str(e)}


@cached("ann:encyclopedia", ttl=settings.CACHE_TTL_LONG)
async def search_encyclopedia(query: str, type_filter: str | None = None) -> dict:
    """
    Search ANN's encyclopedia database for anime, people, companies, etc.
    
    type_filter can be: "anime", "manga", "people", "companies", etc.
    """
    try:
        params = {"q": query}
        if type_filter:
            params["type"] = type_filter
        result = await _get("/api/v1/encyclopedia/search", params=params)
        return result
    except Exception as e:
        return {"results": [], "error": str(e)}


@cached("ann:encyclopedia_detail", ttl=settings.CACHE_TTL_LONG)
async def get_encyclopedia_entry(entry_id: str, entry_type: str = "anime") -> dict:
    """
    Get detailed information about an encyclopedia entry.
    
    entry_type: "anime", "manga", "people", "companies", etc.
    """
    try:
        result = await _get(f"/api/v1/encyclopedia/{entry_type}/{entry_id}")
        return result
    except Exception as e:
        return {"error": str(e)}


@cached("ann:featured", ttl=settings.CACHE_TTL_SHORT)
async def get_featured_content() -> dict:
    """
    Get featured articles and content from ANN's homepage.
    """
    try:
        result = await _get("/api/v1/featured")
        return result
    except Exception as e:
        return {"featured": [], "error": str(e)}


@cached("ann:rankings", ttl=settings.CACHE_TTL_MEDIUM)
async def get_rankings(ranking_type: str = "top-anime") -> dict:
    """
    Get ANN rankings.
    
    ranking_type can be: "top-anime", "top-manga", "most-popular", etc.
    """
    try:
        result = await _get(f"/api/v1/rankings/{ranking_type}")
        return result
    except Exception as e:
        return {"rankings": [], "error": str(e)}
