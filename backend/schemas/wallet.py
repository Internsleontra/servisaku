from datetime import datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, Field

__all__ = [
    "WalletBalanceResponse", "SettlementResponse",
]


class WalletBalanceResponse(BaseModel):
    available: Decimal = Field(..., description="Available balance for withdrawal (RM)")
    pending: Decimal = Field(..., description="Earnings held in escrow (RM)")
    lifetime: Decimal = Field(..., description="Total lifetime earnings (RM)")
    next_payout_date: str | None = Field(None, description="Next scheduled payout date")


class SettlementResponse(BaseModel):
    id: UUID = Field(..., description="Settlement UUID")
    amount: Decimal = Field(..., description="Withdrawal amount (RM)")
    status: str = Field(..., description="Settlement status: pending, scheduled, completed")
    method: str = Field(..., description="Payment method (e.g. DuitNow)")
    reference: str | None = Field(None, description="Settlement reference number")
    jobs_count: int = Field(..., description="Number of jobs included in this settlement")
    date: datetime = Field(..., description="Settlement request date")

    model_config = {"from_attributes": True}
