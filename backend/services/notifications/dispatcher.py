"""Central notification orchestration. Every trigger point in the app
(registration, booking creation, payment confirmation, feedback submission,
...) calls dispatch() instead of talking to a provider directly — this is
what makes the provider layer swappable without touching business logic
scattered across routes.
"""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.notification import Notification
from models.notification_delivery import DeviceToken, NotificationLog, NotificationPreference
from models.auth import User
from services.notifications.registry import get_push_provider, get_email_providers, get_sms_provider
from utils.logging import get_logger
from utils.time import utc_now

logger = get_logger("notification_dispatcher")

# (category, channel) -> notification_preferences column name
_PREFERENCE_FIELD = {
    ("booking", "push"): "booking_push", ("booking", "sms"): "booking_sms", ("booking", "email"): "booking_email",
    ("payment", "push"): "payment_push", ("payment", "sms"): "payment_sms", ("payment", "email"): "payment_email",
    ("promotional", "push"): "promotional_push", ("promotional", "sms"): "promotional_sms", ("promotional", "email"): "promotional_email",
    ("security", "push"): "security_push", ("security", "sms"): "security_sms", ("security", "email"): "security_email",
}


async def get_or_create_preferences(user_id: UUID, db: AsyncSession) -> NotificationPreference:
    stmt = select(NotificationPreference).where(NotificationPreference.user_id == user_id)
    prefs = (await db.execute(stmt)).scalar_one_or_none()
    if not prefs:
        prefs = NotificationPreference(user_id=user_id)
        db.add(prefs)
        await db.flush()
    return prefs


def _is_allowed(prefs: NotificationPreference, category: str, channel: str) -> bool:
    field = _PREFERENCE_FIELD.get((category, channel))
    return getattr(prefs, field, True) if field else True


async def _log_delivery(
    *, user_id: UUID | None, notification_id: UUID | None, channel: str, provider: str,
    status: str, db: AsyncSession, provider_message_id: str | None = None, failure_reason: str | None = None,
) -> NotificationLog:
    log = NotificationLog(
        notification_id=notification_id, user_id=user_id, channel=channel, provider=provider,
        provider_message_id=provider_message_id, status=status, failure_reason=failure_reason,
        sent_at=utc_now() if status in ("SENT", "DELIVERED") else None,
    )
    db.add(log)
    await db.flush()
    return log


async def _dispatch_push(user_id: UUID, notification_id: UUID, title: str, body: str, data: dict | None, db: AsyncSession) -> None:
    stmt = select(DeviceToken).where(DeviceToken.user_id == user_id, DeviceToken.is_active == True)  # noqa: E712
    tokens = (await db.execute(stmt)).scalars().all()
    if not tokens:
        await _log_delivery(user_id=user_id, notification_id=notification_id, channel="PUSH", provider="FIREBASE", status="FAILED", db=db, failure_reason="No active device tokens")
        return
    provider = get_push_provider()
    for t in tokens:
        result = await provider.send_to_token(t.device_token, title, body, data)
        await _log_delivery(
            user_id=user_id, notification_id=notification_id, channel="PUSH", provider=provider.name,
            status="SENT" if result.success else "FAILED", db=db,
            provider_message_id=result.provider_message_id, failure_reason=result.error,
        )


async def _dispatch_email(user_id: UUID, notification_id: UUID, email_to: str, subject: str, body: str, db: AsyncSession) -> None:
    html = f"<p>{body}</p>"
    last_error = None
    for provider in get_email_providers():
        if not provider.is_configured():
            continue
        result = await provider.send(email_to, subject, html, text=body)
        if result.success:
            await _log_delivery(
                user_id=user_id, notification_id=notification_id, channel="EMAIL", provider=provider.name,
                status="SENT", db=db, provider_message_id=result.provider_message_id,
            )
            return
        last_error = f"{provider.name}: {result.error}"
        logger.warning("email_provider_failed", provider=provider.name, error=result.error)
    await _log_delivery(
        user_id=user_id, notification_id=notification_id, channel="EMAIL", provider="NONE",
        status="FAILED", db=db, failure_reason=last_error or "No email provider configured",
    )


async def _dispatch_sms(user_id: UUID, notification_id: UUID, phone_to: str, message: str, db: AsyncSession) -> None:
    provider = get_sms_provider()
    result = await provider.send(phone_to, message)
    await _log_delivery(
        user_id=user_id, notification_id=notification_id, channel="SMS", provider=provider.name,
        status="SENT" if result.success else "FAILED", db=db,
        provider_message_id=result.provider_message_id, failure_reason=result.error,
    )


