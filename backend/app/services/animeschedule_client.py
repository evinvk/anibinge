"""
AnimeSchedule.net API v3 client.
Uses the /anime endpoint with airing-statuses filter for schedule and upcoming data.
Requires an Application Token from animeschedule.net account settings.
"""
import logging
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_not_exception_type

from app.core.config import get_settings
from app.core.http import get_shared_client

logger = logging.getLogger("anibinge.animeschedule_client")
settings = get_settings()

BASE_URL = "https://animeschedule.net/api/v3"


class AnimeScheduleClient:
    def __init__(self):
        self.client = get_shared_client(
            timeout=20,
            headers={
                "Authorization": f"Bearer {settings.ANIMESCHEDULE_API_TOKEN}",
                "Accept": "application/json",
            },
        )

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_not_exception_type(httpx.HTTPStatusError),
    )
    async def get_anime_list(
        self,
        airing_statuses: str = "ongoing",
        page: int = 1,
        per_page: int = 25,
    ) -> list[dict[str, Any]]:
        """Fetch anime list filtered by airing status."""
        try:
            response = await self.client.get(
                f"{BASE_URL}/anime",
                params={
                    "airing-statuses": airing_statuses,
                    "page": page,
                    "perPage": per_page,
                },
            )
            response.raise_for_status()
            data = response.json()
            if isinstance(data, list):
                return data
            return data.get("anime", data.get("data", []))
        except httpx.HTTPStatusError as e:
            logger.error("AnimeSchedule HTTP error: %s", e)
            raise

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_not_exception_type(httpx.HTTPStatusError),
    )
    async def get_anime(self, route: str) -> dict[str, Any]:
        """Fetch a specific anime by its URL slug."""
        try:
            response = await self.client.get(f"{BASE_URL}/anime/{route}")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error("AnimeSchedule HTTP error for %s: %s", route, e)
            raise

    async def close(self):
        await self.client.aclose()


animeschedule = AnimeScheduleClient()
