from fastapi import APIRouter, Query

from app.services import aggregator, jikan_client

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
    results = await aggregator.search(
        q, page=page, genres=genres, status=status, type=type,
        rating=rating, min_score=min_score, order_by=order_by, sort=sort,
    )
    return {"data": results}


@router.get("/genres")
async def genres():
    return await jikan_client.get_genres()
