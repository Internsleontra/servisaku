import uuid
from datetime import datetime

from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class ConsumerAddress(Base):
    __tablename__ = "consumer_addresses"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    consumer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("consumer_profiles.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[str | None] = mapped_column(String(50))
    unit_number: Mapped[str | None] = mapped_column(String(30))
    floor_number: Mapped[str | None] = mapped_column(String(30))
    building_name: Mapped[str | None] = mapped_column(String(120))
    street_address: Mapped[str] = mapped_column(Text, nullable=False)
    area: Mapped[str | None] = mapped_column(String(120))
    city: Mapped[str | None] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(80))
    postcode: Mapped[str] = mapped_column(String(10), nullable=False)
    country: Mapped[str | None] = mapped_column(String(60), default="Malaysia")
    condo_visitor_instructions: Mapped[str | None] = mapped_column(Text)
    guard_pass_required: Mapped[bool | None] = mapped_column(Boolean, default=False)
    # `location` (PostGIS geography) intentionally unmapped — no geo feature
    # uses it yet, matches partners.home_location in models/partner.py.
    in_coverage_zone: Mapped[bool | None] = mapped_column(Boolean, default=True)
    is_default: Mapped[bool | None] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
