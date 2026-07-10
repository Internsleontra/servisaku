from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

__all__ = [
    "BillCreateRequest", "BillCreateResponse", "PaymentResponse",
    "RefundRequest", "RefundResponse", "RefundCompleteRequest", "TransactionResponse",
]


class BillCreateRequest(BaseModel):
    payment_method: Literal["FPX", "DUITNOW_QR", "CREDIT_CARD", "DEBIT_CARD", "SERVISAKU_CREDIT"] = "FPX"


class BillCreateResponse(BaseModel):
    payment_id: UUID
    bill_url: str = Field(..., description="Billplz-hosted bill page — redirect the consumer here to pay")
    amount_rm: Decimal
    status: str


class PaymentResponse(BaseModel):
    id: UUID
    booking_id: UUID
    payment_reference: str
    payment_method: str
    payment_gateway: str
    gateway_transaction_id: str | None = None
    amount_rm: Decimal
    currency: str
    status: str = Field(..., description="INITIATED, AUTHORIZED, CAPTURED, FAILED, HELD_IN_ESCROW, RELEASED, REFUNDED, PARTIALLY_REFUNDED")
    failure_reason: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RefundRequest(BaseModel):
    amount: Decimal | None = Field(None, description="Partial refund amount (RM). Omit for a full refund of the remaining balance.")
    reason: str | None = None


class RefundCompleteRequest(BaseModel):
    gateway_refund_id: str | None = Field(None, description="Reference from the Billplz dashboard/Payment Order, if executed manually")


class RefundResponse(BaseModel):
    id: UUID
    payment_id: UUID
    amount_rm: Decimal
    is_partial: bool
    status: str = Field(..., description="REQUESTED, PENDING_APPROVAL, APPROVED, PROCESSING, COMPLETED, REJECTED, FAILED")
    reason: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionResponse(BaseModel):
    id: UUID
    booking_id: UUID
    service_name: str
    amount_rm: Decimal
    status: str
    type: str = Field(..., description="'payment' or 'refund'")
    created_at: datetime
