import uuid
from datetime import datetime, date

from sqlalchemy import String, Boolean, Numeric, Integer, Text, DateTime, Date, ForeignKey, UniqueConstraint, Time
from sqlalchemy import Enum as PgEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

PARTNER_STATUS_VALUES = ("DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "ACTIVE", "SUSPENDED")
PARTNER_TIER_VALUES = ("BRONZE", "SILVER", "GOLD", "ELITE")
DOCUMENT_TYPE_VALUES = ("MYKAD_FRONT", "MYKAD_BACK", "PASSPORT", "TRADE_CERTIFICATE", "BANK_STATEMENT", "PROFILE_PHOTO")
DOCUMENT_STATUS_VALUES = ("PENDING", "VERIFIED", "REJECTED")

# Translates the live `partners.status` enum to the kyc_status vocabulary the
# mobile app already speaks (not_started/pending/verified/rejected), so the
# external API contract stays stable even though the persisted state machine
# changed underneath it. There's no admin-approval endpoint yet (see README
# "Remaining Modules (Future)"), so status only ever reaches SUBMITTED via this
# app today — APPROVED/ACTIVE only happen via direct DB seeding for now.
_KYC_STATUS_MAP = {
    "DRAFT": "not_started",
    "SUBMITTED": "pending",
    "UNDER_REVIEW": "pending",
    "APPROVED": "verified",
    "ACTIVE": "verified",
    "REJECTED": "rejected",
    "SUSPENDED": "rejected",
}


def kyc_status_from_partner_status(status: str) -> str:
    return _KYC_STATUS_MAP.get(status, "not_started")


class Partner(Base):
    __tablename__ = "partners"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    nric_or_passport_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    profile_photo_s3_key: Mapped[str | None] = mapped_column(String)
    residential_address: Mapped[str | None] = mapped_column(Text)
    postcode: Mapped[str | None] = mapped_column(String(20))
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(
        PgEnum(*PARTNER_STATUS_VALUES, name="partner_status", create_type=False),
        default="DRAFT",
    )
    tier: Mapped[str] = mapped_column(
        PgEnum(*PARTNER_TIER_VALUES, name="partner_tier", create_type=False),
        default="BRONZE",
    )
    service_radius_km: Mapped[int] = mapped_column(Integer, default=10)
    # home_location (PostGIS GEOGRAPHY(POINT,4326)) intentionally left unmapped —
    # no geo/dispatch feature uses it yet; needs geoalchemy2 when that lands.
    is_available: Mapped[bool] = mapped_column(Boolean, default=False)
    prayer_time_block_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    average_rating: Mapped[float] = mapped_column(Numeric(3, 2), default=0.00)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    completion_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0.00)
    on_time_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0.00)
    total_completed_jobs: Mapped[int] = mapped_column(Integer, default=0)
    ctos_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    ctos_reference_id: Mapped[str | None] = mapped_column(String)
    ctos_risk_level: Mapped[str | None] = mapped_column(String)
    ctos_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ctos_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    reapply_after: Mapped[date | None] = mapped_column(Date)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="partner")
    documents: Mapped[list["PartnerDocument"]] = relationship(back_populates="partner", cascade="all, delete-orphan")
    bank_account: Mapped["BankAccount | None"] = relationship(back_populates="partner", uselist=False, cascade="all, delete-orphan")
    categories: Mapped[list["PartnerCategory"]] = relationship(back_populates="partner", cascade="all, delete-orphan")
    service_areas: Mapped[list["PartnerServiceArea"]] = relationship(back_populates="partner", cascade="all, delete-orphan")
    availability: Mapped[list["PartnerAvailability"]] = relationship(back_populates="partner", cascade="all, delete-orphan")
    jobs: Mapped[list["Job"]] = relationship(back_populates="partner")
    earnings: Mapped[list["Earning"]] = relationship(back_populates="partner")
    feedbacks: Mapped[list["Feedback"]] = relationship(back_populates="partner", cascade="all, delete-orphan")

    @property
    def kyc_status(self) -> str:
        return kyc_status_from_partner_status(self.status)


class PartnerDocument(Base):
    __tablename__ = "partner_documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("partners.id", ondelete="CASCADE"), nullable=False)
    document_type: Mapped[str] = mapped_column(PgEnum(*DOCUMENT_TYPE_VALUES, name="document_type", create_type=False), nullable=False)
    s3_key: Mapped[str] = mapped_column(String, nullable=False)
    file_name: Mapped[str | None] = mapped_column(String)
    verification_status: Mapped[str] = mapped_column(
        PgEnum(*DOCUMENT_STATUS_VALUES, name="document_status", create_type=False),
        default="PENDING",
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    verified_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    partner: Mapped["Partner"] = relationship(back_populates="documents")


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("partners.id", ondelete="CASCADE"), unique=True, nullable=False)
    bank_name: Mapped[str] = mapped_column(String(100), nullable=False)
    account_name: Mapped[str] = mapped_column(String(120), nullable=False)
    account_number: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    partner: Mapped["Partner"] = relationship(back_populates="bank_account")


class PartnerCategory(Base):
    __tablename__ = "partner_categories"

    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("partners.id", ondelete="CASCADE"), primary_key=True)
    category_id: Mapped[str] = mapped_column(String(30), primary_key=True)

    partner: Mapped["Partner"] = relationship(back_populates="categories")


class PartnerServiceArea(Base):
    __tablename__ = "partner_service_areas"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("partners.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    zone: Mapped[str] = mapped_column(String(20), nullable=False)

    partner: Mapped["Partner"] = relationship(back_populates="service_areas")


class PartnerAvailability(Base):
    __tablename__ = "partner_availability"
    __table_args__ = (UniqueConstraint("partner_id", "day_of_week"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("partners.id", ondelete="CASCADE"), nullable=False)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)  # 0=Mon ... 6=Sun
    start_time: Mapped[str] = mapped_column(Time, nullable=False)
    end_time: Mapped[str] = mapped_column(Time, nullable=False)
    max_jobs_per_day: Mapped[int] = mapped_column(Integer, default=4)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    partner: Mapped["Partner"] = relationship(back_populates="availability")


# Forward reference imports for type checking
from models.auth import User  # noqa: E402, F811
from models.job import Job  # noqa: E402, F811
from models.earning import Earning  # noqa: E402, F811
from models.feedback import Feedback  # noqa: E402, F811
