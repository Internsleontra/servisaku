from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import oauth2_scheme, decode_token, get_current_user_id, get_current_admin_id, get_current_partner_id
from models.booking import Booking, BookingStatusHistory
from models.partner import Partner
from models.consumer_profile import ConsumerProfile
from models.dispatch import JobDispatch, BlockedMatch
from schemas.dispatch import (
    DispatchOfferResponse, CandidatePreviewResponse, ManualOverrideRequest,
    DeclineOfferRequest, BlockPartnerRequest, DispatchAnalyticsResponse, DispatchSweepResponse,
    BookingStatusUpdateRequest,
)
from services.dispatch.matching import get_ranked_candidates
from services.dispatch.engine import start_dispatch, accept_offer, decline_offer, manual_override, run_expiry_sweep
from services.dispatch.analytics import get_dispatch_analytics
from services.realtime import events
from services.rbac import log_admin_action

_ALLOWED_TRANSITIONS = {
    "PARTNER_ASSIGNED": {"EN_ROUTE", "CANCELLED_BY_PARTNER"},
    "EN_ROUTE": {"ARRIVED", "CANCELLED_BY_PARTNER"},
    "ARRIVED": {"IN_PROGRESS", "CANCELLED_BY_PARTNER"},
    "IN_PROGRESS": {"COMPLETED"},
}

router = APIRouter(prefix="/dispatch", tags=["Smart Dispatch"])


