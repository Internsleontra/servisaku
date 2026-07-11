from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from models.auth import User, ACCOUNT_STATUS_VALUES
from models.consumer_profile import ConsumerProfile
from models.booking import Booking
from schemas.admin import UserAdminResponse, UserStatusUpdateRequest, ConsumerAdminResponse
from services.rate_limit import limiter
from services.rbac import require_permission, log_admin_action, write_audit_log

router = APIRouter(prefix="/admin", tags=["Admin - Users"])
settings = get_settings()


@router.get(
    "/users",
    response_model=list[UserAdminResponse],
    summary="List users",
    description="**Database tables:** `users`\n\n**Permissions:** Requires JWT token (role: admin, permission: `users.read`)",
)
async def list_users(
    _admin_id: UUID = Depends(require_permission("users.read")),
    db: AsyncSession = Depends(get_db),
    user_type: str | None = Query(default=None, description="CONSUMER, PARTNER, or ADMIN"),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
):
    stmt = select(User).order_by(User.created_at.desc())
    if user_type:
        stmt = stmt.where(User.user_type == user_type)
    if status_filter:
        stmt = stmt.where(User.status == status_filter)
    stmt = stmt.limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return [UserAdminResponse.model_validate(u) for u in rows]


@router.get(
    "/users/{user_id}",
    response_model=UserAdminResponse,
    summary="Get a user",
    description="**Database tables:** `users`\n\n**Permissions:** Requires JWT token (role: admin, permission: `users.read`)",
    responses={404: {"description": "User not found"}},
)
async def get_user(
    user_id: UUID,
    _admin_id: UUID = Depends(require_permission("users.read")),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return UserAdminResponse.model_validate(user)


@router.put(
    "/users/{user_id}/status",
    response_model=UserAdminResponse,
    summary="Suspend, reactivate, or lock a user account",
    description=(
        f"Sets `users.status` to one of {ACCOUNT_STATUS_VALUES}.\n\n"
        "**Database tables:** `users`, `audit_logs`, `admin_actions`\n\n"
        "**Permissions:** Requires JWT token (role: admin, permission: `users.suspend`)"
    ),
    responses={404: {"description": "User not found"}, 422: {"description": "Invalid status value"}},
)
@limiter.limit(settings.RATE_LIMIT_ADMIN_SENSITIVE)
async def update_user_status(
    request: Request,
    user_id: UUID,
    body: UserStatusUpdateRequest,
    admin_id: UUID = Depends(require_permission("users.suspend")),
    db: AsyncSession = Depends(get_db),
):
    if body.status not in ACCOUNT_STATUS_VALUES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"status must be one of {ACCOUNT_STATUS_VALUES}")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    old_status = user.status
    user.status = body.status
    await write_audit_log(db, admin_id, "user", user_id, "status_update", {"status": old_status}, {"status": body.status, "reason": body.reason})
    await log_admin_action(db, admin_id, "user.status_updated", "user", user_id, f"{old_status} -> {body.status}")
    await db.flush()
    return UserAdminResponse.model_validate(user)


@router.get(
    "/consumers",
    response_model=list[ConsumerAdminResponse],
    summary="List consumers",
    description="**Database tables:** `consumer_profiles`, `users`, `bookings` (read-only)\n\n**Permissions:** Requires JWT token (role: admin, permission: `users.read`)",
)
async def list_consumers(
    _admin_id: UUID = Depends(require_permission("users.read")),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
):
    stmt = select(ConsumerProfile, User).join(User, User.id == ConsumerProfile.user_id).order_by(ConsumerProfile.created_at.desc()).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).all()
    results = []
    for profile, user in rows:
        count = (await db.execute(
            select(func.count()).select_from(Booking).where(Booking.consumer_id == profile.id)
        )).scalar() or 0
        results.append(ConsumerAdminResponse(
            id=profile.id, user_id=user.id, full_name=profile.full_name,
            phone_number=user.phone_number, email=user.email, status=user.status,
            created_at=profile.created_at, total_bookings=count,
        ))
    return results


@router.get(
    "/consumers/{consumer_id}",
    response_model=ConsumerAdminResponse,
    summary="Get a consumer",
    description="**Database tables:** `consumer_profiles`, `users`, `bookings` (read-only)\n\n**Permissions:** Requires JWT token (role: admin, permission: `users.read`)",
    responses={404: {"description": "Consumer not found"}},
)
async def get_consumer(
    consumer_id: UUID,
    _admin_id: UUID = Depends(require_permission("users.read")),
    db: AsyncSession = Depends(get_db),
):
    profile = await db.get(ConsumerProfile, consumer_id)
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Consumer not found")
    user = await db.get(User, profile.user_id)
    count = (await db.execute(
        select(func.count()).select_from(Booking).where(Booking.consumer_id == profile.id)
    )).scalar() or 0
    return ConsumerAdminResponse(
        id=profile.id, user_id=user.id, full_name=profile.full_name,
        phone_number=user.phone_number, email=user.email, status=user.status,
        created_at=profile.created_at, total_bookings=count,
    )
