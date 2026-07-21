from fastapi import APIRouter, Query
import httpx
from fastapi import HTTPException

from app.services import aggregator

router = APIRouter(prefix="/api/v1/search", tags=["search"])


@router.get("")
async def search(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
):
    """Search for anime by title."""
    try:
        data = await aggregator.search(q, page=page)
        return {"data": data["results"], "pagination": data["pagination"]}
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Search service temporarily unavailable")
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/genres")
async def genres():
    """Get all available anime genres."""
    try:
        data = await aggregator.get_genres()
        return {"data": data["genres"]}
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Failed to fetch genres")
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")
