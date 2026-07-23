"""
Request deduplication layer.

When N concurrent requests for the same cache key arrive simultaneously
and the cache is cold, without deduplication all N fire identical upstream
API calls. This module ensures only one upstream call is made and all
waiters share the result.

Integrated into the ``cached()`` decorator in cache.py.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger("anibinge.dedup")

_inflight: dict[str, asyncio.Future] = {}


async def dedup(key: str, fn, *args, **kwargs) -> Any:
    """
    Call *fn* with deduplication on *key*.

    If a call for *key* is already in-flight, the caller awaits the
    same Future instead of making a duplicate upstream request. The
    first caller creates and resolves the Future; all others share it.
    """
    if key in _inflight:
        logger.debug("dedup: sharing in-flight call for %s", key)
        return await _inflight[key]

    loop = asyncio.get_event_loop()
    fut: asyncio.Future = loop.create_future()
    _inflight[key] = fut

    try:
        result = await fn(*args, **kwargs)
        fut.set_result(result)
        return result
    except Exception as exc:
        fut.set_exception(exc)
        raise
    finally:
        _inflight.pop(key, None)
