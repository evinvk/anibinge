import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import get_settings
from app.routers import admin, anime, auth, news, schedule, search, seasonal, streaming, watchlist

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
    description="Aggregated anime data API — MAL (primary) + AniList (secondary) + Jikan (fallback) for metadata, Wibu API for streaming, AnimePahe for search & HLS streaming.",
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


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "env": settings.ENV, "version": "2.0.0"}


@app.get("/")
async def root():
    """API root endpoint."""
    return {
        "name": settings.APP_NAME,
        "version": "2.0.0",
        "docs": "/api/docs",
        "status": "running"
    }
