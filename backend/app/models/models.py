import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String, nullable=True)
    google_id: Mapped[str | None] = mapped_column(String, nullable=True, unique=True)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    is_admin: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    watchlist_entries: Mapped[list["WatchlistEntry"]] = relationship(back_populates="user")
    push_subscriptions: Mapped[list["PushSubscription"]] = relationship(back_populates="user")


class WatchlistEntry(Base):
    __tablename__ = "watchlist_entries"
    __table_args__ = (UniqueConstraint("user_id", "anime_id", name="uq_user_anime"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"))
    anime_id: Mapped[int] = mapped_column(Integer, index=True)  # MAL id, or AniList id if source="anilist"
    source: Mapped[str] = mapped_column(String, default="jikan")  # "jikan" | "anilist"
    status: Mapped[str] = mapped_column(String)  # planning|watching|completed|dropped|favorites
    progress: Mapped[int] = mapped_column(Integer, default=0)
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="watchlist_entries")


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"))
    anime_id: Mapped[int] = mapped_column(Integer, index=True)
    rating: Mapped[float] = mapped_column(Float)
    body: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    __table_args__ = (UniqueConstraint("user_id", "endpoint", name="uq_user_endpoint"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"))
    endpoint: Mapped[str] = mapped_column(String, index=True)
    p256dh: Mapped[str] = mapped_column(String)
    auth: Mapped[str] = mapped_column(String)
    user_agent: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="push_subscriptions")
