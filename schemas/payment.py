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
    payment_method: Literal["FPX", "DUITNOW_QR", "CREDIT_CARD", "DEBIT_CARD", "SERVISAKU_CREDIT"] = Field(
        "FPX", description="How the consumer intends to pay, shown on the gateway's hosted checkout page"
    )
    payment_gateway: Literal["BILLPLZ", "IPAY88"] = Field(
        "BILLPLZ", description="Which gateway to route this bill through. IPAY88 is stubbed (returns 503) until real merchant credentials exist."
    )

    model_config = {
        "json_schema_extra": {
            "example": {"payment_method": "FPX", "payment_gateway": "BILLPLZ"}
        }
    }


class BillCreateResponse(BaseModel):
    payment_id: UUID
    bill_url: str = Field(..., description="Gateway-hosted checkout page — redirect the consumer here to pay")
    amount_rm: Decimal
    status: str

    model_config = {
        "json_schema_extra": {
            "example": {
                "payment_id": "6f1c1e2e-2b1a-4b7a-9e2d-1a2b3c4d5e6f",
                "bill_url": "https://www.billplz-sandbox.com/bills/abcd1234",
                "amount_rm": "150.00",
                "status": "INITIATED",
            }
        }
    }


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

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": "6f1c1e2e-2b1a-4b7a-9e2d-1a2b3c4d5e6f",
                "booking_id": "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
                "payment_reference": "PAY-A1B2C3D4E5",
                "payment_method": "FPX",
                "payment_gateway": "BILLPLZ",
                "gateway_transaction_id": "abcd1234",
                "amount_rm": "150.00",
                "currency": "MYR",
                "status": "HELD_IN_ESCROW",
                "failure_reason": None,
                "created_at": "2026-07-10T09:06:17.709940Z",
            }
        },
    }


class RefundRequest(BaseModel):
    amount: Decimal | None = Field(None, description="Partial refund amount (RM). Omit for a full refund of the remaining balance.")
    reason: str | None = Field(None, description="Internal note explaining the refund")

    model_config = {
        "json_schema_extra": {
            "example": {"amount": "50.00", "reason": "Partner arrived late, consumer requested partial refund"}
        }
    }


class RefundCompleteRequest(BaseModel):
    gateway_refund_id: str | None = Field(None, description="Reference from the Billplz dashboard/Payment Order, if executed manually")

    model_config = {
        "json_schema_extra": {"example": {"gateway_refund_id": "billplz-payout-98765"}}
    }


class RefundResponse(BaseModel):
    id: UUID
    payment_id: UUID
    amount_rm: Decimal
    is_partial: bool
    status: str = Field(..., description="REQUESTED, PENDING_APPROVAL, APPROVED, PROCESSING, COMPLETED, REJECTED, FAILED")
    reason: str | None = None
    created_at: datetime

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": "1b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e",
                "payment_id": "6f1c1e2e-2b1a-4b7a-9e2d-1a2b3c4d5e6f",
                "amount_rm": "50.00",
                "is_partial": True,
                "status": "PENDING_APPROVAL",
                "reason": "Partner arrived late, consumer requested partial refund",
                "created_at": "2026-07-10T09:10:00.000000Z",
            }
        },
    }


class TransactionResponse(BaseModel):
    id: UUID
    booking_id: UUID
    service_name: str
    amount_rm: Decimal
    status: str
    type: str = Field(..., description="'payment' or 'refund'")
    created_at: datetime

    model_config = {
        "json_schema_extra": {
            "example": {
                "id": "6f1c1e2e-2b1a-4b7a-9e2d-1a2b3c4d5e6f",
                "booking_id": "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
                "service_name": "Standard Home Cleaning",
                "amount_rm": "150.00",
                "status": "HELD_IN_ESCROW",
                "type": "payment",
                "created_at": "2026-07-10T09:06:17.709940Z",
            }
        }
    }
