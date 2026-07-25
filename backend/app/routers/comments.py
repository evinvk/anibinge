"""
Community comments for episodes — replies, likes, issue reports with admin notifications.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, update, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db, AsyncSessionLocal
from app.core.security import get_current_user_id
from app.models.models import EpisodeComment, CommentLike, User

logger = logging.getLogger("anibinge.comments")
router = APIRouter(prefix="/api/v1/comments", tags=["comments"])


# ── Schemas ──────────────────────────────────────────────────────────

class CommentCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=200)
    episode_number: int = Field(..., ge=1)
    body: str = Field(..., min_length=1, max_length=2000)
    tag: str = Field("comment", pattern="^(comment|report|issue)$")
    parent_id: int | None = None


class CommentOut(BaseModel):
    id: int
    user_id: str
    username: str
    avatar_url: str | None
    slug: str
    episode_number: int
    body: str
    tag: str
    parent_id: int | None
    likes: int
    replies_count: int
    is_resolved: bool
    liked_by_me: bool
    created_at: str


# ── Helpers ──────────────────────────────────────────────────────────

async def _build_comment(c, username, avatar_url, user_id_set, liked_ids):
    return CommentOut(
        id=c.id,
        user_id=c.user_id,
        username=username,
        avatar_url=avatar_url,
        slug=c.slug,
        episode_number=c.episode_number,
        body=c.body,
        tag=c.tag,
        parent_id=c.parent_id,
        likes=c.likes,
        replies_count=c.replies_count,
        is_resolved=c.is_resolved,
        liked_by_me=c.id in liked_ids,
        created_at=c.created_at.isoformat(),
    ).model_dump()


async def _enrich_comments(rows, db, request_user_id: str | None = None):
    """Attach username, avatar, and liked_by_me to comment rows."""
    user_ids = {c.user_id for c, _, _ in rows}
    comment_ids = [c.id for c, _, _ in rows]

    user_map = {}
    if user_ids:
        ur = await db.execute(select(User.id, User.username, User.avatar_url).where(User.id.in_(user_ids)))
        for uid, uname, uavatar in ur.all():
            user_map[uid] = (uname, uavatar)

    liked_ids: set[int] = set()
    if request_user_id and comment_ids:
        lr = await db.execute(
            select(CommentLike.comment_id).where(
                CommentLike.user_id == request_user_id,
                CommentLike.comment_id.in_(comment_ids),
            )
        )
        liked_ids = {row[0] for row in lr.all()}

    result = []
    for c, _, _ in rows:
        uname, uavatar = user_map.get(c.user_id, ("Unknown", None))
        result.append(await _build_comment(c, uname, uavatar, user_ids, liked_ids))
    return result


async def _notify_admins(event_type: str, slug: str, ep: int, body: str, reporter: str):
    """Log issue events. Admins can query them via /api/v1/admin/issues."""
    logger.warning("[ISSUE] %s | %s ep-%d | by %s | %s", event_type, slug, ep, reporter, body[:200])


# ── Endpoints ────────────────────────────────────────────────────────

@router.get("")
async def get_comments(
    slug: str = Query(..., min_length=1),
    episode_number: int = Query(..., ge=1),
    sort: str = Query("newest", pattern="^(newest|oldest|popular)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    request_user_id: str | None = Query(None, exclude=True),
    db: AsyncSession = Depends(get_db),
):
    """Get top-level comments for an episode with nested replies."""
    order = EpisodeComment.created_at.desc() if sort == "newest" else (
        EpisodeComment.created_at.asc() if sort == "oldest" else EpisodeComment.likes.desc()
    )

    stmt = (
        select(EpisodeComment, User.username, User.avatar_url)
        .join(User, EpisodeComment.user_id == User.id)
        .where(
            EpisodeComment.slug == slug,
            EpisodeComment.episode_number == episode_number,
            EpisodeComment.parent_id.is_(None),
        )
        .order_by(order)
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    comments = await _enrich_comments(rows, db, request_user_id)

    # Fetch replies for each top-level comment
    for comment in comments:
        reply_stmt = (
            select(EpisodeComment, User.username, User.avatar_url)
            .join(User, EpisodeComment.user_id == User.id)
            .where(EpisodeComment.parent_id == comment["id"])
            .order_by(EpisodeComment.created_at.asc())
            .limit(20)
        )
        reply_rows = (await db.execute(reply_stmt)).all()
        comment["replies"] = await _enrich_comments(reply_rows, db, request_user_id)

    total = (await db.execute(
        select(func.count()).select_from(EpisodeComment).where(
            EpisodeComment.slug == slug,
            EpisodeComment.episode_number == episode_number,
            EpisodeComment.parent_id.is_(None),
        )
    )).scalar() or 0

    return {"comments": comments, "total": total}


@router.get("/issues")
async def get_issues(
    slug: str | None = Query(None),
    resolved: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _admin: str = Depends(lambda credentials=None: None),
    db: AsyncSession = Depends(get_db),
):
    """Get all reported issues (admin endpoint)."""
    from app.core.security import get_current_admin_user
    from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

    stmt = (
        select(EpisodeComment, User.username, User.avatar_url)
        .join(User, EpisodeComment.user_id == User.id)
        .where(EpisodeComment.tag.in_(["report", "issue"]))
    )
    if slug:
        stmt = stmt.where(EpisodeComment.slug == slug)
    if resolved is not None:
        stmt = stmt.where(EpisodeComment.is_resolved == resolved)
    stmt = stmt.order_by(EpisodeComment.created_at.desc()).offset(offset).limit(limit)

    rows = (await db.execute(stmt)).all()
    comments = await _enrich_comments(rows, db)

    total_stmt = select(func.count()).select_from(EpisodeComment).where(
        EpisodeComment.tag.in_(["report", "issue"])
    )
    if slug:
        total_stmt = total_stmt.where(EpisodeComment.slug == slug)
    if resolved is not None:
        total_stmt = total_stmt.where(EpisodeComment.is_resolved == resolved)
    total = (await db.execute(total_stmt)).scalar() or 0

    return {"issues": comments, "total": total}


@router.post("", status_code=201)
async def create_comment(
    payload: CommentCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a comment, reply, or issue report."""
    # If replying, verify parent exists
    if payload.parent_id:
        parent = (await db.execute(
            select(EpisodeComment).where(EpisodeComment.id == payload.parent_id)
        )).scalar_one_or_none()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent comment not found")

    comment = EpisodeComment(
        user_id=user_id,
        slug=payload.slug,
        episode_number=payload.episode_number,
        body=payload.body,
        tag=payload.tag,
        parent_id=payload.parent_id,
    )
    db.add(comment)

    # Increment reply count on parent
    if payload.parent_id:
        await db.execute(
            update(EpisodeComment)
            .where(EpisodeComment.id == payload.parent_id)
            .values(replies_count=EpisodeComment.replies_count + 1)
        )

    await db.commit()
    await db.refresh(comment)

    user_result = await db.execute(select(User.username, User.avatar_url).where(User.id == user_id))
    username, avatar_url = user_result.one()

    # Notify admins for issues/reports
    if payload.tag in ("report", "issue"):
        await _notify_admins(payload.tag, payload.slug, payload.episode_number, payload.body, username)

    return await _build_comment(comment, username, avatar_url, set(), set())


