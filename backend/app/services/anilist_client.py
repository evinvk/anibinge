import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

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
    async def _query(self, query: str, variables: dict):

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
            raise Exception(data["errors"])

        return data["data"]

    async def search_anime(
        self,
        search: str,
        page: int = 1,
        per_page: int = 20,
    ):

        query = """
        query ($search:String,$page:Int,$perPage:Int){

          Page(page:$page,perPage:$perPage){

            pageInfo{
              total
              currentPage
              hasNextPage
            }

            media(
              search:$search,
              type:ANIME
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
            {
                "search": search,
                "page": page,
                "perPage": per_page,
            },
        )

    async def get_trending(
        self,
        page=1,
        per_page=20,
    ):

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
            }

            coverImage{
              extraLarge
            }

            bannerImage

            averageScore

            genres

            episodes

            status

            seasonYear

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

    async def get_popular(self, page=1, per_page=20):

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
            }

            coverImage{
                extraLarge
            }

            bannerImage

            averageScore

            popularity

            genres

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

    async def close(self):
        await self.client.aclose()


anilist_client = AniListClient()
