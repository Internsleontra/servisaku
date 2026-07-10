import uuid
from datetime import datetime

from sqlalchemy import String, SmallInteger, Text, Boolean, DateTime, ForeignKey, CheckConstraint, JSON
from sqlalchemy.orm import Mapped, mapped_column

from database import Base

REVIEWER_ROLE_VALUES = ("CONSUMER", "PARTNER")


class Review(Base):
    """Unified bidirectional review — reviewer_role tells you which direction.
    This app only ever reads reviews where reviewee_id is the partner's user_id
    and reviewer_role='CONSUMER' (a customer reviewing this partner); it never
    writes reviews (there's no consumer-facing review-submission endpoint in this
    backend — see seed.py for why sample reviews are skipped, not faked)."""

    __tablename__ = "reviews"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), unique=True, nullable=False)
    reviewer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    reviewee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reviewer_role: Mapped[str] = mapped_column(String(20), nullable=False)
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    review_text: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[dict] = mapped_column(JSON, default=dict)
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    ops_ticket_id: Mapped[uuid.UUID | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_reviews_rating_range_app"),
        CheckConstraint(f"reviewer_role IN {REVIEWER_ROLE_VALUES}", name="ck_reviews_reviewer_role_app"),
    )