async def _current_role_and_scope_id(
    token: str = Depends(oauth2_scheme),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> tuple[str, UUID]:
    payload = decode_token(token)
    role = payload.get("role")
    if role == "admin":
        return "admin", user_id
    if role == "consumer":
        stmt = select(ConsumerProfile.id).where(ConsumerProfile.user_id == user_id)
        consumer_id = (await db.execute(stmt)).scalar_one_or_none()
        if not consumer_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Consumer profile not found")
        return "consumer", consumer_id
    if role == "partner":
        stmt = select(Partner.id).where(Partner.user_id == user_id)
        partner_id = (await db.execute(stmt)).scalar_one_or_none()
        if not partner_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Partner profile not found")
        return "partner", partner_id
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")


def _booking_owned_by(booking: Booking, role: str, scope_id: UUID) -> bool:
    if role == "admin":
        return True
    if role == "consumer":
        return booking.consumer_id == scope_id
    if role == "partner":
        return booking.partner_id == scope_id
    return False


@router.get(
    "/bookings/{booking_id}/candidates",
    response_model=list[CandidatePreviewResponse],
    summary="Preview ranked dispatch candidates for a booking (no offers sent)",
    description=(
        "Runs the full matching pipeline (nearby search, radius, availability, skill "
        "matching, blocked-match exclusion, workload cap, scoring) and returns the ranked "
        "candidate list — without creating any job_dispatches rows or sending offers. "
        "Useful for admin visibility and debugging the dispatch algorithm.\n\n"
        "**Database tables:** read-only (partners, bookings, consumer_addresses, "
        "partner_availability, partner_service_categories, partner_languages, blocked_matches)\n\n"
        "**Permissions:** Requires JWT token (role: admin)"
    ),
    responses={404: {"description": "Booking not found"}},
)
async def preview_candidates(
    booking_id: UUID,
    _admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
):
    booking = await db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    candidates = await get_ranked_candidates(db, booking)
    results = []
    for c in candidates:
        partner = await db.get(Partner, c.partner_id)
        results.append(CandidatePreviewResponse(
            partner_id=c.partner_id, partner_name=partner.full_name if partner else "",
            distance_km=c.distance_km, proximity_score=c.proximity_score, rating_score=c.rating_score,
            completion_score=c.completion_score, language_score=c.language_score,
            workload_score=c.workload_score, match_score=c.match_score,
        ))
    return results


@router.post(
    "/bookings/{booking_id}/start",
    response_model=DispatchOfferResponse | None,
    summary="Start (or restart) the dispatch queue for a booking",
    description=(
        "Manually (re)starts dispatch for a CONFIRMED, unassigned booking. Normally this "
        "happens automatically when payment is confirmed — this endpoint exists for admin "
        "retry/recovery. Returns null if no eligible candidates remain.\n\n"
        "**Database tables:** `job_dispatches`, `bookings`\n\n"
        "**Permissions:** Requires JWT token (role: admin)"
    ),
    responses={
        404: {"description": "Booking not found"},
        409: {"description": "Booking is not confirmed/unassigned"},
    },
)
async def start_booking_dispatch(
    booking_id: UUID,
    _admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
):
    booking = await db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if booking.booking_status != "CONFIRMED" or booking.partner_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Booking is not confirmed/unassigned")
    dispatch_row = await start_dispatch(booking, db)
    return DispatchOfferResponse.model_validate(dispatch_row) if dispatch_row else None


@router.get(
    "/offers/pending",
    response_model=list[DispatchOfferResponse],
    summary="List my pending job offers",
    description="Returns this partner's currently PENDING dispatch offers.\n\n**Database tables:** `job_dispatches`\n\n**Permissions:** Requires JWT token (role: partner)",
)
async def list_pending_offers(
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(JobDispatch).where(
        JobDispatch.partner_id == partner_id, JobDispatch.status == "PENDING",
    ).order_by(JobDispatch.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [DispatchOfferResponse.model_validate(r) for r in rows]


@router.post(
    "/offers/{dispatch_id}/accept",
    response_model=DispatchOfferResponse,
    summary="Accept a job offer",
    description=(
        "Accepts a pending offer — assigns the booking to this partner "
        "(`booking_status` becomes `PARTNER_ASSIGNED`) and opens a chat thread.\n\n"
        "**Database tables:** `job_dispatches`, `bookings`, `chat_threads`\n\n"
        "**Permissions:** Requires JWT token (role: partner, owning the offer)"
    ),
    responses={
        404: {"description": "Offer not found"},
        409: {"description": "Offer is no longer pending or has expired"},
    },
)
async def accept_dispatch_offer(
    dispatch_id: UUID,
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
):
    dispatch_row = await db.get(JobDispatch, dispatch_id)
    if not dispatch_row or dispatch_row.partner_id != partner_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Offer not found")
    if dispatch_row.status != "PENDING":
        raise HTTPException(status.HTTP_409_CONFLICT, "Offer is no longer pending")
    # acceptance_deadline comes back tz-aware from the DB (timestamptz
    # column) — must compare against a tz-aware "now", not the naive
    # datetime.utcnow() (see services/dispatch/engine.py for why).
    if dispatch_row.acceptance_deadline < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_409_CONFLICT, "Offer has expired")

    booking = await db.get(Booking, dispatch_row.booking_id)
    await accept_offer(dispatch_row, booking, db)
    return DispatchOfferResponse.model_validate(dispatch_row)


@router.post(
    "/offers/{dispatch_id}/decline",
    response_model=DispatchOfferResponse,
    summary="Decline a job offer",
    description=(
        "Declines a pending offer, immediately triggering the next-candidate retry.\n\n"
        "**Database tables:** `job_dispatches`, `bookings`\n\n"
        "**Permissions:** Requires JWT token (role: partner, owning the offer)"
    ),
    responses={
        404: {"description": "Offer not found"},
        409: {"description": "Offer is no longer pending"},
    },
)
async def decline_dispatch_offer(
    dispatch_id: UUID,
    body: DeclineOfferRequest,
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
):
    dispatch_row = await db.get(JobDispatch, dispatch_id)
    if not dispatch_row or dispatch_row.partner_id != partner_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Offer not found")
    if dispatch_row.status != "PENDING":
        raise HTTPException(status.HTTP_409_CONFLICT, "Offer is no longer pending")

    booking = await db.get(Booking, dispatch_row.booking_id)
    await decline_offer(dispatch_row, booking, db)
    return DispatchOfferResponse.model_validate(dispatch_row)


@router.get(
    "/bookings/{booking_id}/history",
    response_model=list[DispatchOfferResponse],
    summary="Get the full dispatch/assignment history for a booking",
    description=(
        "Returns every dispatch offer ever made for this booking, in order — the "
        "permanent assignment history and dispatch log.\n\n"
        "**Database tables:** `job_dispatches`\n\n"
        "**Permissions:** Requires JWT token (consumer/partner owning the booking, or admin)"
    ),
    responses={404: {"description": "Booking not found"}},
)
async def get_dispatch_history(
    booking_id: UUID,
    scope: tuple = Depends(_current_role_and_scope_id),
    db: AsyncSession = Depends(get_db),
):
    role, scope_id = scope
    booking = await db.get(Booking, booking_id)
    if not booking or not _booking_owned_by(booking, role, scope_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    stmt = select(JobDispatch).where(JobDispatch.booking_id == booking_id).order_by(JobDispatch.dispatch_order.asc())
    rows = (await db.execute(stmt)).scalars().all()
    return [DispatchOfferResponse.model_validate(r) for r in rows]


@router.post(
    "/bookings/{booking_id}/override",
    response_model=DispatchOfferResponse,
    summary="Manually assign a specific partner to a booking",
    description=(
        "Bypasses the ranked queue and directly assigns the given partner, expiring any "
        "still-pending offer first. Allowed once payment is confirmed (`CONFIRMED`) or to "
        "reassign an already-`PARTNER_ASSIGNED` booking — not before payment, and not after "
        "the job has started.\n\n"
        "**Database tables:** `job_dispatches`, `bookings`, `chat_threads`\n\n"
        "**Permissions:** Requires JWT token (role: admin)"
    ),
    responses={
        404: {"description": "Booking or partner not found"},
        409: {"description": "Booking is not in a state that can be (re)assigned"},
    },
)
async def override_dispatch(
    booking_id: UUID,
    body: ManualOverrideRequest,
    admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
):
    booking = await db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if booking.booking_status not in ("CONFIRMED", "PARTNER_ASSIGNED"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Booking is not in a state that can be (re)assigned")
    partner = await db.get(Partner, body.partner_id)
    if not partner:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partner not found")

    row = await manual_override(booking, body.partner_id, db)
    await log_admin_action(db, admin_id, "dispatch.manual_override", "booking", booking_id, f"partner_id={body.partner_id}")
    await db.flush()
    return DispatchOfferResponse.model_validate(row)


@router.post(
    "/matches/block",
    status_code=201,
    summary="Block a partner from being matched to a consumer again",
    description=(
        "Consumer or admin action — prevents this partner from ever appearing in this "
        "consumer's dispatch candidates again.\n\n"
        "**Database tables:** `blocked_matches`\n\n"
        "**Permissions:** Requires JWT token (role: consumer or admin)"
    ),
)
async def block_partner_match(
    body: BlockPartnerRequest,
    scope: tuple = Depends(_current_role_and_scope_id),
    db: AsyncSession = Depends(get_db),
):
    role, scope_id = scope
    if role not in ("consumer", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")

    if role == "admin":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Admin block requires a consumer_id — use the consumer's own token instead")

    existing = (await db.execute(
        select(BlockedMatch).where(BlockedMatch.consumer_id == scope_id, BlockedMatch.partner_id == body.partner_id)
    )).scalar_one_or_none()
    if existing:
        return {"blocked": True}

    db.add(BlockedMatch(consumer_id=scope_id, partner_id=body.partner_id, blocked_by=role.upper(), reason=body.reason))
    await db.flush()
    return {"blocked": True}


@router.get(
    "/analytics",
    response_model=DispatchAnalyticsResponse,
    summary="Dispatch analytics",
    description=(
        "Aggregate dispatch performance stats: acceptance rate, average attempts per "
        "booking, average partner response time, and top partners by offer volume.\n\n"
        "**Database tables:** `job_dispatches`, `bookings` (read-only)\n\n"
        "**Permissions:** Requires JWT token (role: admin)"
    ),
)
async def dispatch_analytics(
    _admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
):
    return await get_dispatch_analytics(db)


@router.post(
    "/process-expired",
    response_model=DispatchSweepResponse,
    summary="Manually run one expiry-sweep cycle",
    description=(
        "Expires any PENDING offer past its acceptance_deadline and retries the next "
        "candidate for that booking. Runs automatically every "
        "`DISPATCH_SWEEP_INTERVAL_SECONDS` in the background — this endpoint exists for "
        "on-demand/testing use.\n\n"
        "**Database tables:** `job_dispatches`, `bookings`\n\n"
        "**Permissions:** Requires JWT token (role: admin)"
    ),
)
async def process_expired_offers(
    _admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
):
    return await run_expiry_sweep(db)


@router.patch(
    "/bookings/{booking_id}/status",
    summary="Update a booking's post-assignment status",
    description=(
        "Progresses a booking through EN_ROUTE -> ARRIVED -> IN_PROGRESS -> COMPLETED "
        "(or cancels it), recording every transition in `booking_status_history` and "
        "broadcasting it in real time to the booking's Socket.IO room "
        "(`booking:status_update`, see docs/SOCKET_ARCHITECTURE.md).\n\n"
        "**Database tables:** `bookings`, `booking_status_history`\n\n"
        "**Permissions:** Requires JWT token (role: partner, assigned to this booking)"
    ),
    responses={
        404: {"description": "Booking not found"},
        409: {"description": "That status transition isn't allowed from the current status"},
    },
)
async def update_booking_status(
    booking_id: UUID,
    body: BookingStatusUpdateRequest,
    partner_id: UUID = Depends(get_current_partner_id),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    booking = await db.get(Booking, booking_id)
    if not booking or booking.partner_id != partner_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")

    allowed = _ALLOWED_TRANSITIONS.get(booking.booking_status, set())
    if body.new_status not in allowed:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot move from {booking.booking_status} to {body.new_status}",
        )

    old_status = booking.booking_status
    booking.booking_status = body.new_status
    if body.new_status == "COMPLETED":
        booking.completed_at = datetime.now(timezone.utc)
        partner = await db.get(Partner, partner_id)
        partner.total_completed_jobs = (partner.total_completed_jobs or 0) + 1
    elif body.new_status == "CANCELLED_BY_PARTNER":
        booking.cancelled_at = datetime.now(timezone.utc)
        booking.cancellation_reason = body.remarks

    db.add(BookingStatusHistory(
        booking_id=booking.id, old_status=old_status, new_status=body.new_status,
        changed_by_user_id=user_id, remarks=body.remarks,
    ))
    await db.flush()

    await events.emit("booking.status_changed", {
        "booking_id": str(booking.id), "old_status": old_status, "new_status": body.new_status,
    })
    return {"booking_id": str(booking.id), "old_status": old_status, "new_status": body.new_status}
