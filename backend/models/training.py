import uuid
from datetime import datetime

from sqlalchemy import String, Text, Boolean, Integer, DateTime, ForeignKey
from sqlalchemy import Enum as PgEnum
from sqlalchemy.orm import Mapped, mapped_column

from database import Base

TRAINING_CONTENT_TYPE_VALUES = ("VIDEO", "PDF", "QUIZ")
TRAINING_STATUS_VALUES = ("NOT_STARTED", "IN_PROGRESS", "COMPLETED", "FAILED")


class TrainingModule(Base):
    """Mapping of the shared `training_modules` table (pre-existing, empty) —
    owned by the Partner Training module. Admin CRUD added in Stage 6."""

    __tablename__ = "training_modules"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    service_category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("service_categories.id"))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    content_type: Mapped[str] = mapped_column(PgEnum(*TRAINING_CONTENT_TYPE_VALUES, name="training_content_type", create_type=False), nullable=False)
    content_url: Mapped[str | None] = mapped_column(Text)
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    passing_score: Mapped[int | None] = mapped_column(Integer, default=70)
    total_questions: Mapped[int | None] = mapped_column(Integer, default=20)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class TrainingQuestion(Base):
    """Mapping of the shared `training_questions` table (pre-existing, empty)
    — this stage's "Questions CRUD" (there is no other admin-manageable
    question bank in the live schema; see docs/ADMIN_BACKEND.md)."""

    __tablename__ = "training_questions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    training_module_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("training_modules.id", ondelete="CASCADE"), nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    option_a: Mapped[str] = mapped_column(Text, nullable=False)
    option_b: Mapped[str] = mapped_column(Text, nullable=False)
    option_c: Mapped[str | None] = mapped_column(Text)
    option_d: Mapped[str | None] = mapped_column(Text)
    correct_option: Mapped[str] = mapped_column(String(1), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class PartnerTrainingProgress(Base):
    """Mapping of the shared `partner_training_progress` table (pre-existing,
    empty) — read-only here (admin visibility into completion), never written
    by this backend (no partner-facing training-taking flow yet)."""

    __tablename__ = "partner_training_progress"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("partners.id", ondelete="CASCADE"), nullable=False)
    training_module_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("training_modules.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(PgEnum(*TRAINING_STATUS_VALUES, name="training_status", create_type=False), default="NOT_STARTED")
    score: Mapped[int | None] = mapped_column(Integer)
    badge_awarded: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
