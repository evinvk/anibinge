"""
Pydantic schemas for request/response validation and documentation.
"""
from pydantic import BaseModel, Field
from typing import Optional, List


class AnimeBase(BaseModel):
    """Base anime schema."""
    id: int
    source: str = Field(..., description="Data source: mal, anilist, or jikan")
    title: str
    title_english: Optional[str] = None
    image: Optional[str] = None
    banner: Optional[str] = None
    score: Optional[float] = None
    popularity: Optional[int] = None
    episodes: Optional[int] = None
    status: Optional[str] = None
    genres: List[str] = []
    synopsis: Optional[str] = None
    year: Optional[int] = None
    season: Optional[str] = None
    format: Optional[str] = None


class AnimeDetail(AnimeBase):
    """Detailed anime schema."""
    mal_id: Optional[int] = None
    title_japanese: Optional[str] = None
    score: Optional[float] = None
    members: Optional[int] = None
    rating: Optional[str] = None
    studios: List[dict] = []


class SearchResult(BaseModel):
    """Search result wrapper."""
    data: List[AnimeBase]


class TrendingResult(BaseModel):
    """Trending result wrapper."""
    data: List[AnimeBase]


class GenreItem(BaseModel):
    """Genre item."""
    mal_id: Optional[int] = None
    name: str
    count: Optional[int] = None


class GenresResult(BaseModel):
    """Genres result wrapper."""
    data: List[GenreItem]


class CharacterNode(BaseModel):
    """Character node."""
    id: int
    name: Optional[dict] = None
    image: Optional[dict] = None
    role: Optional[str] = None


class StaffNode(BaseModel):
    """Staff node."""
    id: int
    name: Optional[dict] = None
    image: Optional[dict] = None
    role: Optional[str] = None


class EpisodeNode(BaseModel):
    """Episode node."""
    id: int
    title: Optional[str] = None
    episode_number: Optional[int] = None
    aired_date: Optional[str] = None


class RecommendationNode(BaseModel):
    """Recommendation node."""
    id: int
    title: str
    image: Optional[str] = None
    score: Optional[float] = None


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    env: str
    version: str = "2.0.0"
