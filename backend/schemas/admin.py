from datetime import datetime, date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

__all__ = [
    "RoleResponse", "PermissionResponse", "AssignRoleRequest", "UserRoleResponse",
    "MyPermissionsResponse",
    "UserAdminResponse", "UserStatusUpdateRequest",
    "ConsumerAdminResponse",
    "PartnerAdminResponse", "PartnerApprovalRequest", "PartnerRejectionRequest",
    "PartnerSuspendRequest", "KYCDocumentReviewRequest", "KYCDocumentAdminResponse",
    "BookingAdminResponse", "BookingCancelRequest",
    "SettlementAdminResponse", "SettlementCreateRequest", "SettlementStatusUpdateRequest",
    "AdminActionResponse", "AuditLogResponse",
    "DashboardResponse",
]


# --- RBAC ---

class RoleResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    permissions: list[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class PermissionResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None

    model_config = {"from_attributes": True}


class AssignRoleRequest(BaseModel):
    role_id: UUID

    model_config = {"json_schema_extra": {"example": {"role_id": "3f1c1e2e-2b1a-4b7a-9e2d-1a2b3c4d5e6f"}}}


class UserRoleResponse(BaseModel):
    user_id: UUID
    roles: list[str]
    permissions: list[str]


class MyPermissionsResponse(BaseModel):
    user_id: UUID
    roles: list[str]
    permissions: list[str]


# --- User / Consumer management ---

class UserAdminResponse(BaseModel):
    id: UUID
    user_type: str
    phone_number: str | None = None
    email: str | None = None
    status: str
    is_phone_verified: bool
    is_email_verified: bool
    created_at: datetime
    last_login_at: datetime | None = None

    model_config = {"from_attributes": True}


class UserStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="ACTIVE, INACTIVE, SUSPENDED, LOCKED, or DELETED")
    reason: str | None = None

    model_config = {"json_schema_extra": {"example": {"status": "SUSPENDED", "reason": "Repeated policy violations"}}}


class ConsumerAdminResponse(BaseModel):
    id: UUID
    user_id: UUID
    full_name: str
    phone_number: str | None = None
    email: str | None = None
    status: str
    created_at: datetime
    total_bookings: int = 0


# --- Partner management ---

class PartnerAdminResponse(BaseModel):
    id: UUID
    user_id: UUID
    full_name: str
    phone_number: str | None = None
    email: str | None = None
    status: str
    tier: str
    average_rating: float
    completion_rate: float
    total_completed_jobs: int
    ctos_verified: bool
    created_at: datetime
    approved_at: datetime | None = None
    rejected_at: datetime | None = None


class PartnerApprovalRequest(BaseModel):
    notes: str | None = None

    model_config = {"json_schema_extra": {"example": {"notes": "All KYC documents verified"}}}


class PartnerRejectionRequest(BaseModel):
    reason: str = Field(..., description="Reason shown to the partner")
    reapply_after_days: int | None = Field(None, description="Days before the partner may resubmit")

    model_config = {"json_schema_extra": {"example": {"reason": "MyKad photo unreadable", "reapply_after_days": 7}}}


class PartnerSuspendRequest(BaseModel):
    reason: str

    model_config = {"json_schema_extra": {"example": {"reason": "Multiple consumer complaints under review"}}}


class KYCDocumentReviewRequest(BaseModel):
    rejection_reason: str | None = Field(None, description="Required when rejecting")

    model_config = {"json_schema_extra": {"example": {"rejection_reason": None}}}


class KYCDocumentAdminResponse(BaseModel):
    id: UUID
    partner_id: UUID
    document_type: str
    url: str = Field(..., description="Cloudinary URL (source column: s3_key)")
    verification_status: str
    rejection_reason: str | None = None
    uploaded_at: datetime
    verified_at: datetime | None = None


# --- Booking management ---

class BookingAdminResponse(BaseModel):
    id: UUID
    booking_reference: str
    consumer_id: UUID
    partner_id: UUID | None = None
    service_id: UUID
    booking_status: str
    scheduled_date: date
    total_amount_rm: Decimal
    dispatch_attempts: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class BookingCancelRequest(BaseModel):
    reason: str

    model_config = {"json_schema_extra": {"example": {"reason": "Consumer requested cancellation via support"}}}


# --- Settlement management ---

class SettlementAdminResponse(BaseModel):
    id: UUID
    partner_id: UUID
    amount: Decimal
    status: str
    method: str
    reference: str | None = None
    jobs_count: int
    requested_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class SettlementCreateRequest(BaseModel):
    partner_id: UUID
    earning_ids: list[UUID] = Field(..., description="Released earnings to bundle into this settlement")

    model_config = {"json_schema_extra": {"example": {
        "partner_id": "60d39483-1739-428e-98ba-b7c0648763c1",
        "earning_ids": ["3f1c1e2e-2b1a-4b7a-9e2d-1a2b3c4d5e6f"],
    }}}


class SettlementStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="pending, scheduled, or completed")
    reference: str | None = None


# --- Audit / logs ---

class AdminActionResponse(BaseModel):
    id: UUID
    admin_user_id: UUID
    action_type: str
    target_type: str | None = None
    target_id: UUID | None = None
    description: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogResponse(BaseModel):
    id: UUID
    user_id: UUID | None = None
    entity_type: str
    entity_id: UUID | None = None
    action: str
    old_values: dict | None = None
    new_values: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Dashboard ---

class DashboardResponse(BaseModel):
    users: dict = Field(..., description="Counts by user_type and status")
    partners: dict = Field(..., description="Counts by partner status")
    bookings: dict = Field(..., description="Counts by booking_status, today's bookings")
    revenue: dict = Field(..., description="Gross RM captured, pending settlements")
    dispatch: dict = Field(..., description="Pending offers, acceptance rate")
    support: dict = Field(..., description="Open ticket counts by priority")
    generated_at: datetime
