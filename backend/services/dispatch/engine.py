"""Smart Dispatch orchestration — the sequential offer queue: build ranked
candidates, offer to the top one, and on decline/expiry/manual override move
to the next. Every state transition is logged permanently in job_dispatches
(see models/dispatch.py) and best-effort notified via both the existing
push/email dispatcher and the real-time event bus (services/realtime/events.py,
consumed by Socket.IO — see services/realtime/socket_server.py)."""

import uuid
from datetime import datetime, timedelta, timezone

# asyncpg silently interprets a naive Python datetime as being in the local
# system timezone (not UTC) when binding it to a `timestamptz` column, even
# though this DB session's TimeZone is UTC — discovered via live testing (a
# naive datetime round-tripped through Postgres came back shifted by exactly
# the local machine's UTC offset). Every datetime written to, or compared
# against, a DateTime(timezone=True) column in this module must be tz-aware
# (datetime.now(timezone.utc)), never the naive, deprecated datetime.utcnow().

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models.auth import User
from models.booking import Booking
from models.consumer_profile import ConsumerProfile
from models.partner import Partner
from models.dispatch import JobDispatch
from models.chat import ChatThread
from services.dispatch.matching import get_ranked_candidates
from services.notifications.dispatcher import dispatch as notify
from services.realtime import events
from utils.logging import get_logger

settings = get_settings()
logger = get_logger("dispatch_engine")


async def _partner_user(db: AsyncSession, partner_id: uuid.UUID) -> tuple[Partner | None, User | None]:
    partner = await db.get(Partner, partner_id)
    user = await db.get(User, partner.user_id) if partner else None
    return partner, user


async def _consumer_user(db: AsyncSession, consumer_id: uuid.UUID) -> tuple[ConsumerProfile | None, User | None]:
    profile = await db.get(ConsumerProfile, consumer_id)
    user = await db.get(User, profile.user_id) if profile else None
    return profile, user


async def _notify_partner_offer(dispatch_row: JobDispatch, booking: Booking, db: AsyncSession) -> None:
    partner, user = await _partner_user(db, dispatch_row.partner_id)
    if not user:
        return
    await notify(
        user_id=user.id, category="booking", channels=("PUSH", "EMAIL"), db=db,
        title="New job offer",
        body=f"You have a new job offer for booking {booking.booking_reference}. Respond within {settings.DISPATCH_OFFER_TIMEOUT_SECONDS} seconds.",
        notification_type="dispatch_offer", booking_id=booking.id, email_to=user.email,
        data={"dispatch_id": str(dispatch_row.id), "booking_id": str(booking.id)},
    )
    await events.emit("dispatch.offer_created", {
        "booking_id": str(booking.id), "dispatch_id": str(dispatch_row.id),
        "partner_id": str(dispatch_row.partner_id), "partner_user_id": str(user.id),
        "acceptance_deadline": dispatch_row.acceptance_deadline.isoformat(),
        "match_score": float(dispatch_row.match_score) if dispatch_row.match_score is not None else None,
    })


async def _notify_consumer_partner_assigned(booking: Booking, db: AsyncSession) -> None:
    profile, user = await _consumer_user(db, booking.consumer_id)
    partner = await db.get(Partner, booking.partner_id) if booking.partner_id else None
    if user:
        await notify(
            user_id=user.id, category="booking", channels=("PUSH", "EMAIL"), db=db,
            title="Partner assigned",
            body=f"{partner.full_name if partner else 'A partner'} has been assigned to your booking {booking.booking_reference}.",
            notification_type="partner_assigned", booking_id=booking.id, email_to=user.email,
        )
    await events.emit("dispatch.assigned", {
        "booking_id": str(booking.id), "partner_id": str(booking.partner_id),
        "consumer_id": str(booking.consumer_id),
        "partner_name": partner.full_name if partner else None,
    })


async def _notify_dispatch_exhausted(booking: Booking, db: AsyncSession) -> None:
    profile, user = await _consumer_user(db, booking.consumer_id)
    if user:
        await notify(
            user_id=user.id, category="booking", channels=("PUSH", "EMAIL"), db=db,
            title="Still finding you a partner",
            body=f"We're having trouble finding an available partner for booking {booking.booking_reference}. Our team will follow up shortly.",
            notification_type="dispatch_exhausted", booking_id=booking.id, email_to=user.email,
        )
    await events.emit("dispatch.exhausted", {"booking_id": str(booking.id), "consumer_id": str(booking.consumer_id)})


async def _next_dispatch_order(db: AsyncSession, booking_id: uuid.UUID) -> int:
    stmt = select(func.count()).select_from(JobDispatch).where(JobDispatch.booking_id == booking_id)
    return (await db.execute(stmt)).scalar_one() + 1


async def start_dispatch(booking: Booking, db: AsyncSession) -> JobDispatch | None:
    """Ranks remaining candidates (already-tried/blocked/unqualified partners
    are excluded inside get_ranked_candidates) and offers the job to the top
    one. Returns None — and leaves the booking CONFIRMED with no partner,
    notifying the consumer — if candidates are exhausted or the attempt cap
    is reached. Never raises for "no partner found"."""
    if booking.dispatch_attempts and booking.dispatch_attempts >= settings.DISPATCH_MAX_ATTEMPTS:
        await _notify_dispatch_exhausted(booking, db)
        return None

    candidates = await get_ranked_candidates(db, booking)
    if not candidates:
        await _notify_dispatch_exhausted(booking, db)
        return None

    top = candidates[0]
    deadline = datetime.now(timezone.utc) + timedelta(seconds=settings.DISPATCH_OFFER_TIMEOUT_SECONDS)

    dispatch_row = JobDispatch(
        booking_id=booking.id, partner_id=top.partner_id,
        dispatch_order=await _next_dispatch_order(db, booking.id),
        match_score=top.match_score, proximity_score=top.proximity_score,
        rating_score=top.rating_score, completion_score=top.completion_score,
        language_score=top.language_score, status="PENDING", acceptance_deadline=deadline,
    )
    db.add(dispatch_row)
    booking.dispatch_attempts = (booking.dispatch_attempts or 0) + 1
    booking.partner_accept_deadline = deadline
    await db.flush()

    await _notify_partner_offer(dispatch_row, booking, db)
    return dispatch_row


