import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import String, Text, Boolean, Integer, Numeric, DateTime, Time, ForeignKey
from sqlalchemy import Enum as PgEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

SURGE_TRIGGER_VALUES = ("PUBLIC_HOLIDAY", "WEEKEND", "PEAK_HOUR", "HIGH_DEMAND")


class ServiceCategory(Base):
    """Mapping of the shared `service_categories` table. Read-only through
    Stage 3; full CRUD added in Stage 6 (Admin Catalog — routes/admin_catalog.py)."""

    __tablename__ = "service_categories"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    inclusions: Mapped[str | None] = mapped_column(Text)
    exclusions: Mapped[str | None] = mapped_column(Text)
    icon_s3_key: Mapped[str | None] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int | None] = mapped_column(Integer, default=0)
    commission_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), default=Decimal("20.00"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Service(Base):
    """Mapping of the shared `services` table. Read-only through Stage 3; full
    CRUD added in Stage 6 (Admin Catalog — routes/admin_catalog.py)."""

    __tablename__ = "services"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("service_categories.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    inclusions: Mapped[str | None] = mapped_column(Text)
    exclusions: Mapped[str | None] = mapped_column(Text)
    estimated_duration_minutes: Mapped[int | None] = mapped_column(Integer)
    starting_price_rm: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    category: Mapped["ServiceCategory"] = relationship()


class ServiceAddon(Base):
    """Mapping of the shared `service_addons` table (pre-existing, empty)."""

    __tablename__ = "service_addons"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    price_rm: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class PricingRule(Base):
    """Mapping of the shared `pricing_rules` table (pre-existing, empty).
    `pricing_type` is a plain varchar in the live schema (e.g. FLAT/PER_UNIT),
    not a DB enum."""

    __tablename__ = "pricing_rules"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"), nullable=False)
    rule_name: Mapped[str] = mapped_column(String(150), nullable=False)
    pricing_type: Mapped[str] = mapped_column(String(30), nullable=False)
    base_price_rm: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    unit_price_rm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    min_units: Mapped[int | None] = mapped_column(Integer, default=1)
    max_units: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class SurgePricingRule(Base):
    """Mapping of the shared `surge_pricing_rules` table (pre-existing, empty)."""

    __tablename__ = "surge_pricing_rules"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    service_category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("service_categories.id"))
    rule_name: Mapped[str] = mapped_column(String(150), nullable=False)
    trigger_type: Mapped[str] = mapped_column(PgEnum(*SURGE_TRIGGER_VALUES, name="surge_trigger", create_type=False), nullable=False)
    day_type: Mapped[str | None] = mapped_column(String(20))
    start_time: Mapped[Time | None] = mapped_column(Time)
    end_time: Mapped[Time | None] = mapped_column(Time)
    demand_threshold: Mapped[int | None] = mapped_column(Integer)
    multiplier: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
