import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import String, Text, Boolean, Numeric, DateTime, ForeignKey
from sqlalchemy import Enum as PgEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from utils.time import utc_now

PAYMENT_METHOD_VALUES = ("FPX", "DUITNOW_QR", "CREDIT_CARD", "DEBIT_CARD", "SERVISAKU_CREDIT")
PAYMENT_GATEWAY_VALUES = ("IPAY88", "BILLPLZ")
PAYMENT_STATUS_VALUES = (
    "INITIATED", "AUTHORIZED", "CAPTURED", "FAILED",
    "HELD_IN_ESCROW", "RELEASED", "REFUNDED", "PARTIALLY_REFUNDED",
)
REFUND_STATUS_VALUES = ("REQUESTED", "PENDING_APPROVAL", "APPROVED", "PROCESSING", "COMPLETED", "REJECTED", "FAILED")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    consumer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("consumer_profiles.id"), nullable=False)
    payment_reference: Mapped[str] = mapped_column(String(40), nullable=False)
    payment_method: Mapped[str] = mapped_column(PgEnum(*PAYMENT_METHOD_VALUES, name="payment_method", create_type=False), nullable=False)
    payment_gateway: Mapped[str] = mapped_column(PgEnum(*PAYMENT_GATEWAY_VALUES, name="payment_gateway", create_type=False), nullable=False)
    gateway_transaction_id: Mapped[str | None] = mapped_column(String(100))
    amount_rm: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="MYR", nullable=False)
    status: Mapped[str] = mapped_column(PgEnum(*PAYMENT_STATUS_VALUES, name="payment_status", create_type=False), default="INITIATED", nullable=False)
    hmac_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    authorized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    booking: Mapped["Booking"] = relationship()
    refunds: Mapped[list["Refund"]] = relationship(back_populates="payment")


class Refund(Base):
    __tablename__ = "refunds"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    payment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("payments.id"), nullable=False)
    refund_reference: Mapped[str] = mapped_column(String(40), nullable=False)
    amount_rm: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_partial: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(PgEnum(*REFUND_STATUS_VALUES, name="refund_status", create_type=False), default="REQUESTED", nullable=False)
    # requires_approval is NOT mapped here: live schema has it as
    # `GENERATED ALWAYS AS (amount_rm > 100 AND is_partial = true) STORED`
    # (verified via information_schema.columns) — Postgres rejects any
    # explicit INSERT value for it, same class of bug as
    # `audit_logs.retention_until` (see models/admin_log.py). It isn't
    # exposed in RefundResponse (schemas/payment.py) either, so there's
    # nothing this app needs to read back.
    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    gateway_refund_id: Mapped[str | None] = mapped_column(String(100))
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    payment: Mapped["Payment"] = relationship(back_populates="refunds")


from models.booking import Booking  # noqa: E402, F811
