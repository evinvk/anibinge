"""
Central app configuration, loaded from environment variables (.env).
"""
from functools import lru_cache
from pydantic import validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "Anibinge API"
    ENV: str = "development"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://anibinge:anibinge@localhost:5432/anibinge"

    @validator("DATABASE_URL", pre=True)
    def _ensure_asyncpg(cls, v: str) -> str:
        # Render provides postgresql:// — we need postgresql+asyncpg://
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

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
    # MyAnimeList API (primary) - requires OAuth credentials
    MAL_CLIENT_ID: str = ""
    MAL_CLIENT_SECRET: str = ""
    MAL_BASE_URL: str = "https://api.myanimelist.net/v2"
    
    # Jikan API (fallback) - public, no key required
    JIKAN_BASE_URL: str = "https://api.jikan.moe/v4"
    
    # AniList GraphQL (fallback)
    ANILIST_BASE_URL: str = "https://graphql.anilist.co"
    
    # GogoAnime (streaming + search fallback)
    GOGOANIME_BASE_URL: str = "https://gogoanimehd.to"

    # Anivexa API (fallback streaming when GogoAnime CDN is down)
    ANIVEXA_BASE_URL: str = "https://anivexa-api-eight.vercel.app"

    # AnimeSchedule (upcoming anime primary source)
    ANIMESCHEDULE_API_TOKEN: str = ""

    # Admin bootstrap — promote this email to admin on startup
    ADMIN_EMAIL: str = ""

    # Optional data sources
    TMDB_API_KEY: str = ""
    TMDB_BASE_URL: str = "https://api.themoviedb.org/3"
    YOUTUBE_API_KEY: str = ""

    # Rate limiting (per IP)
    RATE_LIMIT_PER_MINUTE: int = 60

    # CORS - Allow your frontend domains
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:8000",
        "https://anibinge-nine.vercel.app",
        "https://anibinge.app",
        "https://www.anibinge.fun",
        "https://anibinge.fun",
    ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
