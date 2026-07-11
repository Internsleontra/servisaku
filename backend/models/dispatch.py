import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import String, Text, Integer, Numeric, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy import Enum as PgEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from utils.time import utc_now

DISPATCH_STATUS_VALUES = ("PENDING", "ACCEPTED", "DECLINED", "EXPIRED")


class JobDispatch(Base):
    """Mapping of the shared `job_dispatches` table (pre-existing, empty,
    purpose-built for this stage — discovered via live schema introspection
    before writing this model). Doubles as both the active offer queue (one
    row per partner a booking has been offered to, in dispatch_order) and the
    permanent dispatch/assignment log (rows are never deleted, only their
    status changes) — there's no separate log/history table because this one
    already serves that role."""

    __tablename__ = "job_dispatches"
    __table_args__ = (UniqueConstraint("booking_id", "partner_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("partners.id"), nullable=False)
    dispatch_order: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    match_score: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    proximity_score: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    rating_score: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    completion_score: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    language_score: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    status: Mapped[str] = mapped_column(
        PgEnum(*DISPATCH_STATUS_VALUES, name="dispatch_status", create_type=False),
        default="PENDING",
    )
    acceptance_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    booking: Mapped["Booking"] = relationship()
    partner: Mapped["Partner"] = relationship()


class BlockedMatch(Base):
    """Mapping of the shared `blocked_matches` table (pre-existing, empty) —
    excludes a specific partner from ever being matched to a specific
    consumer again (e.g. after a bad experience), checked during candidate
    filtering."""

    __tablename__ = "blocked_matches"
    __table_args__ = (UniqueConstraint("consumer_id", "partner_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    consumer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("consumer_profiles.id"), nullable=False)
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("partners.id"), nullable=False)
    blocked_by: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class PartnerServiceCategory(Base):
    """Mapping of the shared `partner_service_categories` table (pre-existing,
    empty) — which service categories a partner is qualified/active for.
    Distinct from the older, informal `partner_categories` (varchar
    category_id, no FK) already mapped in models/partner.py; this one FKs
    properly to service_categories.id and is what skill matching uses."""

    __tablename__ = "partner_service_categories"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("partners.id", ondelete="CASCADE"), nullable=False)
    service_category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("service_categories.id"), nullable=False)
    years_of_experience: Mapped[int | None] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


from models.booking import Booking  # noqa: E402, F811
from models.partner import Partner  # noqa: E402, F811