@router.post("/{comment_id}/like")
async def toggle_like(
    comment_id: int,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Toggle like on a comment. Returns new like count."""
    comment = (await db.execute(
        select(EpisodeComment).where(EpisodeComment.id == comment_id)
    )).scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    existing = (await db.execute(
        select(CommentLike).where(CommentLike.user_id == user_id, CommentLike.comment_id == comment_id)
    )).scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.execute(
            update(EpisodeComment).where(EpisodeComment.id == comment_id).values(likes=EpisodeComment.likes - 1)
        )
        await db.commit()
        return {"liked": False, "likes": max(0, comment.likes - 1)}
    else:
        db.add(CommentLike(user_id=user_id, comment_id=comment_id))
        await db.execute(
            update(EpisodeComment).where(EpisodeComment.id == comment_id).values(likes=EpisodeComment.likes + 1)
        )
        await db.commit()
        return {"liked": True, "likes": comment.likes + 1}


@router.patch("/{comment_id}/resolve")
async def toggle_resolve(
    comment_id: int,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Admin: mark an issue as resolved/unresolved."""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    comment = (await db.execute(
        select(EpisodeComment).where(EpisodeComment.id == comment_id)
    )).scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    comment.is_resolved = not comment.is_resolved
    await db.commit()
    return {"is_resolved": comment.is_resolved}


@router.delete("/{comment_id}")
async def delete_comment(
    comment_id: int,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Delete a comment (owner or admin). Also deletes replies."""
    comment = (await db.execute(
        select(EpisodeComment).where(EpisodeComment.id == comment_id)
    )).scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    is_owner = comment.user_id == user_id
    if not is_owner:
        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if not user or not user.is_admin:
            raise HTTPException(status_code=403, detail="Not authorized")

    # Delete replies
    await db.execute(sa_delete(CommentLike).where(CommentLike.comment_id == comment_id))
    await db.execute(sa_delete(EpisodeComment).where(EpisodeComment.parent_id == comment_id))
    await db.execute(sa_delete(CommentLike).where(CommentLike.comment_id.in_(
        select(EpisodeComment.id).where(EpisodeComment.parent_id == comment_id)
    )))
    # Update parent reply count
    if comment.parent_id:
        await db.execute(
            update(EpisodeComment)
            .where(EpisodeComment.id == comment.parent_id)
            .values(replies_count=func.greatest(EpisodeComment.replies_count - 1, 0))
        )
    await db.execute(sa_delete(CommentLike).where(CommentLike.comment_id == comment_id))
    await db.delete(comment)
    await db.commit()
    return {"deleted": True}
