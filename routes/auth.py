from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.auth import User
from models.partner import Partner
from schemas.auth import (
    RegisterRequest, LoginRequest, VerifyOtpRequest,
    RefreshRequest, TokenResponse,
)
from auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    status_code=201,
    summary="Register a new partner account",
    description=(
        "Creates a new partner account with phone, email, and password. "
        "An OTP is sent to the provided phone number for verification.\n\n"
        "**Database tables affected:** `users` (`partners` is created later, on first KYC submission)\n\n"
        "**Permissions:** Public (no authentication required)"
    ),
    responses={
        201: {
            "description": "Account created, OTP sent to phone",
            "content": {"application/json": {"example": {"message": "OTP sent", "phone": "+60112345678"}}},
        },
        409: {
            "description": "Phone or email already registered",
            "content": {"application/json": {"example": {"detail": "Phone or email already registered"}}},
        },
        422: {
            "description": "Validation error (invalid phone format, password too short, etc.)",
            "content": {"application/json": {"example": {
                "detail": [{"loc": ["body", "phone"], "msg": "String should match pattern '^\\+?60\\d{9,10}$'", "type": "string_pattern_mismatch"}]
            }}},
        },
    },
)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(User).where(
            (User.phone_number == body.phone) | (User.email == body.email)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Phone or email already registered")

    user = User(
        user_type="PARTNER",
        phone_number=body.phone,
        email=body.email,
        password_hash=hash_password(body.password),
        status="PENDING_VERIFICATION",
    )
    db.add(user)
    await db.flush()

    # Partner row is created during KYC submission (POST /partner/me/kyc), not here —
    # partners.nric_or_passport_number is NOT NULL + UNIQUE and isn't known yet at
    # this point. body.full_name isn't persisted here since there's nowhere to put
    # it yet; KYCSubmission collects full_name again for that reason (see schemas/partner.py).
    # Until KYC is submitted, this user has no Partner profile — GET/PUT /partner/me
    # will 404 in the meantime, matching the existing "partner not found" behavior.

    return {"message": "OTP sent", "phone": body.phone}


@router.post(
    "/verify-otp",
    response_model=TokenResponse,
    summary="Verify OTP after registration",
    description=(
        "Verifies the OTP sent to the user's phone number and returns JWT tokens.\n\n"
        "**Test OTP:** Use `123456` for development/testing.\n\n"
        "**Database tables affected:** `users` (read)\n\n"
        "**Permissions:** Public (no authentication required)"
    ),
    responses={
        200: {"description": "OTP verified, tokens returned"},
        401: {
            "description": "Invalid OTP",
            "content": {"application/json": {"example": {"detail": "Invalid OTP"}}},
        },
        404: {
            "description": "User not found for the provided phone",
            "content": {"application/json": {"example": {"detail": "User not found"}}},
        },
    },
)
async def verify_otp(body: VerifyOtpRequest, db: AsyncSession = Depends(get_db)):
    if body.otp != "123456":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid OTP")

    stmt = select(User).where(User.phone_number == body.phone)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    stmt = select(Partner).where(Partner.user_id == user.id)
    partner = (await db.execute(stmt)).scalar_one_or_none()

    access_token = create_access_token(
        sub=str(user.id),
        role=user.user_type.lower(),
        kyc_status=partner.kyc_status if partner else "not_started",
    )
    refresh_token = create_refresh_token(sub=str(user.id))

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=900,
        partner={
            "id": str(partner.id) if partner else None,
            "full_name": partner.full_name if partner else None,
            "kyc_status": partner.kyc_status if partner else "not_started",
        },
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login with phone and password",
    description=(
        "Authenticates a user with phone number and password. Returns JWT access and refresh tokens.\n\n"
        "**Test Accounts:**\n"
        "- Partner: `+60100000002` / `Partner@123`\n"
        "- Admin: `+60100000001` / `Admin@123`\n\n"
        "**Database tables affected:** `users`, `partners` (read)\n\n"
        "**Permissions:** Public (no authentication required)"
    ),
    responses={
        200: {
            "description": "Login successful, tokens returned",
            "content": {"application/json": {"example": {
                "access_token": "eyJhbGciOiJIUzI1NiIs...",
                "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
                "expires_in": 900,
                "partner": {"id": "uuid-here", "full_name": "Ahmad Rizal", "kyc_status": "verified"},
            }}},
        },
        401: {
            "description": "Invalid credentials",
            "content": {"application/json": {"example": {"detail": "Invalid phone or password"}}},
        },
        422: {
            "description": "Validation error",
            "content": {"application/json": {"example": {
                "detail": [{"loc": ["body", "phone"], "msg": "String should match pattern '^\\+?60\\d{9,10}$'", "type": "string_pattern_mismatch"}]
            }}},
        },
    },
)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.phone_number == body.phone)
    user = (await db.execute(stmt)).scalar_one_or_none()

    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid phone or password")

    stmt = select(Partner).where(Partner.user_id == user.id)
    partner = (await db.execute(stmt)).scalar_one_or_none()

    access_token = create_access_token(
        sub=str(user.id),
        role=user.user_type.lower(),
        kyc_status=partner.kyc_status if partner else "not_started",
    )
    refresh_token = create_refresh_token(sub=str(user.id))

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=900,
        partner={
            "id": str(partner.id) if partner else None,
            "full_name": partner.full_name if partner else None,
            "kyc_status": partner.kyc_status if partner else "not_started",
        },
    )


@router.post(
    "/refresh",
    summary="Refresh access token",
    description=(
        "Exchanges a valid refresh token for a new access token.\n\n"
        "**Permissions:** Requires valid refresh token"
    ),
    responses={
        200: {
            "description": "New access token issued",
            "content": {"application/json": {"example": {"access_token": "eyJhbGciOiJIUzI1NiIs...", "expires_in": 900}}},
        },
        401: {
            "description": "Invalid or expired refresh token",
            "content": {"application/json": {"example": {"detail": "Invalid or expired token"}}},
        },
    },
)
async def refresh(body: RefreshRequest):
    payload = decode_token(body.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type")

    access_token = create_access_token(sub=payload["sub"])
    return {"access_token": access_token, "expires_in": 900}


@router.post(
    "/logout",
    summary="Logout (stateless)",
    description=(
        "Logs out the current user. With stateless JWT, the client should discard tokens.\n\n"
        "**Permissions:** Public"
    ),
    responses={
        200: {
            "description": "Logout successful",
            "content": {"application/json": {"example": {"message": "Logged out"}}},
        },
    },
)
async def logout():
    return {"message": "Logged out"}
