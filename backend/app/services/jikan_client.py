"""
Client for the Jikan API (unofficial-but-public REST wrapper around
MyAnimeList). This is our PRIMARY data source.

Jikan enforces ~3 req/sec & 60 req/min public rate limits, so every
public method here is wrapped in the Redis `cached()` decorator and
requests share a single httpx.AsyncClient with sane timeouts + retry.
A sliding-window rate limiter ensures we stay within limits even on
cache misses.
"""
import asyncio
import time
from typing import Any

import httpx

from app.core.cache import cached
from app.core.config import get_settings
from app.core.circuit_breaker import CircuitBreaker, get_breaker
from app.core.http import get_shared_client

settings = get_settings()

_client = get_shared_client(timeout=10.0)
_JIKAN_BASE = settings.JIKAN_BASE_URL
_breaker = CircuitBreaker("jikan", failure_threshold=5, recovery_timeout=30)


class _RateLimiter:
    """Sliding-window rate limiter: 3 req/sec, 60 req/min."""

    def __init__(self, per_sec: int = 3, per_min: int = 60):
        self.per_sec = per_sec
        self.per_min = per_min
        self._sec_timestamps: list[float] = []
        self._min_timestamps: list[float] = []
        self._lock = asyncio.Lock()

    async def acquire(self):
        async with self._lock:
            now = time.monotonic()
            # Purge old timestamps
            self._sec_timestamps = [t for t in self._sec_timestamps if now - t < 1.0]
            self._min_timestamps = [t for t in self._min_timestamps if now - t < 60.0]

            # Check per-second limit
            if len(self._sec_timestamps) >= self.per_sec:
                wait = 1.0 - (now - self._sec_timestamps[0])
                if wait > 0:
                    await asyncio.sleep(wait)
                    now = time.monotonic()
                    self._sec_timestamps = [t for t in self._sec_timestamps if now - t < 1.0]

            # Check per-minute limit
            if len(self._min_timestamps) >= self.per_min:
                wait = 60.0 - (now - self._min_timestamps[0])
                if wait > 0:
                    await asyncio.sleep(wait)
                    now = time.monotonic()
                    self._min_timestamps = [t for t in self._min_timestamps if now - t < 60.0]

            self._sec_timestamps.append(time.monotonic())
            self._min_timestamps.append(time.monotonic())


_limiter = _RateLimiter()


async def _get(path: str, params: dict | None = None, retries: int = 3) -> dict[str, Any]:
    async with _breaker():
        for attempt in range(retries + 1):
            await _limiter.acquire()
            try:
                resp = await _client.get(f"{_JIKAN_BASE}{path}", params=params or {})
                if resp.status_code in (429, 503, 504) and attempt < retries:
                    await asyncio.sleep(2.0 * (attempt + 1))
                    continue
                resp.raise_for_status()
                return resp.json()
            except httpx.TimeoutException:
                if attempt < retries:
                    await asyncio.sleep(2.0 * (attempt + 1))
                    continue
                raise
    return {}


@cached("jikan:top", ttl=settings.CACHE_TTL_MEDIUM)
async def get_top_anime(page: int = 1, filter_type: str = "airing") -> dict:
    """filter_type: airing | upcoming | bypopularity | favorite"""
    return await _get("/top/anime", {"page": page, "filter": filter_type})


@cached("jikan:seasonal", ttl=settings.CACHE_TTL_MEDIUM)
async def get_seasonal_anime(year: int, season: str, page: int = 1) -> dict:
    return await _get(f"/seasons/{year}/{season}", {"page": page})


@cached("jikan:season_now", ttl=settings.CACHE_TTL_SHORT)
async def get_current_season(page: int = 1) -> dict:
    return await _get("/seasons/now", {"page": page})


@cached("jikan:schedule", ttl=settings.CACHE_TTL_SHORT)
async def get_schedule(day: str | None = None) -> dict:
    """day: monday..sunday, or None for all schedules"""
    return await _get("/schedules", {"filter": day} if day else {})


@cached("jikan:schedule_all", ttl=settings.CACHE_TTL_SHORT)
async def get_all_schedules() -> dict:
    """Fetch the full weekly schedule (all days) in a single request."""
    return await _get("/schedules")


@cached("jikan:detail", ttl=settings.CACHE_TTL_MEDIUM)
async def get_anime_full(mal_id: int) -> dict:
    return await _get(f"/anime/{mal_id}/full")


@cached("jikan:characters:v2", ttl=settings.CACHE_TTL_LONG)
async def get_anime_characters(mal_id: int) -> dict:
    return await _get(f"/anime/{mal_id}/characters")


@cached("jikan:staff", ttl=settings.CACHE_TTL_LONG)
async def get_anime_staff(mal_id: int) -> dict:
    return await _get(f"/anime/{mal_id}/staff")


@cached("jikan:recommendations", ttl=settings.CACHE_TTL_LONG)
async def get_anime_recommendations(mal_id: int) -> dict:
    return await _get(f"/anime/{mal_id}/recommendations")


@cached("jikan:episodes", ttl=settings.CACHE_TTL_MEDIUM)
async def get_anime_episodes(mal_id: int, page: int = 1) -> dict:
    return await _get(f"/anime/{mal_id}/episodes", {"page": page})


@cached("jikan:search", ttl=settings.CACHE_TTL_SHORT)
async def search_anime(query: str, page: int = 1, **filters) -> dict:
    """filters may include: genres, status, type, rating, order_by, sort, min_score, start_date, end_date"""
    params = {"q": query, "page": page, **{k: v for k, v in filters.items() if v is not None}}
    return await _get("/anime", params)


@cached("jikan:genres", ttl=settings.CACHE_TTL_LONG)
async def get_genres() -> dict:
    return await _get("/genres/anime")
