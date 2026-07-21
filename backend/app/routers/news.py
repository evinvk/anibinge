"""
News router — aggregates anime news from AnimeNewsNetwork and other sources.
"""
from fastapi import APIRouter, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.services import ann_client

router = APIRouter(prefix="/api/v1/news", tags=["news"])
limiter = Limiter(key_func=get_remote_address)


@router.get("/")
@limiter.limit("30/minute")
async def get_news(
    request: Request,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=50, description="Results per page"),
):
    """
    Get latest anime news from AnimeNewsNetwork.
    
    Returns a paginated list of news articles with title, description, link, and publication date.
    """
    return await ann_client.get_anime_news(page=page, limit=limit)


@router.get("/reviews")
@limiter.limit("30/minute")
async def get_reviews(
    request: Request,
    anime_id: str | None = Query(None, description="Optional anime ID to filter reviews"),
    page: int = Query(1, ge=1, description="Page number"),
):
    """
    Get anime reviews from AnimeNewsNetwork.
    
    If anime_id is provided, returns reviews for that specific anime.
    Otherwise returns the latest reviews across all anime.
    """
    return await ann_client.get_anime_reviews(anime_id=anime_id, page=page)


@router.get("/featured")
@limiter.limit("30/minute")
async def get_featured(request: Request):
    """
    Get featured articles and content from AnimeNewsNetwork's homepage.
    """
    return await ann_client.get_featured_content()


@router.get("/rankings/{ranking_type}")
@limiter.limit("30/minute")
async def get_rankings(
    request: Request,
    ranking_type: str = Query(..., description="Type of ranking: top-anime, top-manga, most-popular, etc."),
):
    """
    Get ANN rankings by type.
    
    Supported types: top-anime, top-manga, most-popular, most-recommended, etc.
    """
    return await ann_client.get_rankings(ranking_type=ranking_type)


@router.get("/encyclopedia/search")
@limiter.limit("30/minute")
async def search_encyclopedia(
    request: Request,
    q: str = Query(..., description="Search query"),
    type_filter: str | None = Query(None, description="Filter by type: anime, manga, people, companies, etc."),
):
    """
    Search AnimeNewsNetwork's encyclopedia database.
    
    Returns results matching the query, optionally filtered by type.
    """
    return await ann_client.search_encyclopedia(query=q, type_filter=type_filter)


@router.get("/encyclopedia/{entry_type}/{entry_id}")
@limiter.limit("30/minute")
async def get_encyclopedia_entry(
    request: Request,
    entry_type: str = Query(..., description="Type: anime, manga, people, companies, etc."),
    entry_id: str = Query(..., description="ID of the encyclopedia entry"),
):
    """
    Get detailed information about an encyclopedia entry.
    
    entry_type: anime, manga, people, companies, studios, etc.
    """
    return await ann_client.get_encyclopedia_entry(entry_id=entry_id, entry_type=entry_type)
