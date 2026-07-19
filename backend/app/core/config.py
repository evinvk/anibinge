"""
Central app configuration, loaded from environment variables (.env).
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "Anibinge API"
    ENV: str = "development"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://anibinge:anibinge@localhost:5432/anibinge"

    # Redis cache
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL_SHORT: int = 60 * 5          # 5 min  – schedule / airing-today
    CACHE_TTL_MEDIUM: int = 60 * 60        # 1 hr   – anime details, seasonal
    CACHE_TTL_LONG: int = 60 * 60 * 24     # 24 hr  – genres, studios, static lists

    # Auth
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # Upstream anime data providers
    JIKAN_BASE_URL: str = "https://api.jikan.moe/v4"
    ANILIST_BASE_URL: str = "https://graphql.anilist.co"
    TMDB_API_KEY: str = ""
    TMDB_BASE_URL: str = "https://api.themoviedb.org/3"
    YOUTUBE_API_KEY: str = ""

    # Rate limiting (per IP)
    RATE_LIMIT_PER_MINUTE: int = 60

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "https://anibinge.app"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
