"""
Auth: email/password (JWT) + Google OAuth.
Uses passlib for hashing and python-jose for tokens. DB access is
via SQLAlchemy async session (see app/models/user.py).
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr

from app.core.config import get_settings

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
async def register(payload: RegisterRequest):
    # TODO: persist to Postgres via SQLAlchemy (app/models/user.py),
    # check for existing email/username, then hash + store password.
    hashed = pwd_context.hash(payload.password)
    fake_user_id = "usr_" + payload.email.split("@")[0]
    return {"access_token": create_access_token(fake_user_id), "token_type": "bearer"}


@router.post("/login")
async def login(payload: LoginRequest):
    # TODO: look up user, verify pwd_context.verify(payload.password, user.hashed_password)
    fake_user_id = "usr_" + payload.email.split("@")[0]
    return {"access_token": create_access_token(fake_user_id), "token_type": "bearer"}


@router.post("/google")
async def google_login(payload: GoogleLoginRequest):
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

    user_id = "usr_google_" + idinfo["sub"]
    return {
        "access_token": create_access_token(user_id),
        "token_type": "bearer",
        "email": idinfo.get("email"),
        "name": idinfo.get("name"),
        "avatar": idinfo.get("picture"),
    }
