"""
Redis-backed cache layer.

Every upstream call (Jikan / AniList / TMDB) is wrapped with `cached()`
so repeated requests are served from Redis instead of hammering the
public APIs (which are rate-limited). This is the backbone of the
"<1s when cached" performance requirement.
"""
import hashlib
import json
import logging
from functools import wraps
from typing import Any, Callable

import redis.asyncio as redis

from app.core.config import get_settings
from app.core.dedup import dedup

logger = logging.getLogger("anibinge.cache")

settings = get_settings()
_redis: redis.Redis | None = None

_pool = redis.ConnectionPool.from_url(
    settings.REDIS_URL,
    encoding="utf-8",
    decode_responses=True,
    max_connections=20,
    socket_connect_timeout=2,
    socket_timeout=2,
)
_redis = redis.Redis(connection_pool=_pool)

# Once a Redis connection failure has been observed, stop retrying it on
# every single request (each attempt costs a connection-timeout's worth of
# latency). We retry again after a short cooldown in case Redis recovers.
_redis_unavailable_until: float = 0.0
_REDIS_RETRY_COOLDOWN_SECONDS = 30.0


async def get_redis() -> redis.Redis:
    return _redis


def _make_key(prefix: str, args: tuple, kwargs: dict) -> str:
    raw = f"{prefix}:{args}:{sorted(kwargs.items())}"
    digest = hashlib.sha256(raw.encode()).hexdigest()[:24]
    return f"anibinge:{prefix}:{digest}"


def cached(prefix: str, ttl: int):
    """
    Decorator: cache an async function's JSON-serializable return value.

    Redis is a *performance* layer, not a dependency the app should be down
    without. If Redis is unreachable or misconfigured (e.g. REDIS_URL isn't
    set in production and there's no Redis instance to talk to), every
    decorated function transparently falls back to calling the underlying
    function directly instead of raising — so anime data still loads, it's
    just not cached until Redis comes back.
    """

    def decorator(fn: Callable):
        @wraps(fn)
        async def wrapper(*args, **kwargs) -> Any:
            import time

            global _redis_unavailable_until

            key = _make_key(prefix, args, kwargs)
            skip_redis = time.monotonic() < _redis_unavailable_until

            if not skip_redis:
                try:
                    r = await get_redis()
                    existing = await r.get(key)
                    if existing is not None:
                        return json.loads(existing)
                except Exception as e:
                    logger.warning(
                        "Redis unavailable (%s); serving '%s' uncached for %.0fs",
                        e, prefix, _REDIS_RETRY_COOLDOWN_SECONDS,
                    )
                    _redis_unavailable_until = time.monotonic() + _REDIS_RETRY_COOLDOWN_SECONDS

            # Always call the real function on a cache miss / cache failure.
            result = await dedup(key, fn, *args, **kwargs)

            if time.monotonic() >= _redis_unavailable_until:
                try:
                    r = await get_redis()
                    await r.set(key, json.dumps(result), ex=ttl)
                except (TypeError, ValueError):
                    pass  # non-serializable result: skip caching silently
                except Exception as e:
                    logger.warning("Redis set failed for '%s': %s", prefix, e)
                    _redis_unavailable_until = time.monotonic() + _REDIS_RETRY_COOLDOWN_SECONDS

            return result

        return wrapper

    return decorator


async def invalidate_prefix(prefix: str) -> int:
    """Used by the admin cache-management endpoint."""
    r = await get_redis()
    deleted = 0
    batch = []
    async for key in r.scan_iter(match=f"anibinge:{prefix}:*"):
        batch.append(key)
        if len(batch) >= 100:
            await r.delete(*batch)
            deleted += len(batch)
            batch = []
    if batch:
        await r.delete(*batch)
        deleted += len(batch)
    return deleted
