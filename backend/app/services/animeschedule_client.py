"""
AnimeSchedule.net API v3 client.
Fetches upcoming anime via the timetable endpoint with airing-statuses=upcoming filter.
Requires an Application Token from animeschedule.net account settings.
"""
import logging
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings

logger = logging.getLogger("anibinge.animeschedule_client")
settings = get_settings()

BASE_URL = "https://animeschedule.net/api/v3"


class AnimeScheduleClient:
    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=20,
            headers={
                "Authorization": f"Bearer {settings.ANIMESCHEDULE_API_TOKEN}",
                "Accept": "application/json",
            },
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
    )
    async def get_upcoming(self, page: int = 1, per_page: int = 25) -> dict[str, Any]:
        """Fetch upcoming anime from the timetable endpoint."""
        try:
            response = await self.client.get(
                f"{BASE_URL}/timetables/all",
                params={
                    "airing-statuses": "upcoming",
                    "page": page,
                    "perPage": per_page,
                },
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            logger.error("AnimeSchedule HTTP error: %s", e)
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
    )
    async def get_timetable(self, air_type: str = "all") -> dict[str, Any]:
        """Fetch the full timetable (ongoing anime with broadcast days)."""
        try:
            response = await self.client.get(f"{BASE_URL}/timetables/{air_type}")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            logger.error("AnimeSchedule timetable HTTP error: %s", e)
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
    )
    async def get_anime(self, route: str) -> dict[str, Any]:
        """Fetch a specific anime by its URL slug."""
        try:
            response = await self.client.get(f"{BASE_URL}/anime/{route}")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            logger.error("AnimeSchedule HTTP error for %s: %s", route, e)
            raise

    async def close(self):
        await self.client.aclose()


animeschedule = AnimeScheduleClient()
