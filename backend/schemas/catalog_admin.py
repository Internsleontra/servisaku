from datetime import datetime, time
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

__all__ = [
    "ServiceCategoryCreate", "ServiceCategoryUpdate", "ServiceCategoryResponse",
    "ServiceCreate", "ServiceUpdate", "ServiceResponse",
    "ServiceAddonCreate", "ServiceAddonUpdate", "ServiceAddonResponse",
    "PricingRuleCreate", "PricingRuleUpdate", "PricingRuleResponse",
    "SurgePricingRuleCreate", "SurgePricingRuleUpdate", "SurgePricingRuleResponse",
    "PackageResponse", "PackageStatusUpdateRequest",
]


class ServiceCategoryCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    inclusions: str | None = None
    exclusions: str | None = None
    icon_s3_key: str | None = None
    display_order: int = 0
    commission_rate: Decimal = Decimal("20.00")


class ServiceCategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    inclusions: str | None = None
    exclusions: str | None = None
    icon_s3_key: str | None = None
    is_active: bool | None = None
    display_order: int | None = None
    commission_rate: Decimal | None = None


class ServiceCategoryResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: str | None = None
    inclusions: str | None = None
    exclusions: str | None = None
    icon_s3_key: str | None = None
    is_active: bool
    display_order: int | None = None
    commission_rate: Decimal | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ServiceCreate(BaseModel):
    category_id: UUID
    name: str
    slug: str
    description: str | None = None
    inclusions: str | None = None
    exclusions: str | None = None
    estimated_duration_minutes: int | None = None
    starting_price_rm: Decimal


class ServiceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    inclusions: str | None = None
    exclusions: str | None = None
    estimated_duration_minutes: int | None = None
    starting_price_rm: Decimal | None = None
    is_active: bool | None = None


class ServiceResponse(BaseModel):
    id: UUID
    category_id: UUID
    name: str
    slug: str
    description: str | None = None
    inclusions: str | None = None
    exclusions: str | None = None
    estimated_duration_minutes: int | None = None
    starting_price_rm: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ServiceAddonCreate(BaseModel):
    service_id: UUID
    name: str
    description: str | None = None
    price_rm: Decimal


class ServiceAddonUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price_rm: Decimal | None = None
    is_active: bool | None = None


class ServiceAddonResponse(BaseModel):
    id: UUID
    service_id: UUID
    name: str
    description: str | None = None
    price_rm: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PricingRuleCreate(BaseModel):
    service_id: UUID
    rule_name: str
    pricing_type: str = Field(..., description="FLAT or PER_UNIT (app-level convention)")
    base_price_rm: Decimal
    unit_price_rm: Decimal | None = None
    min_units: int = 1
    max_units: int | None = None


class PricingRuleUpdate(BaseModel):
    rule_name: str | None = None
    base_price_rm: Decimal | None = None
    unit_price_rm: Decimal | None = None
    min_units: int | None = None
    max_units: int | None = None
    is_active: bool | None = None


class PricingRuleResponse(BaseModel):
    id: UUID
    service_id: UUID
    rule_name: str
    pricing_type: str
    base_price_rm: Decimal
    unit_price_rm: Decimal | None = None
    min_units: int | None = None
    max_units: int | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SurgePricingRuleCreate(BaseModel):
    service_category_id: UUID | None = None
    rule_name: str
    trigger_type: str = Field(..., description="PUBLIC_HOLIDAY, WEEKEND, PEAK_HOUR, or HIGH_DEMAND")
    day_type: str | None = None
    start_time: time | None = None
    end_time: time | None = None
    demand_threshold: int | None = None
    multiplier: Decimal


class SurgePricingRuleUpdate(BaseModel):
    rule_name: str | None = None
    multiplier: Decimal | None = None
    is_active: bool | None = None


class SurgePricingRuleResponse(BaseModel):
    id: UUID
    service_category_id: UUID | None = None
    rule_name: str
    trigger_type: str
    day_type: str | None = None
    start_time: time | None = None
    end_time: time | None = None
    demand_threshold: int | None = None
    multiplier: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PackageResponse(BaseModel):
    """`subscriptions` row — see models/subscription.py for why this is the
    closest live-schema analog to "packages"."""
    id: UUID
    user_id: UUID
    plan: str
    amount_rm: Decimal
    status: str
    auto_renew: bool
    starts_at: datetime
    expires_at: datetime | None = None
    cancelled_at: datetime | None = None

    model_config = {"from_attributes": True}


class PackageStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="ACTIVE, CANCELLED, EXPIRED, or PAST_DUE")
