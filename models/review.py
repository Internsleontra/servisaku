import uuid
from datetime import datetime

from sqlalchemy import String, SmallInteger, Text, DateTime, ForeignKey, CheckConstraint, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id"), unique=True, nullable=False)
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("partners.id", ondelete="CASCADE"), nullable=False)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=False)
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(Text), default=[])
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_reviews_rating_range"),
    )

    partner: Mapped["Partner"] = relationship(back_populates="reviews")
    customer: Mapped["Customer"] = relationship()
    job: Mapped["Job"] = relationship()


from models.partner import Partner  # noqa: E402, F811
from models.customer import Customer  # noqa: E402, F811
from models.job import Job  # noqa: E402, F811
