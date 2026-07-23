"""
Auth: email/password (JWT) + Google OAuth.
Uses passlib for hashing and python-jose for tokens. DB access is
via SQLAlchemy async session (see app/models/models.py).
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import get_current_user_id
from app.models.models import User

settings = get_settings()
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleLoginRequest(BaseModel):
    id_token: str


def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": user_id, "exp": expire}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
    )


@router.post("/register")
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(
        select(User).where((User.email == payload.email) | (User.username == payload.username))
    )
    if existing:
        field = "email" if existing.email == payload.email else "username"
        raise HTTPException(status_code=409, detail=f"That {field} is already registered")

    user = User(
        email=payload.email,
        username=payload.username,
        hashed_password=pwd_context.hash(payload.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # First registered user becomes admin
    user_count = await db.scalar(select(User))
    if user_count:
        from sqlalchemy import func
        count = await db.scalar(select(func.count()).select_from(User))
        if count == 1:
            user.is_admin = True
            await db.commit()
            await db.refresh(user)

    return {"access_token": create_access_token(user.id), "token_type": "bearer"}


@router.post("/login")
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == payload.email))
    if not user or not user.hashed_password or not pwd_context.verify(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    return {"access_token": create_access_token(user.id), "token_type": "bearer"}


@router.post("/google")
async def google_login(payload: GoogleLoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Verifies the Google ID token (google-auth library) then
    creates/looks-up the local user and issues our own JWT.
    """
    from google.auth.transport import requests as g_requests
    from google.oauth2 import id_token as g_id_token

    try:
        idinfo = g_id_token.verify_oauth2_token(
            payload.id_token, g_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    google_id = idinfo["sub"]
    email = idinfo.get("email")

    user = await db.scalar(select(User).where(User.google_id == google_id))
    if not user and email:
        # First Google login for an email that may already have a
        # password account — link them instead of creating a duplicate.
        user = await db.scalar(select(User).where(User.email == email))
        if user:
            user.google_id = google_id

    if not user:
        base_username = (email or f"user_{google_id[:8]}").split("@")[0]
        username = base_username
        suffix = 1
        while await db.scalar(select(User).where(User.username == username)):
            suffix += 1
            username = f"{base_username}{suffix}"

        user = User(
            email=email or f"{google_id}@google.local",
            username=username,
            google_id=google_id,
            avatar_url=idinfo.get("picture"),
        )
        db.add(user)

    await db.commit()
    await db.refresh(user)

    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "email": user.email,
        "name": idinfo.get("name"),
        "avatar": user.avatar_url,
    }


@router.get("/me")
async def get_me(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Return the current user's profile from the JWT token."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "avatar_url": user.avatar_url,
        "is_admin": user.is_admin,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
