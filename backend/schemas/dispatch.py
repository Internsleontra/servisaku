from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

__all__ = [
    "DispatchOfferResponse", "CandidatePreviewResponse", "ManualOverrideRequest",
    "DeclineOfferRequest", "BlockPartnerRequest", "DispatchAnalyticsResponse",
    "DispatchSweepResponse", "BookingStatusUpdateRequest",
]


class DispatchOfferResponse(BaseModel):
    id: UUID
    booking_id: UUID
    partner_id: UUID
    dispatch_order: int
    match_score: Decimal | None = None
    proximity_score: Decimal | None = None
    rating_score: Decimal | None = None
    completion_score: Decimal | None = None
    language_score: Decimal | None = None
    status: str = Field(..., description="PENDING, ACCEPTED, DECLINED, or EXPIRED")
    acceptance_deadline: datetime
    responded_at: datetime | None = None
    created_at: datetime

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": "3f1c1e2e-2b1a-4b7a-9e2d-1a2b3c4d5e6f",
                "booking_id": "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
                "partner_id": "60d39483-1739-428e-98ba-b7c0648763c1",
                "dispatch_order": 1,
                "match_score": "82.35",
                "proximity_score": "91.00",
                "rating_score": "96.00",
                "completion_score": "96.00",
                "language_score": "100.00",
                "status": "PENDING",
                "acceptance_deadline": "2026-07-11T02:15:00Z",
                "responded_at": None,
                "created_at": "2026-07-11T02:13:30Z",
            }
        },
    }


class CandidatePreviewResponse(BaseModel):
    partner_id: UUID
    partner_name: str
    distance_km: Decimal
    proximity_score: Decimal
    rating_score: Decimal
    completion_score: Decimal
    language_score: Decimal
    workload_score: Decimal
    match_score: Decimal

    model_config = {
        "json_schema_extra": {
            "example": {
                "partner_id": "60d39483-1739-428e-98ba-b7c0648763c1",
                "partner_name": "Ahmad Rizal",
                "distance_km": "3.20",
                "proximity_score": "91.00",
                "rating_score": "96.00",
                "completion_score": "96.00",
                "language_score": "100.00",
                "workload_score": "75.00",
                "match_score": "93.15",
            }
        }
    }


class ManualOverrideRequest(BaseModel):
    partner_id: UUID = Field(..., description="Partner to directly assign, bypassing the ranked queue")

    model_config = {"json_schema_extra": {"example": {"partner_id": "60d39483-1739-428e-98ba-b7c0648763c1"}}}


class DeclineOfferRequest(BaseModel):
    reason: str | None = Field(None, description="Optional reason the partner declined")

    model_config = {"json_schema_extra": {"example": {"reason": "Too far from current location"}}}


class BlockPartnerRequest(BaseModel):
    partner_id: UUID
    reason: str | None = None

    model_config = {
        "json_schema_extra": {"example": {"partner_id": "60d39483-1739-428e-98ba-b7c0648763c1", "reason": "Unprofessional conduct on a prior job"}}
    }


class DispatchAnalyticsResponse(BaseModel):
    total_offers: int
    by_status: dict[str, int]
    acceptance_rate_pct: float
    average_dispatch_attempts_per_booking: float
    average_response_time_seconds: float | None
    assigned_bookings: int
    unassigned_after_dispatch_attempts: int
    top_partners_by_offer_volume: list[dict]

    model_config = {
        "json_schema_extra": {
            "example": {
                "total_offers": 42,
                "by_status": {"PENDING": 1, "ACCEPTED": 30, "DECLINED": 5, "EXPIRED": 6},
                "acceptance_rate_pct": 71.43,
                "average_dispatch_attempts_per_booking": 1.4,
                "average_response_time_seconds": 38.2,
                "assigned_bookings": 30,
                "unassigned_after_dispatch_attempts": 2,
                "top_partners_by_offer_volume": [
                    {"partner_id": "60d39483-1739-428e-98ba-b7c0648763c1", "offers": 12, "accepted": 10}
                ],
            }
        }
    }


class DispatchSweepResponse(BaseModel):
    expired: int
    retried: int

    model_config = {"json_schema_extra": {"example": {"expired": 2, "retried": 1}}}


class BookingStatusUpdateRequest(BaseModel):
    new_status: str = Field(..., description="EN_ROUTE, ARRIVED, IN_PROGRESS, COMPLETED, or CANCELLED_BY_PARTNER")
    remarks: str | None = None

    model_config = {"json_schema_extra": {"example": {"new_status": "EN_ROUTE", "remarks": "Heading to the job site now"}}}