async def accept_offer(dispatch_row: JobDispatch, booking: Booking, db: AsyncSession) -> None:
    dispatch_row.status = "ACCEPTED"
    dispatch_row.responded_at = datetime.now(timezone.utc)
    booking.partner_id = dispatch_row.partner_id
    booking.booking_status = "PARTNER_ASSIGNED"
    booking.confirmed_at = booking.confirmed_at or datetime.now(timezone.utc)
    await db.flush()

    thread_stmt = select(ChatThread).where(ChatThread.booking_id == booking.id)
    thread = (await db.execute(thread_stmt)).scalar_one_or_none()
    if not thread:
        db.add(ChatThread(booking_id=booking.id, consumer_id=booking.consumer_id, partner_id=booking.partner_id))
        await db.flush()

    await _notify_consumer_partner_assigned(booking, db)
    await events.emit("booking.status_changed", {
        "booking_id": str(booking.id), "old_status": "CONFIRMED", "new_status": "PARTNER_ASSIGNED",
    })


async def decline_offer(dispatch_row: JobDispatch, booking: Booking, db: AsyncSession) -> JobDispatch | None:
    dispatch_row.status = "DECLINED"
    dispatch_row.responded_at = datetime.now(timezone.utc)
    await db.flush()
    await events.emit("dispatch.declined", {
        "booking_id": str(booking.id), "dispatch_id": str(dispatch_row.id),
        "partner_id": str(dispatch_row.partner_id),
    })
    return await start_dispatch(booking, db)


async def _expire_offer(dispatch_row: JobDispatch, db: AsyncSession) -> None:
    dispatch_row.status = "EXPIRED"
    dispatch_row.responded_at = datetime.now(timezone.utc)
    await db.flush()
    await events.emit("dispatch.expired", {
        "booking_id": str(dispatch_row.booking_id), "dispatch_id": str(dispatch_row.id),
        "partner_id": str(dispatch_row.partner_id),
    })


async def run_expiry_sweep(db: AsyncSession) -> dict:
    """Finds every PENDING offer past its acceptance_deadline, expires it,
    and immediately tries the next candidate for that booking (unless the
    booking has since moved on, e.g. cancelled, or was already assigned by
    a race with a manual override)."""
    stmt = select(JobDispatch).where(
        JobDispatch.status == "PENDING", JobDispatch.acceptance_deadline < datetime.now(timezone.utc),
    )
    expired = (await db.execute(stmt)).scalars().all()
    retried = 0
    for dispatch_row in expired:
        booking = await db.get(Booking, dispatch_row.booking_id)
        await _expire_offer(dispatch_row, db)
        if booking and booking.booking_status == "CONFIRMED" and booking.partner_id is None:
            next_dispatch = await start_dispatch(booking, db)
            if next_dispatch:
                retried += 1
    return {"expired": len(expired), "retried": retried}


async def run_expiry_sweep_standalone() -> dict:
    """Same as run_expiry_sweep, but opens its own DB session — for use by
    the background asyncio worker (services/dispatch/background.py)."""
    from database import async_session

    async with async_session() as db:
        try:
            result = await run_expiry_sweep(db)
            await db.commit()
            return result
        except Exception:
            await db.rollback()
            logger.exception("dispatch_sweep_failed")
            return {"expired": 0, "retried": 0}


async def manual_override(booking: Booking, partner_id: uuid.UUID, db: AsyncSession) -> JobDispatch:
    """Admin directly assigns a specific partner, bypassing the ranked queue.
    Expires any still-pending offer for this booking first."""
    pending_stmt = select(JobDispatch).where(JobDispatch.booking_id == booking.id, JobDispatch.status == "PENDING")
    for row in (await db.execute(pending_stmt)).scalars().all():
        await _expire_offer(row, db)

    now = datetime.now(timezone.utc)
    existing_stmt = select(JobDispatch).where(JobDispatch.booking_id == booking.id, JobDispatch.partner_id == partner_id)
    row = (await db.execute(existing_stmt)).scalar_one_or_none()
    if row:
        row.status = "ACCEPTED"
        row.responded_at = now
    else:
        row = JobDispatch(
            booking_id=booking.id, partner_id=partner_id,
            dispatch_order=await _next_dispatch_order(db, booking.id),
            status="ACCEPTED", acceptance_deadline=now, responded_at=now,
        )
        db.add(row)

    old_status = booking.booking_status
    booking.partner_id = partner_id
    booking.booking_status = "PARTNER_ASSIGNED"
    booking.confirmed_at = booking.confirmed_at or now
    await db.flush()

    thread_stmt = select(ChatThread).where(ChatThread.booking_id == booking.id)
    thread = (await db.execute(thread_stmt)).scalar_one_or_none()
    if not thread:
        db.add(ChatThread(booking_id=booking.id, consumer_id=booking.consumer_id, partner_id=partner_id))
        await db.flush()

    await _notify_consumer_partner_assigned(booking, db)
    await events.emit("dispatch.manual_override", {"booking_id": str(booking.id), "partner_id": str(partner_id)})
    await events.emit("booking.status_changed", {
        "booking_id": str(booking.id), "old_status": old_status, "new_status": "PARTNER_ASSIGNED",
    })
    return row
