"""
Comprehensive AniList GraphQL client for anime metadata.
Provides full coverage of anime data sources including search, trending, seasonal, schedule, etc.
Uses httpx with retry logic and proper error handling.
"""
import logging
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger("anibinge.anilist_client")

ANILIST_URL = "https://graphql.anilist.co"


class AniListClient:
    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=20,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
    )
    async def _query(self, query: str, variables: dict) -> dict[str, Any]:
        """Execute GraphQL query with retry logic."""
        try:
            response = await self.client.post(
                ANILIST_URL,
                json={
                    "query": query,
                    "variables": variables,
                },
            )
            response.raise_for_status()
            data = response.json()

            if "errors" in data:
                logger.error("AniList GraphQL error: %s", data["errors"])
                raise Exception(f"AniList error: {data['errors']}")

            return data.get("data", {})
        except httpx.HTTPError as e:
            logger.error("AniList HTTP error: %s", e)
            raise

    async def search_anime(
        self,
        search: str,
        page: int = 1,
        per_page: int = 20,
        status: str | None = None,
        type: str | None = None,
        genres: str | None = None,
        order_by: str | None = None,
        sort: str | None = None,
    ) -> dict:
        """Search anime by title with optional filters."""
        # Map frontend status values to AniList status enums
        STATUS_MAP = {"airing": "RELEASING", "complete": "FINISHED", "upcoming": "NOT_YET_RELEASED"}
        TYPE_MAP = {"tv": "TV", "movie": "MOVIE", "ova": "OVA", "ona": "ONA", "special": "SPECIAL"}
        SORT_MAP = {
            "score": "SCORE", "popularity": "POPULARITY",
            "title": "TITLE_ROMAJI", "start_date": "START_DATE",
        }

        status_in = [STATUS_MAP[status]] if status and status in STATUS_MAP else None
        format_in = [TYPE_MAP[type]] if type and type in TYPE_MAP else None
        genre_in = genres.split(",") if genres else None
        sort_by = [SORT_MAP.get(order_by, "POPULARITY")]
        # AniList defaults to ascending; add _DESC for descending (highest/newest first)
        if sort != "asc" and sort_by[0] not in ("TITLE_ROMAJI",):
            sort_by = [sort_by[0] + "_DESC"]

        # Build dynamic filter string and variable declarations
        media_filters = "type:ANIME"
        variables: dict = {"search": search, "page": page, "perPage": per_page}
        var_decls = ["$search:String", "$page:Int", "$perPage:Int"]

        if status_in:
            media_filters += ",status_in:$status_in"
            variables["status_in"] = status_in
            var_decls.append("$status_in:[MediaStatus]")
        if format_in:
            media_filters += ",format_in:$format_in"
            variables["format_in"] = format_in
            var_decls.append("$format_in:[MediaFormat]")
        if genre_in:
            media_filters += ",genre_in:$genre_in"
            variables["genre_in"] = genre_in
            var_decls.append("$genre_in:[String]")

        query = f"""
        query ({','.join(var_decls)}){{
          Page(page:$page,perPage:$perPage){{
            pageInfo{{total currentPage hasNextPage}}
            media(search:$search,{media_filters},sort:{sort_by[0]}){{
              id
              title{{romaji english native}}
              coverImage{{extraLarge large}}
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
            }}
          }}
        }}
        """
        return await self._query(query, variables)

    async def get_trending(
        self,
        page: int = 1,
        per_page: int = 20,
    ) -> dict:
        """Get trending anime."""
        query = """
        query ($page:Int,$perPage:Int){
          Page(page:$page,perPage:$perPage){
            media(
              type:ANIME,
              sort:TRENDING_DESC
            ){
              id
              title{
                romaji
                english
                native
              }
              coverImage{
                extraLarge
                large
              }
              bannerImage
              averageScore
              popularity
              episodes
              status
              seasonYear
              genres
              format
            }
          }
        }
        """
        return await self._query(
            query,
            {
                "page": page,
                "perPage": per_page,
            },
        )

    async def get_popular(self, page: int = 1, per_page: int = 20) -> dict:
        """Get most popular anime."""
        query = """
        query($page:Int,$perPage:Int){
          Page(page:$page,perPage:$perPage){
            media(
              type:ANIME,
              sort:POPULARITY_DESC
            ){
              id
              title{
                romaji
                english
                native
              }
              coverImage{
                extraLarge
                large
              }
              bannerImage
              averageScore
              popularity
              episodes
              status
              seasonYear
              genres
              format
            }
          }
        }
        """
        return await self._query(
            query,
            {
                "page": page,
                "perPage": per_page,
            },
        )

    async def get_top(self, page: int = 1, per_page: int = 20) -> dict:
        """Get top-rated anime."""
        query = """
        query($page:Int,$perPage:Int){
          Page(page:$page,perPage:$perPage){
            media(
              type:ANIME,
              sort:SCORE_DESC
            ){
              id
              title{
                romaji
                english
                native
              }
              coverImage{
                extraLarge
                large
              }
              bannerImage
              averageScore
              popularity
              episodes
              status
              seasonYear
              genres
              format
            }
          }
        }
        """
        return await self._query(
            query,
            {
                "page": page,
                "perPage": per_page,
            },
        )

    async def get_seasonal(
        self, year: int, season: str, page: int = 1, per_page: int = 20
    ) -> dict:
        """Get anime for a specific season (WINTER, SPRING, SUMMER, FALL)."""
        season_upper = season.upper()
        if season_upper not in ["WINTER", "SPRING", "SUMMER", "FALL"]:
            logger.warning("Invalid season: %s", season)
            return {"Page": {"media": []}}

        query = """
        query($season:MediaSeason,$year:Int,$page:Int,$perPage:Int){
          Page(page:$page,perPage:$perPage){
            media(
              season:$season,
              seasonYear:$year,
              type:ANIME
              sort:POPULARITY_DESC
            ){
              id
              title{
                romaji
                english
                native
              }
              coverImage{
                extraLarge
                large
              }
              bannerImage
              averageScore
              popularity
              episodes
              status
              seasonYear
              genres
              format
            }
          }
        }
        """
        return await self._query(
            query,
            {
                "season": season_upper,
                "year": year,
                "page": page,
                "perPage": per_page,
            },
        )

    async def get_schedule(self, page: int = 1, per_page: int = 50) -> dict:
        """Get currently airing anime with nextAiringEpisode timestamps for day-of-week grouping."""
        query = """
        query($page:Int,$perPage:Int){
          Page(page:$page,perPage:$perPage){
            media(
              type:ANIME,
              status:RELEASING,
              sort:POPULARITY_DESC
            ){
              id
              title{
                romaji
                english
                native
              }
              coverImage{
                extraLarge
                large
              }
              bannerImage
              averageScore
              popularity
              episodes
              nextAiringEpisode{
                airingAt
                timeUntilAiring
                episode
              }
              status
              genres
              format
              description
            }
          }
        }
        """
        return await self._query(
            query,
            {
                "page": page,
                "perPage": per_page,
            },
        )

    async def get_anime_detail(self, anime_id: int) -> dict:
        """Get detailed information about a specific anime."""
        query = """
        query($id:Int){
          Media(id:$id,type:ANIME){
            id
            title{
              romaji
              english
              native
            }
            coverImage{
              extraLarge
              large
            }
            bannerImage
            description
            averageScore
            meanScore
            popularity
            episodes
            duration
            status
            startDate{
              year
              month
              day
            }
            endDate{
              year
              month
              day
            }
            season
            seasonYear
            genres
            format
            studios(isMain:true){
              nodes{
                id
                name
              }
            }
          }
        }
        """
        return await self._query(query, {"id": anime_id})

    async def get_recommendations(
        self, anime_id: int, page: int = 1, per_page: int = 10
    ) -> dict:
        """Get recommended anime similar to the given anime."""
        query = """
        query($id:Int,$page:Int,$perPage:Int){
          Media(id:$id,type:ANIME){
            recommendations(page:$page,perPage:$perPage){
              pageInfo{
                total
                currentPage
                hasNextPage
              }
              nodes{
                mediaRecommendation{
                  id
                  title{
                    romaji
                    english
                  }
                  coverImage{
                    extraLarge
                    large
                  }
                  bannerImage
                  averageScore
                  popularity
                  episodes
                  status
                  genres
                }
              }
            }
          }
        }
        """
        return await self._query(
            query, {"id": anime_id, "page": page, "perPage": per_page}
        )

    async def get_character(self, character_id: int) -> dict:
        """Get character information."""
        query = """
        query($id:Int){
          Character(id:$id){
            id
            name{
              first
              last
              full
            }
            image{
              large
              medium
            }
            description
            favourites
            media(page:1,perPage:10){
              edges{
                characterRole
                node{
                  id
                  title{
                    romaji
                  }
                }
              }
            }
          }
        }
        """
        return await self._query(query, {"id": character_id})

    async def get_studio(self, studio_id: int, page: int = 1, per_page: int = 20) -> dict:
        """Get studio information and their anime."""
        query = """
        query($id:Int,$page:Int,$perPage:Int){
          Studio(id:$id){
            id
            name
            isAnimationStudio
            media(page:$page,perPage:$perPage,sort:POPULARITY_DESC){
              pageInfo{
                total
                currentPage
                hasNextPage
              }
              nodes{
                id
                title{
                  romaji
                  english
                }
                coverImage{
                  extraLarge
                  large
                }
                averageScore
                popularity
                episodes
                status
              }
            }
          }
        }
        """
        return await self._query(
            query, {"id": studio_id, "page": page, "perPage": per_page}
        )

    async def get_anime_characters(self, anime_id: int) -> dict:
        """Get characters for a specific anime via AniList Media query."""
        query = """
        query($id:Int){
          Media(id:$id,type:ANIME){
            characters(sort:ROLE,perPage:50){
              edges{
                role
                node{
                  id
                  name{
                    full
                    first
                    last
                  }
                  image{
                    large
                    medium
                  }
                }
              }
            }
          }
        }
        """
        return await self._query(query, {"id": anime_id})

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()


# Singleton instance
anilist_client = AniListClient()


# Module-level convenience functions (matches mal_client/jikan_client pattern)
async def search_anime(query: str, page: int = 1, **kwargs) -> dict:
    return await anilist_client.search_anime(search=query, page=page)

async def get_trending(page: int = 1, **kwargs) -> dict:
    return await anilist_client.get_trending(page=page)

async def get_top(page: int = 1, **kwargs) -> dict:
    return await anilist_client.get_top(page=page)

async def get_seasonal(year: int, season: str, page: int = 1, **kwargs) -> dict:
    return await anilist_client.get_seasonal(year=year, season=season, page=page)

async def get_schedule(page: int = 1, **kwargs) -> dict:
    return await anilist_client.get_schedule(page=page)

async def get_anime_detail(anime_id: int) -> dict:
    return await anilist_client.get_anime_detail(anime_id)

async def get_recommendations(anime_id: int, page: int = 1) -> dict:
    return await anilist_client.get_recommendations(anime_id=anime_id, page=page)

async def get_anime_characters(anime_id: int) -> dict:
    return await anilist_client.get_anime_characters(anime_id)
