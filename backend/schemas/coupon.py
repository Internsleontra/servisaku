from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

__all__ = ["CouponCreate", "CouponUpdate", "CouponResponse"]


class CouponCreate(BaseModel):
    code: str
    description: str | None = None
    discount_type: str = Field(..., description="PERCENTAGE or FIXED_AMOUNT")
    discount_value: Decimal
    max_discount_rm: Decimal | None = None
    min_booking_value_rm: Decimal = Decimal("0.00")
    usage_limit_total: int | None = None
    usage_limit_per_consumer: int = 1
    valid_from: datetime
    valid_until: datetime
    service_category_ids: list[UUID] = Field(default_factory=list, description="Empty = applies platform-wide")

    model_config = {"json_schema_extra": {"example": {
        "code": "WELCOME20", "description": "20% off first booking",
        "discount_type": "PERCENTAGE", "discount_value": "20.00", "max_discount_rm": "30.00",
        "min_booking_value_rm": "50.00", "usage_limit_total": 500, "usage_limit_per_consumer": 1,
        "valid_from": "2026-07-11T00:00:00Z", "valid_until": "2026-12-31T23:59:59Z",
        "service_category_ids": [],
    }}}


class CouponUpdate(BaseModel):
    description: str | None = None
    discount_value: Decimal | None = None
    max_discount_rm: Decimal | None = None
    min_booking_value_rm: Decimal | None = None
    usage_limit_total: int | None = None
    usage_limit_per_consumer: int | None = None
    valid_until: datetime | None = None
    is_active: bool | None = None


class CouponResponse(BaseModel):
    id: UUID
    code: str
    description: str | None = None
    discount_type: str
    discount_value: Decimal
    max_discount_rm: Decimal | None = None
    min_booking_value_rm: Decimal | None = None
    usage_limit_total: int | None = None
    usage_limit_per_consumer: int | None = None
    uses_count: int | None = None
    valid_from: datetime
    valid_until: datetime
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
