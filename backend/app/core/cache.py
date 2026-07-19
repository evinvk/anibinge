"""
Redis-backed cache layer.

Every upstream call (Jikan / AniList / TMDB) is wrapped with `cached()`
so repeated requests are served from Redis instead of hammering the
public APIs (which are rate-limited). This is the backbone of the
"<1s when cached" performance requirement.
"""
import hashlib
import json
from functools import wraps
from typing import Any, Callable

import redis.asyncio as redis

from app.core.config import get_settings

settings = get_settings()
_redis: redis.Redis | None = None


async def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
    return _redis


def _make_key(prefix: str, args: tuple, kwargs: dict) -> str:
    raw = f"{prefix}:{args}:{sorted(kwargs.items())}"
    digest = hashlib.sha256(raw.encode()).hexdigest()[:24]
    return f"anibinge:{prefix}:{digest}"


def cached(prefix: str, ttl: int):
    """Decorator: cache an async function's JSON-serializable return value."""

    def decorator(fn: Callable):
        @wraps(fn)
        async def wrapper(*args, **kwargs) -> Any:
            r = await get_redis()
            key = _make_key(prefix, args, kwargs)
            existing = await r.get(key)
            if existing is not None:
                return json.loads(existing)

            result = await fn(*args, **kwargs)
            try:
                await r.set(key, json.dumps(result), ex=ttl)
            except (TypeError, ValueError):
                pass  # non-serializable result: skip caching silently
            return result

        return wrapper

    return decorator


async def invalidate_prefix(prefix: str) -> int:
    """Used by the admin cache-management endpoint."""
    r = await get_redis()
    deleted = 0
    async for key in r.scan_iter(match=f"anibinge:{prefix}:*"):
        await r.delete(key)
        deleted += 1
    return deleted
