"""
Wibu API Client for streaming episode data

Async client for Wibu API with:
- Episode list retrieval
- Stream source handling
- Subtitle support
- Multiple server support
- Retry logic and timeout handling
"""
import logging
from typing import Any, Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.cache import cached
from app.core.config import get_settings

logger = logging.getLogger("anibinge.wibu_client")
settings = get_settings()

WIBU_BASE_URL = "https://api.wibu.live/v2"  # Example endpoint - adjust as needed


class WibuClient:
    """Async Wibu API client for streaming data."""

    def __init__(self):
        self.client = httpx.AsyncClient(
            base_url=WIBU_BASE_URL,
            timeout=15.0,
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
            headers={
                "User-Agent": "Anibinge/2.0",
            },
        )

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=5),
    )
    async def _get(
        self, path: str, params: Optional[dict] = None
    ) -> dict[str, Any]:
        """Generic GET request with retry logic."""
        try:
            response = await self.client.get(path, params=params or {})
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Wibu API error on {path}: {e}")
            raise

    @cached("wibu:episodes", ttl=settings.CACHE_TTL_SHORT)
    async def get_episodes(
        self, anime_id: str, page: int = 1, per_page: int = 50
    ) -> dict[str, Any]:
        """
        Get episode list for an anime.
        
        Args:
            anime_id: Anime identifier (typically AniList ID or title slug)
            page: Pagination page
            per_page: Episodes per page
            
        Returns:
            Dictionary containing episodes with streaming sources
        """
        try:
            data = await self._get(
                f"/anime/{anime_id}/episodes",
                {"page": page, "per_page": per_page},
            )
            return data
        except httpx.HTTPError:
            logger.warning(f"Failed to fetch episodes for {anime_id} from Wibu")
            return {"episodes": [], "total": 0}

    @cached("wibu:episode_detail", ttl=settings.CACHE_TTL_SHORT)
    async def get_episode_sources(
        self, anime_id: str, episode_number: int
    ) -> dict[str, Any]:
        """
        Get all available streaming sources for a specific episode.
        
        Args:
            anime_id: Anime identifier
            episode_number: Episode number to fetch
            
        Returns:
            Dictionary containing available sources, servers, and subtitles
        """
        try:
            data = await self._get(
                f"/anime/{anime_id}/episode/{episode_number}/sources"
            )
            return data
        except httpx.HTTPError:
            logger.warning(
                f"Failed to fetch sources for {anime_id} episode {episode_number}"
            )
            return {"sources": []}

    @cached("wibu:streaming_links", ttl=settings.CACHE_TTL_SHORT)
    async def get_streaming_link(
        self, anime_id: str, episode_number: int, source_id: str, server: str
    ) -> dict[str, Any]:
        """
        Get direct streaming link for a specific episode/source/server.
        
        Args:
            anime_id: Anime identifier
            episode_number: Episode number
            source_id: Source identifier (e.g., 'gogoanime', 'zoro')
            server: Server/host identifier (e.g., 'vidstream', 'mp4upload')
            
        Returns:
            Dictionary containing streaming URL and metadata
        """
        try:
            data = await self._get(
                f"/anime/{anime_id}/episode/{episode_number}/sources/{source_id}/servers/{server}/link"
            )
            return data
        except httpx.HTTPError:
            logger.warning(
                f"Failed to fetch streaming link for {anime_id} ep {episode_number}"
            )
            return {"url": None, "error": "Failed to retrieve streaming link"}

    @cached("wibu:subtitles", ttl=settings.CACHE_TTL_SHORT)
    async def get_subtitles(
        self, anime_id: str, episode_number: int
    ) -> dict[str, Any]:
        """
        Get available subtitles for an episode.
        
        Args:
            anime_id: Anime identifier
            episode_number: Episode number
            
        Returns:
            Dictionary containing available subtitle tracks and URLs
        """
        try:
            data = await self._get(
                f"/anime/{anime_id}/episode/{episode_number}/subtitles"
            )
            return data
        except httpx.HTTPError:
            logger.warning(f"Failed to fetch subtitles for {anime_id} ep {episode_number}")
            return {"subtitles": []}

    @cached("wibu:search", ttl=settings.CACHE_TTL_SHORT)
    async def search_anime(
        self, query: str, page: int = 1, per_page: int = 20
    ) -> dict[str, Any]:
        """
        Search for anime on Wibu.
        
        Args:
            query: Search query
            page: Pagination page
            per_page: Results per page
            
        Returns:
            Dictionary containing search results
        """
        try:
            data = await self._get(
                "/search", {"q": query, "page": page, "per_page": per_page}
            )
            return data
        except httpx.HTTPError:
            logger.warning(f"Wibu search failed for query: {query}")
            return {"results": [], "total": 0}

    async def close(self) -> None:
        """Close the HTTP client connection."""
        await self.client.aclose()


# Global client instance
wibu_client = WibuClient()
