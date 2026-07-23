"""
Shared httpx connection pool for all upstream API clients.

Instead of each service creating its own client (or worse, creating a
new client per request in proxy endpoints), we use a bounded pool that
all callers share. This reduces TCP connection churn and reuses keep-alive
connections across services.
"""
import httpx
import logging
from app.core.config import get_settings

logger = logging.getLogger("anibinge.http")

settings = get_settings()

_pool = httpx.Limits(
    max_connections=50,
    max_keepalive_connections=20,
    keepalive_expiry=30,
)

_shared_client: httpx.AsyncClient | None = None


def get_shared_client(**overrides) -> httpx.AsyncClient:
    """
    Return the singleton httpx.AsyncClient.

    All callers share the SAME underlying connection pool.
    Overrides (timeout, headers, etc.) are applied ONLY on the first
    call — subsequent calls silently use the already-created client.

    IMPORTANT: Do NOT pass `base_url` here.  Instead, construct full
    URLs in your service client (e.g. `client.get(f"{BASE}{path}")`).
    This avoids the fragile import-order dependency where one service's
    base_url overwrites another's.
    """
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(
            limits=_pool,
            timeout=overrides.pop("timeout", 15.0),
            headers=overrides.pop("headers", None),
            follow_redirects=overrides.pop("follow_redirects", False),
            **overrides,
        )
        logger.info("Shared httpx client created (max_conn=50, keepalive=20)")
    else:
        if overrides:
            logger.warning(
                "get_shared_client() called with ignored overrides: %s "
                "(client already initialized). Pass full URLs in your service client instead.",
                overrides,
            )
    return _shared_client


async def close_shared_client():
    global _shared_client
    if _shared_client and not _shared_client.is_closed:
        await _shared_client.aclose()
        _shared_client = None
        logger.info("Shared httpx client closed")
