from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_user_id
from models.notification import Notification
from schemas.notification import NotificationResponse

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _to_response(n: Notification) -> NotificationResponse:
    return NotificationResponse(
        id=n.id,
        type=n.notification_type or "system",
        title=n.title,
        body=n.message,
        is_read=n.is_read,
        ref_id=n.reference_id,
        created_at=n.created_at,
    )


@router.get(
    "",
    response_model=list[NotificationResponse],
    summary="Get notifications",
    description=(
        "Returns paginated list of notifications for the current user, sorted by most recent first. "
        "Notification types: `job`, `payout`, `rating`, `system`.\n\n"
        "**Database tables:** `notifications`\n\n"
        "**Permissions:** Requires JWT token"
    ),
    responses={
        200: {"description": "List of notifications"},
        401: {"description": "Missing or invalid token"},
    },
)
async def get_notifications(
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, le=100, description="Number of results per page (max 100)"),
    offset: int = Query(default=0, description="Number of results to skip"),
):
    stmt = (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    items = (await db.execute(stmt)).scalars().all()
    return [_to_response(n) for n in items]


@router.get(
    "/unread-count",
    summary="Get unread notification count",
    description=(
        "Returns the count of unread notifications for the current user.\n\n"
        "**Database tables:** `notifications`\n\n"
        "**Permissions:** Requires JWT token"
    ),
    responses={
        200: {
            "description": "Unread count",
            "content": {"application/json": {"example": {"count": 3}}},
        },
        401: {"description": "Missing or invalid token"},
    },
)
async def get_unread_count(
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    count = await db.scalar(
        select(func.count()).where(
            Notification.user_id == user_id,
            Notification.is_read == False,  # noqa: E712
        )
    )
    return {"count": count or 0}


@router.put(
    "/{notification_id}/read",
    summary="Mark notification as read",
    description=(
        "Marks a single notification as read by its ID.\n\n"
        "**Database tables:** `notifications`\n\n"
        "**Permissions:** Requires JWT token"
    ),
    responses={
        200: {
            "description": "Notification marked as read",
            "content": {"application/json": {"example": {"id": "uuid-here", "is_read": True}}},
        },
        401: {"description": "Missing or invalid token"},
        404: {"description": "Notification not found or not owned by user"},
    },
)
async def mark_read(
    notification_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    notification = await db.get(Notification, notification_id)
    if not notification or notification.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    notification.is_read = True
    await db.flush()
    return {"id": str(notification_id), "is_read": True}


@router.put(
    "/read-all",
    summary="Mark all notifications as read",
    description=(
        "Marks all unread notifications for the current user as read.\n\n"
        "**Database tables:** `notifications`\n\n"
        "**Permissions:** Requires JWT token"
    ),
    responses={
        200: {
            "description": "Count of notifications marked as read",
            "content": {"application/json": {"example": {"updated": 5}}},
        },
        401: {"description": "Missing or invalid token"},
    },
)
async def mark_all_read(
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
        .values(is_read=True)
    )
    result = await db.execute(stmt)
    return {"updated": result.rowcount}
