from fastapi import APIRouter, Query, HTTPException
import logging

from app.services import aggregator

logger = logging.getLogger("anibinge.search")
router = APIRouter(prefix="/api/v1/search", tags=["search"])


@router.get("")
async def search(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    genres: str | None = None,
    status: str | None = None,
    type: str | None = None,
    rating: str | None = None,
    min_score: float | None = None,
    order_by: str | None = Query(None, description="score | popularity | title | start_date"),
    sort: str | None = Query(None, description="asc | desc"),
):
    """Search for anime across all sources."""
    try:
        results = await aggregator.search(
            q, page=page, genres=genres, status=status, type=type,
            rating=rating, min_score=min_score, order_by=order_by, sort=sort,
        )
        return {"data": results}
    except Exception as e:
        logger.error("Search error for query '%s': %s", q, e)
        raise HTTPException(status_code=503, detail="Unable to perform search")


@router.get("/genres")
async def genres():
    """Get all available anime genres."""
    try:
        data = await aggregator.get_genres()
        return data
    except Exception as e:
        logger.error("Genres error: %s", e)
        raise HTTPException(status_code=503, detail="Unable to fetch genres")
