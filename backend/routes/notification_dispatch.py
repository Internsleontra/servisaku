from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_user_id, get_current_admin_id
from models.notification_delivery import DeviceToken, NotificationLog
from schemas.notification_dispatch import (
    DeviceTokenRegister, DeviceTokenUpdate, DeviceTokenResponse,
    NotificationPreferenceResponse, NotificationPreferenceUpdate,
    TopicSubscribeRequest, TopicSendRequest,
    NotificationLogResponse, RetryAllResponse,
)
from services.notifications.registry import get_push_provider
from services.notifications.dispatcher import get_or_create_preferences, retry_log, retry_all_failed
from services.rbac import log_admin_action

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.post(
    "/device-tokens",
    response_model=DeviceTokenResponse,
    status_code=201,
    summary="Register a device token",
    description=(
        "Registers (or reactivates) an FCM device token for the current user. Upserts by "
        "`(user_id, device_token)` — registering the same token again just updates it.\n\n"
        "**Database tables:** `device_tokens`\n\n"
        "**Permissions:** Requires JWT token"
    ),
)
async def register_device_token(
    body: DeviceTokenRegister,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(DeviceToken).where(DeviceToken.user_id == user_id, DeviceToken.device_token == body.device_token)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        existing.device_type = body.device_type
        existing.is_active = True
        token = existing
    else:
        token = DeviceToken(user_id=user_id, device_token=body.device_token, device_type=body.device_type)
        db.add(token)
    await db.flush()
    return DeviceTokenResponse.model_validate(token)


@router.get(
    "/device-tokens",
    response_model=list[DeviceTokenResponse],
    summary="List my device tokens",
    description="Returns all device tokens registered for the current user.\n\n**Database tables:** `device_tokens`\n\n**Permissions:** Requires JWT token",
)
async def list_device_tokens(
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(DeviceToken).where(DeviceToken.user_id == user_id).order_by(DeviceToken.created_at.desc())
    tokens = (await db.execute(stmt)).scalars().all()
    return [DeviceTokenResponse.model_validate(t) for t in tokens]


@router.put(
    "/device-tokens/{token_id}",
    response_model=DeviceTokenResponse,
    summary="Update a device token",
    description="Updates `device_type` or `is_active` (e.g. deactivate without deleting) for one of the current user's device tokens.\n\n**Database tables:** `device_tokens`\n\n**Permissions:** Requires JWT token",
    responses={404: {"description": "Device token not found"}},
)
async def update_device_token(
    token_id: UUID,
    body: DeviceTokenUpdate,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    token = await db.get(DeviceToken, token_id)
    if not token or token.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device token not found")
    if body.device_type is not None:
        token.device_type = body.device_type
    if body.is_active is not None:
        token.is_active = body.is_active
    await db.flush()
    return DeviceTokenResponse.model_validate(token)


@router.delete(
    "/device-tokens/{token_id}",
    summary="Remove a device token",
    description="Deletes one of the current user's device tokens (e.g. on logout).\n\n**Database tables:** `device_tokens`\n\n**Permissions:** Requires JWT token",
    responses={404: {"description": "Device token not found"}},
)
async def delete_device_token(
    token_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    token = await db.get(DeviceToken, token_id)
    if not token or token.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device token not found")
    await db.delete(token)
    await db.flush()
    return {"deleted": True}


@router.get(
    "/preferences",
    response_model=NotificationPreferenceResponse,
    summary="Get my notification preferences",
    description="Returns the current user's notification preferences, auto-creating defaults on first use.\n\n**Database tables:** `notification_preferences`\n\n**Permissions:** Requires JWT token",
)
async def get_preferences(
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    prefs = await get_or_create_preferences(user_id, db)
    return NotificationPreferenceResponse.model_validate(prefs)


@router.put(
    "/preferences",
    response_model=NotificationPreferenceResponse,
    summary="Update my notification preferences",
    description="Partially updates per-category, per-channel opt-in/out flags.\n\n**Database tables:** `notification_preferences`\n\n**Permissions:** Requires JWT token",
)
async def update_preferences(
    body: NotificationPreferenceUpdate,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    prefs = await get_or_create_preferences(user_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(prefs, field, value)
    await db.flush()
    return NotificationPreferenceResponse.model_validate(prefs)


@router.post(
    "/topics/subscribe",
    summary="Subscribe my devices to a topic",
    description=(
        "Subscribes all of the current user's active device tokens to an FCM topic (e.g. "
        "for broadcast promotions by region/category).\n\n"
        "**Permissions:** Requires JWT token"
    ),
    responses={
        422: {"description": "No active device tokens registered"},
        503: {"description": "Firebase is not configured"},
    },
)
async def subscribe_to_topic(
    body: TopicSubscribeRequest,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(DeviceToken.device_token).where(DeviceToken.user_id == user_id, DeviceToken.is_active == True)  # noqa: E712
    tokens = [t for t, in (await db.execute(stmt)).all()]
    if not tokens:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No active device tokens registered")
    await get_push_provider().subscribe_to_topic(tokens, body.topic)
    return {"subscribed": True, "topic": body.topic, "device_count": len(tokens)}


@router.post(
    "/topics/unsubscribe",
    summary="Unsubscribe my devices from a topic",
    description="Unsubscribes all of the current user's active device tokens from an FCM topic.\n\n**Permissions:** Requires JWT token",
    responses={422: {"description": "No active device tokens registered"}, 503: {"description": "Firebase is not configured"}},
)
async def unsubscribe_from_topic(
    body: TopicSubscribeRequest,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(DeviceToken.device_token).where(DeviceToken.user_id == user_id, DeviceToken.is_active == True)  # noqa: E712
    tokens = [t for t, in (await db.execute(stmt)).all()]
    if not tokens:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No active device tokens registered")
    await get_push_provider().unsubscribe_from_topic(tokens, body.topic)
    return {"unsubscribed": True, "topic": body.topic, "device_count": len(tokens)}


@router.post(
    "/topics/{topic}/send",
    summary="Broadcast a push notification to a topic",
    description="Sends one push notification to every device subscribed to a topic.\n\n**Permissions:** Requires JWT token (role: admin)",
    responses={503: {"description": "Firebase is not configured"}},
)
async def send_to_topic(
    topic: str,
    body: TopicSendRequest,
    admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
):
    result = await get_push_provider().send_to_topic(topic, body.title, body.body, body.data)
    if not result.success:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Push send failed: {result.error}")
    await log_admin_action(db, admin_id, "notification.topic_broadcast", "topic", None, f"{topic}: {body.title}")
    await db.flush()
    return {"sent": True, "topic": topic, "provider_message_id": result.provider_message_id}


@router.get(
    "/logs",
    response_model=list[NotificationLogResponse],
    summary="Get my notification delivery history",
    description=(
        "Returns delivery attempts (push/SMS/email) across every channel, with provider and "
        "status — distinct from `GET /notifications`, which is just the in-app notification "
        "list.\n\n**Database tables:** `notification_logs`\n\n**Permissions:** Requires JWT token"
    ),
)
async def get_notification_logs(
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, le=100, description="Number of results per page (max 100)"),
    offset: int = Query(default=0, description="Number of results to skip"),
):
    stmt = (
        select(NotificationLog)
        .where(NotificationLog.user_id == user_id)
        .order_by(NotificationLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    logs = (await db.execute(stmt)).scalars().all()
    return [NotificationLogResponse.model_validate(l) for l in logs]


@router.post(
    "/logs/{log_id}/retry",
    response_model=NotificationLogResponse,
    summary="Retry one failed delivery",
    description="Re-attempts a single FAILED delivery on its original channel.\n\n**Database tables:** `notification_logs`\n\n**Permissions:** Requires JWT token (role: admin)",
    responses={404: {"description": "Log not found"}, 409: {"description": "Log is not in FAILED status"}},
)
async def retry_notification_log(
    log_id: UUID,
    admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
):
    log, succeeded = await retry_log(log_id, db)
    if log is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification log not found")
    await log_admin_action(db, admin_id, "notification.log_retried", "notification_log", log_id, f"succeeded={succeeded}")
    await db.flush()
    return NotificationLogResponse.model_validate(log)


@router.post(
    "/retry-failed",
    response_model=RetryAllResponse,
    summary="Retry all recent failed deliveries",
    description=(
        "Bulk-retries the most recent FAILED deliveries across all channels/users — the "
        "notification retry mechanism, run manually for now (no background scheduler exists "
        "in this app yet).\n\n**Database tables:** `notification_logs`\n\n"
        "**Permissions:** Requires JWT token (role: admin)"
    ),
)
async def retry_failed_notifications(
    admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, le=200),
):
    retried, checked = await retry_all_failed(db, limit=limit)
    await log_admin_action(db, admin_id, "notification.bulk_retry", None, None, f"retried={retried} checked={checked}")
    await db.flush()
    return RetryAllResponse(retried=retried, checked=checked)
