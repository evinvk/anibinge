"""
Push notification subscription management.
Requires VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY env vars.
Generate keys at: https://giga.tools/developer-tools/vapid-key-generator
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import get_current_user_id
from app.models.models import PushSubscription, User

logger = logging.getLogger("anibinge.notifications")
settings = get_settings()
router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


class SubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


def _check_vapid():
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(
            status_code=503,
            detail="Push notifications not configured. Missing VAPID keys.",
        )


@router.get("/vapid-key")
async def get_vapid_key():
    _check_vapid()
    return {"public_key": settings.VAPID_PUBLIC_KEY}


@router.post("/subscribe")
async def subscribe(
    payload: SubscribeRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    user_agent: str | None = None,
):
    _check_vapid()

    existing = await db.scalar(
        select(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.endpoint == payload.endpoint,
        )
    )
    if existing:
        return {"status": "already_subscribed"}

    sub = PushSubscription(
        user_id=user_id,
        endpoint=payload.endpoint,
        p256dh=payload.p256dh,
        auth=payload.auth,
        user_agent=user_agent,
    )
    db.add(sub)
    await db.commit()
    logger.info("New push subscription for user %s", user_id)
    return {"status": "subscribed"}


@router.post("/unsubscribe")
async def unsubscribe(
    payload: SubscribeRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.endpoint == payload.endpoint,
        )
    )
    sub = result.scalar_one_or_none()
    if sub:
        await db.delete(sub)
        await db.commit()
    return {"status": "unsubscribed"}


async def send_push_to_all(title: str, body: str, url: str = "/", db=None):
    """Send a push notification to all subscribed users."""
    from pywebpush import webpush, WebPushException

    if not settings.VAPID_PRIVATE_KEY:
        return

    from app.core.db import AsyncSessionLocal
    if db is None:
        db = AsyncSessionLocal()

    try:
        result = await db.execute(select(PushSubscription))
        subs = result.scalars().all()

        vapid_claims = {"sub": settings.VAPID_CLAIM_EMAIL}
        payload = json.dumps({"title": title, "body": body, "url": url})

        failed_endpoints = []
        sent = 0

        for sub in subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                    },
                    data=payload,
                    vapid_private_key=settings.VAPID_PRIVATE_KEY,
                    vapid_claims=vapid_claims,
                )
                sent += 1
            except WebPushException as ex:
                status_code = getattr(ex, "response", None)
                if status_code is not None and hasattr(status_code, "status_code"):
                    status_code = status_code.status_code
                else:
                    status_code = None
                # 404/410 = subscription expired or unsubscribed, remove it
                if status_code in (404, 410):
                    failed_endpoints.append(sub.endpoint)
                    logger.info("Removing stale push subscription %s", sub.endpoint[:50])
                else:
                    logger.warning("Push failed for subscription: %s", str(ex)[:200])

        # Clean up stale subscriptions
        if failed_endpoints:
            from sqlalchemy import delete as sa_delete
            await db.execute(
                sa_delete(PushSubscription).where(
                    PushSubscription.endpoint.in_(failed_endpoints)
                )
            )
            await db.commit()

        logger.info("Push notifications sent: %d successful, %d cleaned up", sent, len(failed_endpoints))
    except Exception:
        logger.exception("Failed to send push notifications")
    finally:
        await db.close()
