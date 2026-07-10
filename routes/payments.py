import uuid as uuid_mod
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from auth import oauth2_scheme, decode_token, get_current_user_id, get_current_admin_id, get_current_consumer_id
from config import get_settings
from models.auth import User
from models.partner import Partner
from models.consumer_profile import ConsumerProfile
from models.booking import Booking
from models.payment import Payment, Refund
from schemas.payment import (
    BillCreateRequest, BillCreateResponse, PaymentResponse,
    RefundRequest, RefundResponse, RefundCompleteRequest, TransactionResponse,
)
from services import billplz_service

router = APIRouter(prefix="/payments", tags=["Payments"])
settings = get_settings()


async def _current_role_and_scope_id(
    token: str = Depends(oauth2_scheme),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> tuple[str, UUID]:
    """Returns (role, scope_id) — scope_id is consumer_id/partner_id/user_id
    depending on role. Used to authorize access to a payment/refund via its
    booking, which can belong to either party (or be viewed by an admin)."""
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


async def _get_owned_payment(payment_id: UUID, role: str, scope_id: UUID, db: AsyncSession) -> Payment:
    stmt = select(Payment).options(selectinload(Payment.booking)).where(Payment.id == payment_id)
    payment = (await db.execute(stmt)).scalar_one_or_none()
    if not payment or not _booking_owned_by(payment.booking, role, scope_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    return payment


async def _release_escrow(payment: Payment) -> None:
    if payment.status == "HELD_IN_ESCROW":
        payment.status = "RELEASED"


@router.post(
    "/bookings/{booking_id}/bill",
    response_model=BillCreateResponse,
    summary="Create a Billplz bill for a booking",
    description=(
        "Creates (or reuses a still-pending) Billplz bill for a `PENDING_PAYMENT` booking "
        "and returns the hosted bill page URL to redirect the consumer to.\n\n"
        "**Database tables:** `payments`, `bookings`\n\n"
        "**Permissions:** Requires JWT token (role: consumer, owning the booking)"
    ),
    responses={
        404: {"description": "Booking not found"},
        409: {"description": "Booking is not awaiting payment"},
        422: {"description": "Consumer has no email or phone on file"},
        503: {"description": "Billplz is not configured"},
    },
)
async def create_bill(
    booking_id: UUID,
    body: BillCreateRequest,
    consumer_id: UUID = Depends(get_current_consumer_id),
    db: AsyncSession = Depends(get_db),
):
    booking = await db.get(Booking, booking_id)
    if not booking or booking.consumer_id != consumer_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if booking.booking_status != "PENDING_PAYMENT":
        raise HTTPException(status.HTTP_409_CONFLICT, "Booking is not awaiting payment")

    existing = (await db.execute(
        select(Payment)
        .where(Payment.booking_id == booking_id, Payment.status == "INITIATED")
        .order_by(Payment.created_at.desc())
    )).scalars().first()
    if existing:
        bill = await billplz_service.get_bill(existing.gateway_transaction_id)
        return BillCreateResponse(
            payment_id=existing.id, bill_url=bill["url"],
            amount_rm=existing.amount_rm, status=existing.status,
        )

    profile = await db.get(ConsumerProfile, consumer_id)
    user = await db.get(User, profile.user_id)

    bill = await billplz_service.create_bill(
        amount=booking.total_amount_rm,
        name=profile.full_name,
        email=user.email,
        mobile=user.phone_number,
        description=f"ServisAku booking {booking.booking_reference}",
        reference_1_label="Booking",
        reference_1=booking.booking_reference,
    )

    payment = Payment(
        booking_id=booking.id, consumer_id=consumer_id,
        payment_reference=f"PAY-{uuid_mod.uuid4().hex[:10].upper()}",
        payment_method=body.payment_method, payment_gateway="BILLPLZ",
        gateway_transaction_id=bill["id"], amount_rm=booking.total_amount_rm,
        currency="MYR", status="INITIATED",
    )
    db.add(payment)
    await db.flush()

    return BillCreateResponse(
        payment_id=payment.id, bill_url=bill["url"],
        amount_rm=payment.amount_rm, status=payment.status,
    )


@router.post(
    "/billplz/callback",
    summary="Billplz callback receiver",
    description=(
        "Receives payment confirmation from Billplz as a form-encoded POST. Verifies "
        "`x_signature` against `BILLPLZ_X_SIGNATURE_KEY` before trusting the payload.\n\n"
        "**Database tables:** `payments`, `bookings`\n\n"
        "**Permissions:** Public (authenticated via X-Signature, not a JWT)"
    ),
    responses={200: {"description": "Callback processed"}},
)
async def billplz_callback(request: Request, db: AsyncSession = Depends(get_db)):
    form = await request.form()
    data = dict(form)

    verified = billplz_service.verify_callback_signature(data)

    stmt = select(Payment).options(selectinload(Payment.booking)).where(
        Payment.gateway_transaction_id == data.get("id")
    )
    payment = (await db.execute(stmt)).scalar_one_or_none()
    if not payment:
        return {"received": True}

    payment.hmac_verified = verified
    if not verified:
        return {"received": True}

    paid = str(data.get("paid")).lower() == "true"
    if paid and payment.status == "INITIATED":
        payment.status = "HELD_IN_ESCROW"
        payment.authorized_at = datetime.utcnow()
        if payment.booking and payment.booking.booking_status == "PENDING_PAYMENT":
            payment.booking.booking_status = "CONFIRMED"
            payment.booking.confirmed_at = datetime.utcnow()
        await db.flush()
    elif not paid and payment.status == "INITIATED":
        payment.status = "FAILED"
        payment.failed_at = datetime.utcnow()
        payment.failure_reason = "Billplz reported bill as unpaid"
        await db.flush()

    return {"received": True}


@router.get(
    "/transactions",
    response_model=list[TransactionResponse],
    summary="Get transaction history",
    description=(
        "Returns a merged, most-recent-first history of payments and refunds for the "
        "current user's bookings (their own bookings for a consumer, assigned bookings "
        "for a partner).\n\n"
        "**Database tables:** `payments`, `refunds`, `bookings`\n\n"
        "**Permissions:** Requires JWT token (role: consumer or partner)"
    ),
)
async def get_transactions(
    scope: tuple = Depends(_current_role_and_scope_id),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
):
    role, scope_id = scope
    if role not in ("consumer", "partner"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")

    booking_filter = Booking.consumer_id == scope_id if role == "consumer" else Booking.partner_id == scope_id

    payments_stmt = (
        select(Payment)
        .join(Booking, Payment.booking_id == Booking.id)
        .options(selectinload(Payment.booking).selectinload(Booking.service))
        .where(booking_filter)
        .order_by(Payment.created_at.desc())
        .limit(200)
    )
    payments = (await db.execute(payments_stmt)).scalars().all()

    refunds_stmt = (
        select(Refund)
        .join(Booking, Refund.booking_id == Booking.id)
        .options(selectinload(Refund.payment))
        .where(booking_filter)
        .order_by(Refund.created_at.desc())
        .limit(200)
    )
    refunds = (await db.execute(refunds_stmt)).scalars().all()

    transactions = [
        TransactionResponse(
            id=p.id, booking_id=p.booking_id,
            service_name=p.booking.service.name if p.booking and p.booking.service else "",
            amount_rm=p.amount_rm, status=p.status, type="payment", created_at=p.created_at,
        )
        for p in payments
    ] + [
        TransactionResponse(
            id=r.id, booking_id=r.booking_id, service_name="",
            amount_rm=r.amount_rm, status=r.status, type="refund", created_at=r.created_at,
        )
        for r in refunds
    ]
    transactions.sort(key=lambda t: t.created_at, reverse=True)
    return transactions[offset:offset + limit]


@router.get(
    "/bookings/{booking_id}",
    response_model=list[PaymentResponse],
    summary="Get payments for a booking",
    description="Returns all payment attempts for a booking.\n\n**Database tables:** `payments`\n\n**Permissions:** Requires JWT token (consumer/partner owning the booking, or admin)",
)
async def get_booking_payments(
    booking_id: UUID,
    scope: tuple = Depends(_current_role_and_scope_id),
    db: AsyncSession = Depends(get_db),
):
    role, scope_id = scope
    booking = await db.get(Booking, booking_id)
    if not booking or not _booking_owned_by(booking, role, scope_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    stmt = select(Payment).where(Payment.booking_id == booking_id).order_by(Payment.created_at.desc())
    payments = (await db.execute(stmt)).scalars().all()
    return [PaymentResponse.model_validate(p) for p in payments]


@router.get(
    "/{payment_id}",
    response_model=PaymentResponse,
    summary="Get payment details",
    description="Returns a single payment by ID.\n\n**Database tables:** `payments`\n\n**Permissions:** Requires JWT token (consumer/partner owning the booking, or admin)",
    responses={404: {"description": "Payment not found"}},
)
async def get_payment(
    payment_id: UUID,
    scope: tuple = Depends(_current_role_and_scope_id),
    db: AsyncSession = Depends(get_db),
):
    role, scope_id = scope
    payment = await _get_owned_payment(payment_id, role, scope_id, db)
    return PaymentResponse.model_validate(payment)


@router.post(
    "/{payment_id}/sync",
    response_model=PaymentResponse,
    summary="Verify payment status against Billplz",
    description=(
        "Re-fetches the bill from Billplz and updates the local record. Use this during "
        "local development, where Billplz callbacks may not be able to reach this server.\n\n"
        "**Database tables:** `payments`, `bookings`\n\n"
        "**Permissions:** Requires JWT token (consumer/partner owning the booking, or admin)"
    ),
    responses={404: {"description": "Payment not found"}, 503: {"description": "Billplz is not configured"}},
)
async def sync_payment(
    payment_id: UUID,
    scope: tuple = Depends(_current_role_and_scope_id),
    db: AsyncSession = Depends(get_db),
):
    role, scope_id = scope
    payment = await _get_owned_payment(payment_id, role, scope_id, db)
    if payment.payment_gateway != "BILLPLZ":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Sync is only implemented for the BILLPLZ gateway")

    bill = await billplz_service.get_bill(payment.gateway_transaction_id)
    paid = bool(bill.get("paid"))
    if paid and payment.status == "INITIATED":
        payment.status = "HELD_IN_ESCROW"
        payment.authorized_at = datetime.utcnow()
        if payment.booking and payment.booking.booking_status == "PENDING_PAYMENT":
            payment.booking.booking_status = "CONFIRMED"
            payment.booking.confirmed_at = datetime.utcnow()
        await db.flush()
    return PaymentResponse.model_validate(payment)


@router.post(
    "/{payment_id}/release",
    response_model=PaymentResponse,
    summary="Release a payment from escrow",
    description=(
        "Releases a captured payment from escrow so it becomes payable to the partner. "
        "There is no automatic booking-completion trigger yet (booking lifecycle/dispatch "
        "is a later stage), so this is a manual admin action for now.\n\n"
        "**Database tables:** `payments`\n\n"
        "**Permissions:** Requires JWT token (role: admin)"
    ),
    responses={404: {"description": "Payment not found"}, 409: {"description": "Payment is not held in escrow"}},
)
async def release_payment(
    payment_id: UUID,
    _admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
):
    payment = await db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    if payment.status != "HELD_IN_ESCROW":
        raise HTTPException(status.HTTP_409_CONFLICT, "Payment is not held in escrow")
    payment.status = "RELEASED"
    await db.flush()
    return PaymentResponse.model_validate(payment)


@router.post(
    "/{payment_id}/refunds",
    response_model=RefundResponse,
    status_code=201,
    summary="Request a refund",
    description=(
        "Requests a full or partial refund for a captured/escrowed/released payment. "
        "Refunds always require admin approval before being processed.\n\n"
        "**Database tables:** `refunds`\n\n"
        "**Permissions:** Requires JWT token (consumer owning the booking, or admin)"
    ),
    responses={
        404: {"description": "Payment not found"},
        409: {"description": "Payment is not refundable, or amount exceeds remaining balance"},
    },
)
async def request_refund(
    payment_id: UUID,
    body: RefundRequest,
    scope: tuple = Depends(_current_role_and_scope_id),
    db: AsyncSession = Depends(get_db),
):
    role, scope_id = scope
    if role not in ("consumer", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
    payment = await _get_owned_payment(payment_id, role, scope_id, db)
    if payment.status not in ("HELD_IN_ESCROW", "RELEASED", "PARTIALLY_REFUNDED"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Payment is not refundable")

    already_refunded = sum(
        (r.amount_rm for r in (await db.execute(
            select(Refund).where(Refund.payment_id == payment.id, Refund.status == "COMPLETED")
        )).scalars().all()),
        Decimal("0"),
    )
    remaining = payment.amount_rm - already_refunded
    refund_amount = body.amount if body.amount is not None else remaining
    if refund_amount <= 0 or refund_amount > remaining:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Refund amount must be between 0 and {remaining}")

    refund = Refund(
        booking_id=payment.booking_id, payment_id=payment.id,
        refund_reference=f"RFD-{uuid_mod.uuid4().hex[:10].upper()}",
        amount_rm=refund_amount, is_partial=refund_amount < remaining,
        reason=body.reason, status="PENDING_APPROVAL", requires_approval=True,
    )
    db.add(refund)
    await db.flush()
    return RefundResponse.model_validate(refund)


@router.post(
    "/refunds/{refund_id}/approve",
    response_model=RefundResponse,
    summary="Approve a refund request",
    description=(
        "Approves a pending refund. Billplz's core Bills API has no documented "
        "self-service refund endpoint, so the actual money movement is a manual "
        "step via the Billplz dashboard/Payment Order — call "
        "`POST /refunds/{refund_id}/complete` once that's done.\n\n"
        "**Database tables:** `refunds`\n\n"
        "**Permissions:** Requires JWT token (role: admin)"
    ),
    responses={404: {"description": "Refund not found"}, 409: {"description": "Refund is not pending approval"}},
)
async def approve_refund(
    refund_id: UUID,
    admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
):
    refund = await db.get(Refund, refund_id)
    if not refund:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Refund not found")
    if refund.status != "PENDING_APPROVAL":
        raise HTTPException(status.HTTP_409_CONFLICT, "Refund is not pending approval")
    refund.status = "APPROVED"
    refund.approved_by_user_id = admin_id
    await db.flush()
    return RefundResponse.model_validate(refund)


@router.post(
    "/refunds/{refund_id}/reject",
    response_model=RefundResponse,
    summary="Reject a refund request",
    description="Rejects a pending refund request.\n\n**Database tables:** `refunds`\n\n**Permissions:** Requires JWT token (role: admin)",
    responses={404: {"description": "Refund not found"}, 409: {"description": "Refund is not pending approval"}},
)
async def reject_refund(
    refund_id: UUID,
    admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
):
    refund = await db.get(Refund, refund_id)
    if not refund:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Refund not found")
    if refund.status != "PENDING_APPROVAL":
        raise HTTPException(status.HTTP_409_CONFLICT, "Refund is not pending approval")
    refund.status = "REJECTED"
    refund.approved_by_user_id = admin_id
    await db.flush()
    return RefundResponse.model_validate(refund)


@router.post(
    "/refunds/{refund_id}/complete",
    response_model=RefundResponse,
    summary="Mark a refund as completed",
    description=(
        "Marks an approved refund as completed once it has actually been executed "
        "(manually, via the Billplz dashboard/Payment Order). Updates the linked "
        "payment's status to REFUNDED or PARTIALLY_REFUNDED.\n\n"
        "**Database tables:** `refunds`, `payments`\n\n"
        "**Permissions:** Requires JWT token (role: admin)"
    ),
    responses={404: {"description": "Refund not found"}, 409: {"description": "Refund is not approved"}},
)
async def complete_refund(
    refund_id: UUID,
    body: RefundCompleteRequest,
    _admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
):
    refund = await db.get(Refund, refund_id)
    if not refund:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Refund not found")
    if refund.status != "APPROVED":
        raise HTTPException(status.HTTP_409_CONFLICT, "Refund is not approved")

    refund.status = "COMPLETED"
    refund.gateway_refund_id = body.gateway_refund_id
    refund.processed_at = datetime.utcnow()
    await db.flush()

    payment = await db.get(Payment, refund.payment_id)
    total_refunded = sum(
        (r.amount_rm for r in (await db.execute(
            select(Refund).where(Refund.payment_id == payment.id, Refund.status == "COMPLETED")
        )).scalars().all()),
        Decimal("0"),
    )
    payment.status = "REFUNDED" if total_refunded >= payment.amount_rm else "PARTIALLY_REFUNDED"
    await db.flush()

    return RefundResponse.model_validate(refund)
