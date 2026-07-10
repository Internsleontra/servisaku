from datetime import date, time, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

__all__ = [
    "ServiceCategoryResponse", "ServiceResponse",
    "AddressCreate", "AddressResponse",
    "BookingCreate", "BookingResponse",
]


class ServiceCategoryResponse(BaseModel):
    id: UUID
    name: str
    slug: str

    model_config = {"from_attributes": True}


class ServiceResponse(BaseModel):
    id: UUID
    category_id: UUID
    name: str
    slug: str
    description: str | None = None
    estimated_duration_minutes: int | None = None
    starting_price_rm: Decimal

    model_config = {"from_attributes": True}


class AddressCreate(BaseModel):
    label: str | None = Field(None, max_length=50)
    unit_number: str | None = None
    building_name: str | None = None
    street_address: str = Field(..., min_length=3)
    area: str | None = None
    city: str | None = None
    state: str | None = None
    postcode: str = Field(..., min_length=4, max_length=10)
    is_default: bool = True


class AddressResponse(BaseModel):
    id: UUID
    label: str | None = None
    street_address: str
    area: str | None = None
    city: str | None = None
    state: str | None = None
    postcode: str
    is_default: bool | None = None

    model_config = {"from_attributes": True}


class BookingCreate(BaseModel):
    service_id: UUID
    address_id: UUID
    scheduled_date: date
    time_slot: Literal["MORNING", "AFTERNOON", "EVENING"]
    slot_start_time: time
    slot_end_time: time
    special_instructions: str | None = None


class BookingResponse(BaseModel):
    id: UUID
    booking_reference: str
    booking_status: str
    service_id: UUID
    service_name: str
    address_id: UUID
    scheduled_date: date
    time_slot: str
    slot_start_time: time
    slot_end_time: time
    subtotal_rm: Decimal
    total_amount_rm: Decimal
    created_at: datetime
