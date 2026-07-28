import logging

logger = logging.getLogger("anibinge.wibu_client")


async def search_and_get_stream(q: str, ep: int, server: str = "vidstream") -> dict:
    logger.warning("Wibu client not available (no API configured), returning empty for '%s' ep%d", q, ep)
    return {}


async def health_check() -> bool:
    return False


async def close():
    pass
