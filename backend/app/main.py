import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import get_settings
from app.routers import admin, anime, auth, news, notifications, schedule, search, seasonal, streaming, watchlist

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("anibinge")

settings = get_settings()
limiter = Limiter(key_func=get_remote_address, default_limits=[f"{settings.RATE_LIMIT_PER_MINUTE}/minute"])

app = FastAPI(
    title=settings.APP_NAME,
    version="2.0.0",
    description="Aggregated anime data API — MAL (primary) + AniList (secondary) + Jikan (fallback) for metadata, Wibu API for streaming, GogoAnime for search & iframe streaming.",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all HTTP requests with timing and status."""
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s -> %s (%.1fms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms
    )
    response.headers["X-Process-Time-Ms"] = f"{duration_ms:.1f}"
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Handle unhandled exceptions gracefully."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """Handle validation errors."""
    logger.warning("Validation error on %s: %s", request.url.path, str(exc))
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc)}
    )


# Include all routers
app.include_router(anime.router)
app.include_router(seasonal.router)
app.include_router(schedule.router)
app.include_router(search.router)
app.include_router(auth.router)
app.include_router(watchlist.router)
app.include_router(news.router)
app.include_router(streaming.router)
app.include_router(admin.router)
app.include_router(notifications.router)


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "env": settings.ENV,
        "version": "2.0.0",
    }


@app.get("/")
async def root():
    """API root endpoint."""
    return {
        "name": settings.APP_NAME,
        "version": "2.0.0",
        "docs": "/api/docs",
        "status": "running"
    }


@app.on_event("startup")
async def startup_event():
    from app.core.db import engine
    from app.models.models import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ensured")

    # Invalidate stale cache on startup
    from app.core.cache import invalidate_prefix
    for prefix in ["agg:upcoming", "agg:trending", "agg:airing", "agg:seasonal", "agg:schedule"]:
        try:
            n = await invalidate_prefix(prefix)
            if n:
                logger.info("Invalidated %d cache keys for %s", n, prefix)
        except Exception:
            pass

    # Promote ADMIN_EMAIL env var user to admin (one-time bootstrap)
    admin_email = settings.ADMIN_EMAIL
    if admin_email:
        from sqlalchemy import update as sa_update
        from app.models.models import User
        from app.core.db import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                sa_update(User).where(User.email == admin_email, User.is_admin == False).values(is_admin=True)
            )
            await session.commit()
            if result.rowcount:
                logger.info("Promoted %s to admin", admin_email)

    # Pre-load GogoAnime catalog in background (non-blocking)
    from app.services import gogoanime_client
    import asyncio
    asyncio.create_task(gogoanime_client._load_catalog())

    # Start background content checker for push notifications
    asyncio.create_task(_content_checker_loop())


@app.on_event("shutdown")
async def shutdown_event():
    from app.services import gogoanime_client, animeschedule_client, anivexa_client
    await gogoanime_client.close()
    logger.info("GogoAnime client closed")
    await anivexa_client.close()
    logger.info("Anivexa client closed")
    await animeschedule_client.animeschedule.close()
    logger.info("AnimeSchedule client closed")


# ---------- Background push notification checker ----------

import asyncio
from datetime import datetime

_last_episode_check = None
_last_news_check = None


async def _content_checker_loop():
    """Periodically check for new episodes and news, send push notifications."""
    global _last_episode_check, _last_news_check
    await asyncio.sleep(30)  # wait for startup to complete

    if not settings.VAPID_PRIVATE_KEY:
        logger.info("Push notifications disabled (no VAPID keys)")
        return

    # Initialize last check timestamps
    _last_episode_check = datetime.utcnow()
    _last_news_check = datetime.utcnow()

    CHECK_INTERVAL = 15 * 60  # 15 minutes

    while True:
        try:
            await _check_new_episodes()
            await _check_new_news()
        except Exception:
            logger.exception("Content checker error")
        await asyncio.sleep(CHECK_INTERVAL)


async def _check_new_episodes():
    """Check GogoAnime for new episodes and push notify."""
    global _last_episode_check
    try:
        from app.services import gogoanime_client
        from app.routers.notifications import send_push_to_all

        catalog = gogoanime_client.get_catalog()
        if not catalog:
            return

        # Sort by latest episode, take top 5
        ongoing = [item for item in catalog if item.get("status") == "Ongoing"]
        ongoing.sort(key=lambda x: x.get("latest_episode", 0) or 0, reverse=True)
        top_items = ongoing[:5] if ongoing else catalog[:5]

        if _last_episode_check:
            # On subsequent runs, only notify if there are new episodes
            for item in top_items:
                slug = item.get("slug", "")
                title = item.get("title", item.get("title_english", "New Episode"))
                ep_num = item.get("latest_episode", "?")
                body = f"Episode {ep_num} is now available!"
                url = f"/anime/gogoanime/{slug}"
                await send_push_to_all(title=title, body=body, url=url)
        # else: first run, don't spam notifications

        _last_episode_check = datetime.utcnow()
    except Exception:
        logger.debug("Episode check failed (non-critical)")


async def _check_new_news():
    """Check ANN RSS for new articles and push notify."""
    global _last_news_check
    try:
        from app.services import ann_client
        from app.routers.notifications import send_push_to_all

        articles_result = await ann_client.get_anime_news(page=1, limit=5)
        articles = articles_result.get("data", []) if isinstance(articles_result, dict) else []
        if not articles:
            return

        if _last_news_check:
            new_articles = [
                a for a in articles
                if a.get("published_at") and datetime.fromisoformat(a["published_at"].replace("Z", "+00:00")).replace(tzinfo=None) > _last_news_check
            ]
        else:
            new_articles = []

        if new_articles:
            for article in new_articles[:3]:
                title = article.get("title", "Anime News")
                url = article.get("url", "/news")
                await send_push_to_all(
                    title="Anibinge News",
                    body=title,
                    url=url,
                )

        _last_news_check = datetime.utcnow()
    except Exception:
        logger.debug("News check failed (non-critical)")
