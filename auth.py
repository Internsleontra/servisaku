from datetime import datetime, timedelta
from uuid import UUID

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db

settings = get_settings()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(sub: str, role: str = "partner", kyc_status: str = "not_started") -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": sub,
        "role": role,
        "kyc_status": kyc_status,
        "iat": datetime.utcnow(),
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(sub: str) -> str:
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": sub,
        "iat": datetime.utcnow(),
        "exp": expire,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_partner_id(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> UUID:
    payload = decode_token(token)

    if payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type")
    if payload.get("role") != "partner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")

    from models.partner import Partner
    stmt = select(Partner.id).where(Partner.auth_user_id == UUID(payload["sub"]))
    partner_id = (await db.execute(stmt)).scalar_one_or_none()

    if not partner_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partner profile not found")

    return partner_id


async def require_verified_kyc(
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
) -> UUID:
    
    
    from models.partner import Partner
    partner = await db.get(Partner, partner_id)
    if not partner or partner.kyc_status != "verified":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "KYC verification required")
    return partner_id
