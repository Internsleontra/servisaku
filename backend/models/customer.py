import uuid
from datetime import datetime

from sqlalchemy import String, Numeric, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from database import Base
from utils.time import utc_now


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    rating: Mapped[float] = mapped_column(Numeric(3, 2), default=5.00, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
