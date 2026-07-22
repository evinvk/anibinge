"""
News router — anime news from AnimeNewsNetwork RSS feeds.
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
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
):
    """Latest anime news articles from AnimeNewsNetwork."""
    return await ann_client.get_anime_news(page=page, limit=limit)


@router.get("/reviews")
@limiter.limit("30/minute")
async def get_reviews(
    request: Request,
    anime_id: str | None = Query(None),
    page: int = Query(1, ge=1),
):
    """Anime reviews from AnimeNewsNetwork."""
    return await ann_client.get_anime_reviews(anime_id=anime_id, page=page)


@router.get("/featured")
@limiter.limit("30/minute")
async def get_featured(request: Request):
    """Top featured articles from AnimeNewsNetwork."""
    return await ann_client.get_featured_content()
