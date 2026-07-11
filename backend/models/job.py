import uuid
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import String, Integer, Text, DateTime, Date, Numeric, SmallInteger, ForeignKey, CheckConstraint, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from utils.time import utc_now


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    partner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("partners.id"))
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=False)
    # Additive link to the shared `bookings` table (owned by the Booking Engine
    # module) — nullable because jobs<->bookings unification is still pending as
    # a cross-team decision. When set, reviews/notifications for this job can be
    # created (they FK to bookings.id); when not, those specific writes are blocked
    # with a clear error rather than faked. Not enforced as a DB-level FK here
    # since this app doesn't own the `bookings` table.
    booking_id: Mapped[uuid.UUID | None] = mapped_column()
    status: Mapped[str] = mapped_column(String(20), default="requested", nullable=False)
    category_id: Mapped[str] = mapped_column(String(30), nullable=False)
    service_name: Mapped[str] = mapped_column(String(120), nullable=False)
    package_name: Mapped[str] = mapped_column(String(120), nullable=False)
    addons: Mapped[list[str] | None] = mapped_column(ARRAY(Text), default=[])

    # Location
    address_label: Mapped[str] = mapped_column(String(200), nullable=False)
    address_full: Mapped[str] = mapped_column(Text, nullable=False)
    property_type: Mapped[str] = mapped_column(String(20), default="condo", nullable=False)
    distance_km: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7))

    # Scheduling
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False)
    time_slot: Mapped[str] = mapped_column(String(30), nullable=False)
    duration_min: Mapped[int] = mapped_column(Integer, default=60, nullable=False)

    # Money
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    platform_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payout: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # Metadata
    notes: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rating_given: Mapped[int | None] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    __table_args__ = (
        CheckConstraint("rating_given BETWEEN 1 AND 5", name="ck_jobs_rating_range"),
    )

    # Relationships
    partner: Mapped["Partner | None"] = relationship(back_populates="jobs")
    customer: Mapped["Customer"] = relationship()
    status_log: Mapped[list["JobStatusLog"]] = relationship(back_populates="job", cascade="all, delete-orphan")
    photos: Mapped[list["JobPhoto"]] = relationship(back_populates="job", cascade="all, delete-orphan")


class JobStatusLog(Base):
    __tablename__ = "job_status_log"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    old_status: Mapped[str | None] = mapped_column(String(20))
    new_status: Mapped[str] = mapped_column(String(20), nullable=False)
    changed_by: Mapped[uuid.UUID | None] = mapped_column()
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    job: Mapped["Job"] = relationship(back_populates="status_log")


class JobPhoto(Base):
    __tablename__ = "job_photos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    photo_url: Mapped[str] = mapped_column(Text, nullable=False)
    caption: Mapped[str | None] = mapped_column(String(200))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    job: Mapped["Job"] = relationship(back_populates="photos")


from models.partner import Partner  # noqa: E402, F811
from models.customer import Customer  # noqa: E402, F811