async def dispatch(
    *, user_id: UUID, category: str, title: str, body: str, db: AsyncSession,
    channels: tuple[str, ...] = ("PUSH",), booking_id: UUID | None = None,
    notification_type: str | None = None, data: dict[str, str] | None = None,
    email_to: str | None = None, phone_to: str | None = None,
) -> Notification:
    """Always creates the in-app Notification row, then best-effort delivers
    on every other requested channel — honoring per-user preferences and
    logging every attempt (including "no provider configured" and "no
    device token") to notification_logs. category is one of booking/payment/
    promotional/security, matching notification_preferences' columns."""
    notification = Notification(
        user_id=user_id, booking_id=booking_id, title=title, message=body,
        channel="IN_APP", notification_type=notification_type or category,
    )
    db.add(notification)
    await db.flush()

    prefs = await get_or_create_preferences(user_id, db)

    # A channel being unreachable/misconfigured must never break whatever
    # business action triggered this notification (payment confirmation,
    # booking creation, ...) — every channel attempt is isolated here rather
    # than relying on callers to wrap dispatch() defensively.
    if "PUSH" in channels and _is_allowed(prefs, category, "push"):
        try:
            await _dispatch_push(user_id, notification.id, title, body, data, db)
        except Exception as e:
            logger.warning("push_dispatch_error", error=str(e))
    if "EMAIL" in channels and email_to and _is_allowed(prefs, category, "email"):
        try:
            await _dispatch_email(user_id, notification.id, email_to, title, body, db)
        except Exception as e:
            logger.warning("email_dispatch_error", error=str(e))
    if "SMS" in channels and phone_to and _is_allowed(prefs, category, "sms"):
        try:
            await _dispatch_sms(user_id, notification.id, phone_to, body, db)
        except Exception as e:
            logger.warning("sms_dispatch_error", error=str(e))

    return notification


async def _redispatch_log(log: NotificationLog, db: AsyncSession) -> bool:
    """Re-attempts one failed delivery. Returns whether it succeeded."""
    notification = await db.get(Notification, log.notification_id) if log.notification_id else None
    if not notification:
        return False

    if log.channel == "PUSH":
        stmt = select(DeviceToken).where(DeviceToken.user_id == log.user_id, DeviceToken.is_active == True)  # noqa: E712
        tokens = (await db.execute(stmt)).scalars().all()
        if not tokens:
            return False
        provider = get_push_provider()
        succeeded = False
        for t in tokens:
            result = await provider.send_to_token(t.device_token, notification.title, notification.message)
            if result.success:
                succeeded = True
                log.provider_message_id = result.provider_message_id
        if succeeded:
            log.status = "SENT"
            log.failure_reason = None
            log.sent_at = utc_now()
        return succeeded

    if log.channel == "EMAIL":
        user = await db.get(User, log.user_id) if log.user_id else None
        if not user or not user.email:
            return False
        for provider in get_email_providers():
            if not provider.is_configured():
                continue
            result = await provider.send(user.email, notification.title, f"<p>{notification.message}</p>", text=notification.message)
            if result.success:
                log.status = "SENT"
                log.provider = provider.name
                log.provider_message_id = result.provider_message_id
                log.failure_reason = None
                log.sent_at = utc_now()
                return True
        return False

    if log.channel == "SMS":
        user = await db.get(User, log.user_id) if log.user_id else None
        if not user or not user.phone_number:
            return False
        provider = get_sms_provider()
        result = await provider.send(user.phone_number, notification.message)
        if result.success:
            log.status = "SENT"
            log.provider_message_id = result.provider_message_id
            log.failure_reason = None
            log.sent_at = utc_now()
        return result.success

    return False


async def retry_log(log_id: UUID, db: AsyncSession) -> tuple[NotificationLog, bool]:
    log = await db.get(NotificationLog, log_id)
    if not log:
        return None, False
    if log.status != "FAILED":
        return log, False
    succeeded = await _redispatch_log(log, db)
    log.fallback_sent = True
    await db.flush()
    return log, succeeded


async def dispatch_standalone(**kwargs) -> None:
    """Same as dispatch(), but opens its own DB session — for use as a
    FastAPI BackgroundTask. The triggering request's own `db` session is
    already closed by the time background tasks run, so it can't be reused
    here."""
    from database import async_session

    async with async_session() as db:
        try:
            await dispatch(db=db, **kwargs)
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("background_dispatch_failed")


async def retry_all_failed(db: AsyncSession, limit: int = 50) -> tuple[int, int]:
    """Returns (retried, checked)."""
    stmt = (
        select(NotificationLog)
        .where(NotificationLog.status == "FAILED")
        .order_by(NotificationLog.created_at.desc())
        .limit(limit)
    )
    logs = (await db.execute(stmt)).scalars().all()
    retried = 0
    for log in logs:
        succeeded = await _redispatch_log(log, db)
        log.fallback_sent = True
        if succeeded:
            retried += 1
    await db.flush()
    return retried, len(logs)
