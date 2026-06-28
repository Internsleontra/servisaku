from datetime import datetime, date
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, Field

__all__ = [
    "JobCustomerSchema", "JobLocationSchema", "JobResponse",
    "StatusUpdate", "JobListResponse",
]


class JobCustomerSchema(BaseModel):
    name: str = Field(..., description="Customer's full name")
    avatar_url: str | None = Field(None, description="Customer's avatar URL")
    phone: str = Field(..., description="Customer's phone number")
    rating: float = Field(..., description="Customer's average rating")


class JobLocationSchema(BaseModel):
    address_label: str = Field(..., description="Short address label (e.g. building name)")
    address_full: str = Field(..., description="Full street address")
    property_type: str = Field(..., description="Property type: condo, landed, commercial")
    distance_km: float | None = Field(None, description="Distance from partner in kilometers")
    latitude: float | None = Field(None, description="GPS latitude")
    longitude: float | None = Field(None, description="GPS longitude")


class JobResponse(BaseModel):
    id: UUID = Field(..., description="Job UUID")
    status: str = Field(..., description="Current status: requested, accepted, en_route, arrived, in_progress, completed, cancelled")
    category_id: str = Field(..., description="Service category (cleaning, ac, plumbing)")
    service_name: str = Field(..., description="Service type name")
    package_name: str = Field(..., description="Selected package name")
    addons: list[str] = Field([], description="Additional services selected")
    customer: JobCustomerSchema = Field(..., description="Customer details")
    location: JobLocationSchema = Field(..., description="Job location details")
    scheduled_date: date = Field(..., description="Scheduled service date")
    time_slot: str = Field(..., description="Time slot (e.g. '10:00 AM - 12:00 PM')")
    duration_min: int = Field(..., description="Estimated duration in minutes")
    gross_amount: Decimal = Field(..., description="Total job amount before fees (RM)")
    payout: Decimal = Field(..., description="Partner payout after platform fee (RM)")
    notes: str | None = Field(None, description="Additional notes from customer")
    expires_at: datetime | None = Field(None, description="Request expiry time")
    completed_at: datetime | None = Field(None, description="Completion timestamp")
    rating_given: int | None = Field(None, description="Customer rating (1-5)")
    created_at: datetime = Field(..., description="Job creation timestamp")

    model_config = {"from_attributes": True}


class StatusUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(en_route|arrived|in_progress)$", description="Target status: en_route, arrived, or in_progress")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"status": "en_route"},
            ]
        }
    }


class JobListResponse(BaseModel):
    jobs: list[JobResponse] = Field(..., description="List of jobs")
    total: int = Field(..., description="Total count of matching jobs")
