"""
AniList GraphQL Client

Async GraphQL client for AniList API with:
- Connection pooling via httpx
- Retry logic with exponential backoff
- Request timeout handling
- Proper exception handling
- Type hints for all responses
"""
import asyncio
import logging
from typing import Any, Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.cache import cached
from app.core.config import get_settings

logger = logging.getLogger("anibinge.anilist_client")
settings = get_settings()

ANILIST_URL = "https://graphql.anilist.co"


class AniListClient:
    """Async AniList GraphQL client with retry and caching support."""

    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=20.0,
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "Anibinge/2.0",
            },
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
    )
    async def _query(
        self, query: str, variables: Optional[dict] = None
    ) -> dict[str, Any]:
        """Execute a GraphQL query with retry logic."""
        try:
            response = await self.client.post(
                ANILIST_URL,
                json={
                    "query": query,
                    "variables": variables or {},
                },
            )
            response.raise_for_status()
        except httpx.HTTPError as e:
            logger.error(f"AniList HTTP error: {e}")
            raise

        data = response.json()

        if "errors" in data:
            errors = data["errors"]
            logger.error(f"AniList GraphQL error: {errors}")
            raise Exception(f"AniList GraphQL error: {errors}")

        return data.get("data", {})

    # ============== SEARCH & DISCOVERY ==============

    @cached("anilist:search", ttl=settings.CACHE_TTL_SHORT)
    async def search_anime(
        self, search: str, page: int = 1, per_page: int = 20
    ) -> dict[str, Any]:
        """Search for anime by title."""
        query = """
        query ($search:String, $page:Int, $perPage:Int) {
          Page(page:$page, perPage:$perPage) {
            pageInfo {
              total
              currentPage
              hasNextPage
              lastPage
            }
            media(search:$search, type:ANIME) {
              id
              title {
                romaji
                english
                native
              }
              coverImage {
                large
                extraLarge
              }
              bannerImage
              description
              averageScore
              popularity
              episodes
              duration
              status
              season
              seasonYear
              genres
              format
            }
          }
        }
        """
        return await self._query(
            query,
            {"search": search, "page": page, "perPage": per_page},
        )

    @cached("anilist:trending", ttl=settings.CACHE_TTL_SHORT)
    async def get_trending(self, page: int = 1, per_page: int = 20) -> dict[str, Any]:
        """Get trending anime."""
        query = """
        query ($page:Int, $perPage:Int) {
          Page(page:$page, perPage:$perPage) {
            pageInfo {
              total
              currentPage
              hasNextPage
              lastPage
            }
            media(type:ANIME, sort:TRENDING_DESC) {
              id
              title {
                romaji
                english
                native
              }
              coverImage {
                large
                extraLarge
              }
              bannerImage
              description
              averageScore
              popularity
              episodes
              duration
              status
              season
              seasonYear
              genres
              format
            }
          }
        }
        """
        return await self._query(query, {"page": page, "perPage": per_page})

    @cached("anilist:popular", ttl=settings.CACHE_TTL_SHORT)
    async def get_popular(self, page: int = 1, per_page: int = 20) -> dict[str, Any]:
        """Get popular anime."""
        query = """
        query ($page:Int, $perPage:Int) {
          Page(page:$page, perPage:$perPage) {
            pageInfo {
              total
              currentPage
              hasNextPage
              lastPage
            }
            media(type:ANIME, sort:POPULARITY_DESC) {
              id
              title {
                romaji
                english
                native
              }
              coverImage {
                large
                extraLarge
              }
              bannerImage
              description
              averageScore
              popularity
              episodes
              duration
              status
              season
              seasonYear
              genres
              format
            }
          }
        }
        """
        return await self._query(query, {"page": page, "perPage": per_page})

    # ============== SEASONAL & SCHEDULE ==============

    @cached("anilist:seasonal", ttl=settings.CACHE_TTL_MEDIUM)
    async def get_seasonal(
        self, season: str, year: int, page: int = 1, per_page: int = 20
    ) -> dict[str, Any]:
        """Get anime by season (WINTER, SPRING, SUMMER, FALL)."""
        query = """
        query ($season:MediaSeason, $year:Int, $page:Int, $perPage:Int) {
          Page(page:$page, perPage:$perPage) {
            pageInfo {
              total
              currentPage
              hasNextPage
              lastPage
            }
            media(type:ANIME, season:$season, seasonYear:$year, sort:POPULARITY_DESC) {
              id
              title {
                romaji
                english
                native
              }
              coverImage {
                large
                extraLarge
              }
              bannerImage
              description
              averageScore
              popularity
              episodes
              duration
              status
              season
              seasonYear
              genres
              format
              airingSchedule(notYetAired: false) {
                edges {
                  node {
                    episode
                    airingAt
                  }
                }
              }
            }
          }
        }
        """
        return await self._query(
            query,
            {
                "season": season.upper(),
                "year": year,
                "page": page,
                "perPage": per_page,
            },
        )

    @cached("anilist:airing_schedule", ttl=settings.CACHE_TTL_SHORT)
    async def get_airing_schedule(
        self, page: int = 1, per_page: int = 50
    ) -> dict[str, Any]:
        """Get currently airing anime with next episode info."""
        query = """
        query ($page:Int, $perPage:Int) {
          Page(page:$page, perPage:$perPage) {
            pageInfo {
              total
              currentPage
              hasNextPage
              lastPage
            }
            airingSchedules(sort:TIME_DESC) {
              id
              episode
              airingAt
              timeUntilAiring
              media {
                id
                title {
                  romaji
                  english
                  native
                }
                coverImage {
                  large
                  extraLarge
                }
                bannerImage
                averageScore
                popularity
                status
                episodes
              }
            }
          }
        }
        """
        return await self._query(query, {"page": page, "perPage": per_page})

    # ============== DETAIL PAGES ==============

    @cached("anilist:anime_detail", ttl=settings.CACHE_TTL_MEDIUM)
    async def get_anime(
        self, anilist_id: int
    ) -> dict[str, Any]:
        """Get detailed anime information."""
        query = """
        query ($id:Int) {
          Media(id:$id, type:ANIME) {
            id
            idMal
            title {
              romaji
              english
              native
            }
            coverImage {
              large
              extraLarge
              color
            }
            bannerImage
            description
            averageScore
            meanScore
            popularity
            favourites
            episodes
            duration
            status
            startDate {
              year
              month
              day
            }
            endDate {
              year
              month
              day
            }
            season
            seasonYear
            format
            genres
            tags {
              id
              name
              description
              rank
              isAdult
            }
            studios(isMain: true) {
              nodes {
                id
                name
                siteUrl
              }
            }
            source
            hashtag
            externalLinks {
              id
              url
              site
              icon
              color
              label
            }
            streamingEpisodes {
              site
              title
              thumbnail
              url
            }
            nextAiringEpisode {
              id
              episode
              airingAt
              timeUntilAiring
            }
            relations {
              edges {
                node {
                  id
                  title {
                    romaji
                    english
                  }
                  coverImage {
                    large
                  }
                }
                relationType
              }
            }
            recommendations(sort: RATING_DESC) {
              edges {
                node {
                  mediaRecommendation {
                    id
                    title {
                      romaji
                      english
                    }
                    coverImage {
                      large
                    }
                  }
                  rating
                }
              }
            }
          }
        }
        """
        return await self._query(query, {"id": anilist_id})

    # ============== CHARACTERS & STAFF ==============

    @cached("anilist:characters", ttl=settings.CACHE_TTL_LONG)
    async def get_characters(
        self, anilist_id: int
    ) -> dict[str, Any]:
        """Get anime characters with voice actors."""
        query = """
        query ($id:Int) {
          Media(id:$id, type:ANIME) {
            id
            characters(sort: ROLE) {
              edges {
                node {
                  id
                  name {
                    first
                    last
                    full
                    native
                  }
                  image {
                    large
                  }
                  description
                }
                role
                voiceActors(language: JAPANESE) {
                  id
                  name {
                    first
                    last
                    full
                    native
                  }
                  image {
                    large
                  }
                  language
                }
              }
            }
          }
        }
        """
        return await self._query(query, {"id": anilist_id})

    @cached("anilist:staff", ttl=settings.CACHE_TTL_LONG)
    async def get_staff(
        self, anilist_id: int
    ) -> dict[str, Any]:
        """Get anime staff (directors, writers, etc)."""
        query = """
        query ($id:Int) {
          Media(id:$id, type:ANIME) {
            id
            staff(sort: ROLE) {
              edges {
                node {
                  id
                  name {
                    first
                    last
                    full
                    native
                  }
                  image {
                    large
                  }
                  description
                }
                role
              }
            }
          }
        }
        """
        return await self._query(query, {"id": anilist_id})

    # ============== RECOMMENDATIONS & RELATIONS ==============

    @cached("anilist:recommendations", ttl=settings.CACHE_TTL_MEDIUM)
    async def get_recommendations(
        self, anilist_id: int
    ) -> dict[str, Any]:
        """Get anime recommendations."""
        query = """
        query ($id:Int) {
          Media(id:$id, type:ANIME) {
            id
            recommendations(sort: RATING_DESC) {
              edges {
                node {
                  id
                  rating
                  mediaRecommendation {
                    id
                    title {
                      romaji
                      english
                      native
                    }
                    coverImage {
                      large
                    }
                    format
                    status
                    episodes
                    averageScore
                  }
                }
              }
            }
          }
        }
        """
        return await self._query(query, {"id": anilist_id})

    # ============== GENRES & TAGS ==============

    @cached("anilist:genres", ttl=settings.CACHE_TTL_LONG)
    async def get_genres(self) -> dict[str, Any]:
        """Get all available genres."""
        query = """
        query {
          GenreCollection
        }
        """
        return await self._query(query)

    # ============== CLEANUP ==============

    async def close(self) -> None:
        """Close the HTTP client connection."""
        await self.client.aclose()


# Global client instance
anilist_client = AniListClient()
