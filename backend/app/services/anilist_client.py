"""
AniList GraphQL client — FALLBACK data source, used automatically when
Jikan is unavailable or rate-limited (see services/aggregator.py).
"""
import httpx

from app.core.cache import cached
from app.core.config import get_settings

settings = get_settings()

_client = httpx.AsyncClient(base_url="", timeout=10.0)

_SEARCH_QUERY = """
query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage hasNextPage }
    media(search: $search, type: ANIME) {
      id
      title { romaji english native }
      coverImage { large color }
      bannerImage
      averageScore
      popularity
      status
      season
      seasonYear
      genres
      episodes
      format
    }
  }
}
"""

_TRENDING_QUERY = """
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(sort: TRENDING_DESC, type: ANIME) {
      id
      title { romaji english }
      coverImage { large }
      bannerImage
      averageScore
      genres
      episodes
      status
    }
  }
}
"""


async def _post(query: str, variables: dict) -> dict:
    resp = await _client.post(
        settings.ANILIST_BASE_URL, json={"query": query, "variables": variables}
    )
    resp.raise_for_status()
    return resp.json()["data"]


@cached("anilist:trending", ttl=settings.CACHE_TTL_MEDIUM)
async def get_trending(page: int = 1, per_page: int = 20) -> dict:
    return await _post(_TRENDING_QUERY, {"page": page, "perPage": per_page})


@cached("anilist:search", ttl=settings.CACHE_TTL_SHORT)
async def search_anime(query: str, page: int = 1, per_page: int = 20) -> dict:
    return await _post(_SEARCH_QUERY, {"search": query, "page": page, "perPage": per_page})
