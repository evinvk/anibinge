from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_user_id
from app.models.models import EpisodeComment, User

router = APIRouter(prefix="/api/v1/comments", tags=["comments"])


class CommentCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=200)
    episode_number: int = Field(..., ge=1)
    body: str = Field(..., min_length=1, max_length=2000)
    tag: str = Field("comment", pattern="^(comment|report|issue)$")


class CommentResponse(BaseModel):
    id: int
    user_id: str
    username: str
    avatar_url: str | None
    slug: str
    episode_number: int
    body: str
    tag: str
    created_at: str


@router.get("")
async def get_comments(
    slug: str = Query(..., min_length=1),
    episode_number: int = Query(..., ge=1),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(EpisodeComment, User.username, User.avatar_url)
        .join(User, EpisodeComment.user_id == User.id)
        .where(EpisodeComment.slug == slug, EpisodeComment.episode_number == episode_number)
        .order_by(EpisodeComment.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.all()

    count_stmt = select(func.count()).select_from(EpisodeComment).where(
        EpisodeComment.slug == slug, EpisodeComment.episode_number == episode_number
    )
    total = (await db.execute(count_stmt)).scalar() or 0

    return {
        "comments": [
            CommentResponse(
                id=c.id,
                user_id=c.user_id,
                username=username,
                avatar_url=avatar_url,
                slug=c.slug,
                episode_number=c.episode_number,
                body=c.body,
                tag=c.tag,
                created_at=c.created_at.isoformat(),
            ).model_dump()
            for c, username, avatar_url in rows
        ],
        "total": total,
    }


@router.post("", status_code=201)
async def create_comment(
    payload: CommentCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    check = await db.execute(
        select(EpisodeComment).where(
            EpisodeComment.user_id == user_id,
            EpisodeComment.slug == payload.slug,
            EpisodeComment.episode_number == payload.episode_number,
        )
    )
    if check.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="You already commented on this episode")

    comment = EpisodeComment(
        user_id=user_id,
        slug=payload.slug,
        episode_number=payload.episode_number,
        body=payload.body,
        tag=payload.tag,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    user_result = await db.execute(select(User.username, User.avatar_url).where(User.id == user_id))
    username, avatar_url = user_result.one()

    return CommentResponse(
        id=comment.id,
        user_id=comment.user_id,
        username=username,
        avatar_url=avatar_url,
        slug=comment.slug,
        episode_number=comment.episode_number,
        body=comment.body,
        tag=comment.tag,
        created_at=comment.created_at.isoformat(),
    ).model_dump()


@router.delete("/{comment_id}")
async def delete_comment(
    comment_id: int,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(EpisodeComment).where(EpisodeComment.id == comment_id))
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    is_owner = comment.user_id == user_id
    if not is_owner:
        user_result = await db.execute(select(User).where(User.id == user_id))
        admin = user_result.scalar_one_or_none()
        if not admin or not admin.is_admin:
            raise HTTPException(status_code=403, detail="Not authorized")

    await db.delete(comment)
    await db.commit()
    return {"deleted": True}
