import uuid
from datetime import datetime, date, time
from decimal import Decimal

from sqlalchemy import String, Text, Boolean, Integer, SmallInteger, Numeric, Date, Time, DateTime, ForeignKey
from sqlalchemy import Enum as PgEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

BOOKING_STATUS_VALUES = (
    "PENDING_PAYMENT", "CONFIRMED", "PARTNER_ASSIGNED", "EN_ROUTE", "ARRIVED",
    "IN_PROGRESS", "COMPLETED", "CANCELLED_BY_CONSUMER", "CANCELLED_BY_PARTNER",
    "CONSUMER_NO_SHOW", "PARTNER_NO_SHOW", "DISPUTED", "REFUNDED",
)
TIME_SLOT_VALUES = ("MORNING", "AFTERNOON", "EVENING")
RECURRENCE_PATTERN_VALUES = ("WEEKLY", "FORTNIGHTLY", "MONTHLY")


class Booking(Base):
    """Mapping of the shared `bookings` table (owned by the Booking Engine
    module). Payments, Smart Dispatch (services/dispatch/), and the
    post-assignment status progression (EN_ROUTE/ARRIVED/IN_PROGRESS/
    COMPLETED, see routes/dispatch.py) all operate on this table. Cancellation,
    recurrence, and coupons are still not implemented here."""

    __tablename__ = "bookings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_reference: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    consumer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("consumer_profiles.id"), nullable=False)
    address_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("consumer_addresses.id"), nullable=False)
    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("services.id"), nullable=False)
    partner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("partners.id"))
    booking_status: Mapped[str] = mapped_column(PgEnum(*BOOKING_STATUS_VALUES, name="booking_status", create_type=False), default="PENDING_PAYMENT", nullable=False)
    time_slot: Mapped[str] = mapped_column(PgEnum(*TIME_SLOT_VALUES, name="time_slot", create_type=False), nullable=False)
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False)
    slot_start_time: Mapped[time] = mapped_column(Time, nullable=False)
    slot_end_time: Mapped[time] = mapped_column(Time, nullable=False)
    estimated_duration_minutes: Mapped[int | None] = mapped_column(Integer)
    special_instructions: Mapped[str | None] = mapped_column(Text)
    subtotal_rm: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    surge_multiplier: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), default=Decimal("1.00"))
    surge_label: Mapped[str | None] = mapped_column(String(60))
    discount_rm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=Decimal("0.00"))
    tax_rm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=Decimal("0.00"))
    cancellation_fee_rm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    total_amount_rm: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # coupon_id / recurrence_parent_id: plain UUIDs, not declared as SQLAlchemy
    # ForeignKeys — this app doesn't map `coupons` and doesn't need recursive
    # self-joins, matching the jobs.booking_id precedent (models/job.py).
    coupon_id: Mapped[uuid.UUID | None] = mapped_column()
    is_recurring: Mapped[bool | None] = mapped_column(Boolean, default=False)
    recurrence_pattern: Mapped[str | None] = mapped_column(PgEnum(*RECURRENCE_PATTERN_VALUES, name="recurrence_pattern", create_type=False))
    recurrence_parent_id: Mapped[uuid.UUID | None] = mapped_column()
    dispatch_attempts: Mapped[int | None] = mapped_column(SmallInteger, default=0)
    partner_accept_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    payment_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consumer_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    service: Mapped["Service"] = relationship()
    address: Mapped["ConsumerAddress"] = relationship()


class BookingStatusHistory(Base):
    """Mapping of the shared `booking_status_history` table (pre-existing,
    empty) — an append-only log of every booking_status transition, used by
    the post-assignment status-update endpoint (routes/dispatch.py)."""

    __tablename__ = "booking_status_history"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    old_status: Mapped[str | None] = mapped_column(PgEnum(*BOOKING_STATUS_VALUES, name="booking_status", create_type=False))
    new_status: Mapped[str] = mapped_column(PgEnum(*BOOKING_STATUS_VALUES, name="booking_status", create_type=False), nullable=False)
    changed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    remarks: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


from models.catalog import Service  # noqa: E402, F811
from models.consumer_address import ConsumerAddress  # noqa: E402, F811
