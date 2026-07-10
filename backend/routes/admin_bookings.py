from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.booking import Booking, BookingStatusHistory
from services.rbac import require_permission, log_admin_action, write_audit_log
from services.realtime import events
from schemas.admin import BookingAdminResponse, BookingCancelRequest

router = APIRouter(prefix="/admin/bookings", tags=["Admin - Bookings"])

_CANCELLABLE_STATUSES = {"PENDING_PAYMENT", "CONFIRMED", "PARTNER_ASSIGNED", "EN_ROUTE"}


@router.get(
    "",
    response_model=list[BookingAdminResponse],
    summary="List bookings",
    description=(
        "Manual dispatch (re)assignment for a booking is handled by the existing "
        "`POST /dispatch/bookings/{id}/start` and `POST /dispatch/bookings/{id}/override` "
        "endpoints (Stage 4) — not duplicated here, to avoid two code paths mutating "
        "the same `job_dispatches` queue.\n\n"
        "**Database tables:** `bookings` (read-only)\n\n"
        "**Permissions:** Requires JWT token (role: admin, permission: `bookings.read`)"
    ),
)
async def list_bookings(
    _admin_id: UUID = Depends(require_permission("bookings.read")),
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = Query(default=None, alias="status"),
    consumer_id: UUID | None = Query(default=None),
    partner_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
):
    stmt = select(Booking).order_by(Booking.created_at.desc())
    if status_filter:
        stmt = stmt.where(Booking.booking_status == status_filter)
    if consumer_id:
        stmt = stmt.where(Booking.consumer_id == consumer_id)
    if partner_id:
        stmt = stmt.where(Booking.partner_id == partner_id)
    stmt = stmt.limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return [BookingAdminResponse.model_validate(b) for b in rows]


@router.get(
    "/{booking_id}",
    response_model=BookingAdminResponse,
    summary="Get a booking",
    description="**Database tables:** `bookings` (read-only)\n\n**Permissions:** Requires JWT token (role: admin, permission: `bookings.read`)",
    responses={404: {"description": "Booking not found"}},
)
async def get_booking(
    booking_id: UUID,
    _admin_id: UUID = Depends(require_permission("bookings.read")),
    db: AsyncSession = Depends(get_db),
):
    booking = await db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    return BookingAdminResponse.model_validate(booking)


@router.get(
    "/{booking_id}/status-history",
    summary="Get a booking's full status transition history",
    description="**Database tables:** `booking_status_history` (read-only)\n\n**Permissions:** Requires JWT token (role: admin, permission: `bookings.read`)",
    responses={404: {"description": "Booking not found"}},
)
async def get_booking_status_history(
    booking_id: UUID,
    _admin_id: UUID = Depends(require_permission("bookings.read")),
    db: AsyncSession = Depends(get_db),
):
    booking = await db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    stmt = select(BookingStatusHistory).where(BookingStatusHistory.booking_id == booking_id).order_by(BookingStatusHistory.created_at.asc())
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {"old_status": r.old_status, "new_status": r.new_status, "changed_by_user_id": str(r.changed_by_user_id) if r.changed_by_user_id else None,
         "remarks": r.remarks, "created_at": r.created_at.isoformat()}
        for r in rows
    ]


@router.post(
    "/{booking_id}/cancel",
    response_model=BookingAdminResponse,
    summary="Admin-cancel a booking",
    description=(
        "Cancels a booking that hasn't started yet (not allowed once "
        "IN_PROGRESS/COMPLETED). Records the transition in "
        "`booking_status_history` and broadcasts it over Socket.IO, exactly "
        "like the partner-facing status endpoint (Stage 5).\n\n"
        "**Database tables:** `bookings`, `booking_status_history`, `audit_logs`, `admin_actions`\n\n"
        "**Permissions:** Requires JWT token (role: admin, permission: `bookings.cancel`)"
    ),
    responses={404: {"description": "Booking not found"}, 409: {"description": "Booking can no longer be cancelled"}},
)
async def cancel_booking(
    booking_id: UUID,
    body: BookingCancelRequest,
    admin_id: UUID = Depends(require_permission("bookings.cancel")),
    db: AsyncSession = Depends(get_db),
):
    booking = await db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if booking.booking_status not in _CANCELLABLE_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "Booking can no longer be cancelled")

    old_status = booking.booking_status
    booking.booking_status = "CANCELLED_BY_CONSUMER"
    booking.cancelled_at = datetime.now(timezone.utc)
    booking.cancellation_reason = body.reason

    db.add(BookingStatusHistory(
        booking_id=booking.id, old_status=old_status, new_status="CANCELLED_BY_CONSUMER",
        changed_by_user_id=admin_id, remarks=f"Admin cancellation: {body.reason}",
    ))
    await write_audit_log(db, admin_id, "booking", booking_id, "cancel", {"booking_status": old_status}, {"booking_status": "CANCELLED_BY_CONSUMER", "reason": body.reason})
    await log_admin_action(db, admin_id, "booking.cancelled", "booking", booking_id, body.reason)
    await db.flush()

    await events.emit("booking.status_changed", {
        "booking_id": str(booking.id), "old_status": old_status, "new_status": "CANCELLED_BY_CONSUMER",
    })
    return BookingAdminResponse.model_validate(booking)
