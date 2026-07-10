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

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {"id": "e6317291-a973-442a-be9c-a80b840b410b", "name": "Home Cleaning", "slug": "home-cleaning"}
        },
    }


class ServiceResponse(BaseModel):
    id: UUID
    category_id: UUID
    name: str
    slug: str
    description: str | None = None
    estimated_duration_minutes: int | None = None
    starting_price_rm: Decimal

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": "f8fb2981-728a-4077-9abf-c73b9e2c63b6",
                "category_id": "e6317291-a973-442a-be9c-a80b840b410b",
                "name": "Standard Home Cleaning",
                "slug": "standard-home-cleaning",
                "description": "A standard 2-hour home cleaning session.",
                "estimated_duration_minutes": 120,
                "starting_price_rm": "150.00",
            }
        },
    }


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

    model_config = {
        "json_schema_extra": {
            "example": {
                "label": "Home",
                "street_address": "12-3, Jalan SS 2/24",
                "area": "SS2", "city": "Petaling Jaya", "state": "Selangor",
                "postcode": "47300", "is_default": True,
            }
        }
    }


class AddressResponse(BaseModel):
    id: UUID
    label: str | None = None
    street_address: str
    area: str | None = None
    city: str | None = None
    state: str | None = None
    postcode: str
    is_default: bool | None = None

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": "7e1dccce-e051-43c7-94ad-7af9c1eb6323",
                "label": "Home", "street_address": "12-3, Jalan SS 2/24, Petaling Jaya",
                "area": "SS2", "city": "Petaling Jaya", "state": "Selangor",
                "postcode": "47300", "is_default": True,
            }
        },
    }


class BookingCreate(BaseModel):
    service_id: UUID
    address_id: UUID
    scheduled_date: date
    time_slot: Literal["MORNING", "AFTERNOON", "EVENING"]
    slot_start_time: time
    slot_end_time: time
    special_instructions: str | None = None

    model_config = {
        "json_schema_extra": {
            "example": {
                "service_id": "f8fb2981-728a-4077-9abf-c73b9e2c63b6",
                "address_id": "7e1dccce-e051-43c7-94ad-7af9c1eb6323",
                "scheduled_date": "2026-07-15",
                "time_slot": "MORNING",
                "slot_start_time": "09:00:00",
                "slot_end_time": "11:00:00",
                "special_instructions": "Please call the guardhouse on arrival.",
            }
        }
    }


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

    model_config = {
        "json_schema_extra": {
            "example": {
                "id": "64de2c7f-94f1-4599-a0e5-01de2fe97be3",
                "booking_reference": "BK-E1FD4C9D69",
                "booking_status": "PENDING_PAYMENT",
                "service_id": "f8fb2981-728a-4077-9abf-c73b9e2c63b6",
                "service_name": "Standard Home Cleaning",
                "address_id": "7e1dccce-e051-43c7-94ad-7af9c1eb6323",
                "scheduled_date": "2026-07-15",
                "time_slot": "MORNING",
                "slot_start_time": "09:00:00",
                "slot_end_time": "11:00:00",
                "subtotal_rm": "150.00",
                "total_amount_rm": "150.00",
                "created_at": "2026-07-10T09:06:17.709940Z",
            }
        }
    }
