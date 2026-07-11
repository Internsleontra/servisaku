import uuid as uuid_mod
from datetime import timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from auth import get_current_consumer_id
from models.catalog import Service, ServiceCategory
from models.consumer_address import ConsumerAddress
from models.consumer_profile import ConsumerProfile
from models.auth import User
from models.booking import Booking
from schemas.consumer import (
    ServiceCategoryResponse, ServiceResponse, AddressCreate, AddressResponse,
    BookingCreate, BookingResponse,
)
from services.notifications.dispatcher import dispatch
from utils.time import utc_now

router = APIRouter(prefix="/consumer", tags=["Consumer"])


def _booking_to_response(b: Booking) -> BookingResponse:
    return BookingResponse(
        id=b.id, booking_reference=b.booking_reference, booking_status=b.booking_status,
        service_id=b.service_id, service_name=b.service.name if b.service else "",
        address_id=b.address_id, scheduled_date=b.scheduled_date, time_slot=b.time_slot,
        slot_start_time=b.slot_start_time, slot_end_time=b.slot_end_time,
        subtotal_rm=b.subtotal_rm, total_amount_rm=b.total_amount_rm, created_at=b.created_at,
    )


@router.get(
    "/service-categories",
    response_model=list[ServiceCategoryResponse],
    summary="List service categories",
    description="Returns active service categories (managed by the Admin Catalog module).\n\n**Database tables:** `service_categories`\n\n**Permissions:** Requires JWT token (role: consumer)",
    responses={401: {"description": "Missing or invalid token"}},
)
async def list_categories(
    _consumer_id: UUID = Depends(get_current_consumer_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ServiceCategory).where(ServiceCategory.is_active == True).order_by(ServiceCategory.name)  # noqa: E712
    return (await db.execute(stmt)).scalars().all()


@router.get(
    "/services",
    response_model=list[ServiceResponse],
    summary="List bookable services",
    description="Returns active services, optionally filtered by category.\n\n**Database tables:** `services`\n\n**Permissions:** Requires JWT token (role: consumer)",
    responses={401: {"description": "Missing or invalid token"}},
)
async def list_services(
    category_id: UUID | None = None,
    _consumer_id: UUID = Depends(get_current_consumer_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Service).where(Service.is_active == True)  # noqa: E712
    if category_id:
        stmt = stmt.where(Service.category_id == category_id)
    stmt = stmt.order_by(Service.name)
    return (await db.execute(stmt)).scalars().all()


@router.post(
    "/addresses",
    response_model=AddressResponse,
    status_code=201,
    summary="Add a saved address",
    description="Creates a saved address for the current consumer, used as a booking's service location.\n\n**Database tables:** `consumer_addresses`\n\n**Permissions:** Requires JWT token (role: consumer)",
    responses={401: {"description": "Missing or invalid token"}, 422: {"description": "Validation error (e.g. postcode too short)"}},
)
async def create_address(
    body: AddressCreate,
    consumer_id: UUID = Depends(get_current_consumer_id),
    db: AsyncSession = Depends(get_db),
):
    address = ConsumerAddress(consumer_id=consumer_id, **body.model_dump())
    db.add(address)
    await db.flush()
    return address


@router.get(
    "/addresses",
    response_model=list[AddressResponse],
    summary="List saved addresses",
    description="Returns the current consumer's saved addresses.\n\n**Database tables:** `consumer_addresses`\n\n**Permissions:** Requires JWT token (role: consumer)",
    responses={401: {"description": "Missing or invalid token"}},
)
async def list_addresses(
    consumer_id: UUID = Depends(get_current_consumer_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ConsumerAddress)
        .where(ConsumerAddress.consumer_id == consumer_id)
        .order_by(ConsumerAddress.created_at.desc())
    )
    return (await db.execute(stmt)).scalars().all()


@router.post(
    "/bookings",
    response_model=BookingResponse,
    status_code=201,
    summary="Create a booking",
    description=(
        "Creates a booking for a service at a saved address, priced at the service's "
        "starting price (no surge/tax/coupon logic — that belongs to the full Booking "
        "Engine, out of scope here). Status starts as `PENDING_PAYMENT`; call "
        "`POST /payments/bookings/{booking_id}/bill` next to collect payment.\n\n"
        "**Database tables:** `bookings`\n\n"
        "**Permissions:** Requires JWT token (role: consumer)"
    ),
    responses={
        401: {"description": "Missing or invalid token"},
        404: {"description": "Service or address not found", "content": {"application/json": {"example": {"detail": "Address not found"}}}},
        422: {"description": "Validation error (e.g. invalid time_slot)"},
    },
)
async def create_booking(
    body: BookingCreate,
    consumer_id: UUID = Depends(get_current_consumer_id),
    db: AsyncSession = Depends(get_db),
):
    service = await db.get(Service, body.service_id)
    if not service or not service.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")

    address = await db.get(ConsumerAddress, body.address_id)
    if not address or address.consumer_id != consumer_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Address not found")

    subtotal = service.starting_price_rm
    booking = Booking(
        booking_reference=f"BK-{uuid_mod.uuid4().hex[:10].upper()}",
        consumer_id=consumer_id,
        address_id=address.id,
        service_id=service.id,
        booking_status="PENDING_PAYMENT",
        time_slot=body.time_slot,
        scheduled_date=body.scheduled_date,
        slot_start_time=body.slot_start_time,
        slot_end_time=body.slot_end_time,
        estimated_duration_minutes=service.estimated_duration_minutes,
        special_instructions=body.special_instructions,
        subtotal_rm=subtotal,
        surge_multiplier=Decimal("1.00"),
        discount_rm=Decimal("0.00"),
        tax_rm=Decimal("0.00"),
        total_amount_rm=subtotal,
        payment_due_at=utc_now() + timedelta(hours=1),
    )
    db.add(booking)
    await db.flush()

    profile = await db.get(ConsumerProfile, consumer_id)
    user = await db.get(User, profile.user_id) if profile else None
    if user:
        # Dispatched inline (same session), not via BackgroundTasks — this
        # notification references booking_id, which has a live FK to
        # bookings.id. A background task opens its own session/transaction,
        # which isn't guaranteed to see this same-request row yet.
        await dispatch(
            user_id=user.id, category="booking", channels=("PUSH", "EMAIL"), db=db,
            title="Booking created", body=f"Your booking {booking.booking_reference} for {service.name} is awaiting payment.",
            notification_type="booking_created", booking_id=booking.id,
            email_to=user.email,
        )
    booking.service = service
    return _booking_to_response(booking)


@router.get(
    "/bookings",
    response_model=list[BookingResponse],
    summary="List my bookings",
    description="Returns the current consumer's bookings, most recent first.\n\n**Database tables:** `bookings`\n\n**Permissions:** Requires JWT token (role: consumer)",
    responses={401: {"description": "Missing or invalid token"}},
)
async def list_bookings(
    consumer_id: UUID = Depends(get_current_consumer_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Booking)
        .options(selectinload(Booking.service))
        .where(Booking.consumer_id == consumer_id)
        .order_by(Booking.created_at.desc())
    )
    bookings = (await db.execute(stmt)).scalars().all()
    return [_booking_to_response(b) for b in bookings]
