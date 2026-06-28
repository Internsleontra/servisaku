import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, Numeric, Integer, Text, DateTime, ForeignKey, UniqueConstraint, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Partner(Base):
    __tablename__ = "partners"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    auth_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("auth_users.id", ondelete="CASCADE"), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    nric: Mapped[str | None] = mapped_column(String(20))
    is_online: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    kyc_status: Mapped[str] = mapped_column(String(20), default="not_started", nullable=False)
    rating: Mapped[float] = mapped_column(Numeric(3, 2), default=0.00, nullable=False)
    total_jobs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completion_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0.00, nullable=False)
    acceptance_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0.00, nullable=False)
    experience_years: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bio: Mapped[str | None] = mapped_column(Text)
    member_since: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    documents: Mapped[list["PartnerDocument"]] = relationship(back_populates="partner", cascade="all, delete-orphan")
    bank_account: Mapped["BankAccount | None"] = relationship(back_populates="partner", uselist=False, cascade="all, delete-orphan")
    categories: Mapped[list["PartnerCategory"]] = relationship(back_populates="partner", cascade="all, delete-orphan")
    service_areas: Mapped[list["PartnerServiceArea"]] = relationship(back_populates="partner", cascade="all, delete-orphan")
    availability: Mapped[list["PartnerAvailability"]] = relationship(back_populates="partner", cascade="all, delete-orphan")
    jobs: Mapped[list["Job"]] = relationship(back_populates="partner")
    earnings: Mapped[list["Earning"]] = relationship(back_populates="partner")
    reviews: Mapped[list["Review"]] = relationship(back_populates="partner")
    notifications: Mapped[list["Notification"]] = relationship(back_populates="partner", cascade="all, delete-orphan")
    feedbacks: Mapped[list["Feedback"]] = relationship(back_populates="partner", cascade="all, delete-orphan")

    auth_user: Mapped["AuthUser"] = relationship(back_populates="partner")


class PartnerDocument(Base):
    __tablename__ = "partner_documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("partners.id", ondelete="CASCADE"), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_url: Mapped[str] = mapped_column(Text, nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

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
    day_of_week: Mapped[str] = mapped_column(String(3), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    start_time: Mapped[str] = mapped_column(Time, nullable=False, default="09:00")
    end_time: Mapped[str] = mapped_column(Time, nullable=False, default="18:00")

    partner: Mapped["Partner"] = relationship(back_populates="availability")


# Forward reference imports for type checking
from models.job import Job  # noqa: E402, F811
from models.earning import Earning  # noqa: E402, F811
from models.review import Review  # noqa: E402, F811
from models.notification import Notification  # noqa: E402, F811
from models.feedback import Feedback  # noqa: E402, F811
from models.auth import AuthUser  # noqa: E402, F811
