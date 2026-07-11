import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Numeric, String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from utils.time import utc_now


class Earning(Base):
    __tablename__ = "earnings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("partners.id", ondelete="CASCADE"), nullable=False)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id"), unique=True, nullable=False)
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    commission: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payout: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    tips: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    escrow_status: Mapped[str] = mapped_column(String(20), default="held", nullable=False)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    partner: Mapped["Partner"] = relationship(back_populates="earnings")
    job: Mapped["Job"] = relationship()


from models.partner import Partner  # noqa: E402, F811
from models.job import Job  # noqa: E402, F811
