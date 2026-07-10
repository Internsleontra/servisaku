from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

__all__ = [
    "OpsTicketCreate", "OpsTicketUpdate", "OpsTicketResponse",
    "OpsTicketAssignRequest", "OpsTicketResolveRequest",
    "OpsTicketEvidenceResponse",
]


class OpsTicketCreate(BaseModel):
    ticket_type: str = Field(..., description="DISPUTE, LOW_RATING_FLAG, PARTNER_NO_SHOW, CONSUMER_NO_SHOW, CONSUMER_COMPLAINT, FRAUD_FLAG, CTOS_REVIEW, LATE_PARTNER_FLAG, or GENERAL")
    title: str
    description: str | None = None
    booking_id: UUID | None = None
    consumer_id: UUID | None = None
    partner_id: UUID | None = None
    priority: str = Field("MEDIUM", description="LOW, MEDIUM, HIGH, or CRITICAL")
    disputed_amount_rm: Decimal | None = None

    model_config = {"json_schema_extra": {"example": {
        "ticket_type": "CONSUMER_COMPLAINT", "title": "Partner arrived 2 hours late",
        "description": "Consumer reports partner was significantly late with no notice.",
        "booking_id": None, "consumer_id": None, "partner_id": None,
        "priority": "MEDIUM", "disputed_amount_rm": None,
    }}}


class OpsTicketUpdate(BaseModel):
    priority: str | None = None
    status: str | None = None
    description: str | None = None


class OpsTicketAssignRequest(BaseModel):
    assigned_admin_id: UUID


class OpsTicketResolveRequest(BaseModel):
    resolution_notes: str
    status: str = Field("RESOLVED", description="RESOLVED or CLOSED")


class OpsTicketResponse(BaseModel):
    id: UUID
    ticket_reference: str
    booking_id: UUID | None = None
    consumer_id: UUID | None = None
    partner_id: UUID | None = None
    assigned_admin_id: UUID | None = None
    ticket_type: str
    priority: str
    status: str
    title: str
    description: str | None = None
    disputed_amount_rm: Decimal | None = None
    resolution_notes: str | None = None
    sla_due_at: datetime | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OpsTicketEvidenceResponse(BaseModel):
    id: UUID
    ticket_id: UUID
    uploaded_by: UUID | None = None
    s3_key: str
    file_type: str | None = None
    uploaded_at: datetime

    model_config = {"from_attributes": True}
