import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import String, Text, Boolean, Integer, Numeric, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from database import Base

# discount_type is a plain varchar in the live schema (not a Postgres enum) —
# this app-level convention is enforced in schemas/coupon.py, not the DB.
DISCOUNT_TYPE_VALUES = ("PERCENTAGE", "FIXED_AMOUNT")


class Coupon(Base):
    """Mapping of the shared `coupons` table (pre-existing, empty)."""

    __tablename__ = "coupons"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    discount_type: Mapped[str] = mapped_column(String(20), nullable=False)
    discount_value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    max_discount_rm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    min_booking_value_rm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), default=Decimal("0.00"))
    usage_limit_total: Mapped[int | None] = mapped_column(Integer)
    usage_limit_per_consumer: Mapped[int | None] = mapped_column(Integer, default=1)
    uses_count: Mapped[int | None] = mapped_column(Integer, default=0)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class CouponServiceCategory(Base):
    """Mapping of the shared `coupon_service_categories` join table
    (pre-existing, empty) — restricts a coupon to specific service
    categories; no rows means the coupon applies platform-wide."""

    __tablename__ = "coupon_service_categories"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    coupon_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("coupons.id", ondelete="CASCADE"), nullable=False)
    service_category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("service_categories.id", ondelete="CASCADE"), nullable=False)
