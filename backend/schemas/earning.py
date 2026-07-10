from decimal import Decimal
from pydantic import BaseModel, Field

__all__ = [
    "EarningsSummarySchema", "EarningsPointSchema",
    "EarningsBreakdownItem", "EarningsResponse",
]


class EarningsSummarySchema(BaseModel):
    total: Decimal = Field(..., description="Total earnings for the period (RM)")
    jobs_completed: int = Field(..., description="Number of jobs completed in the period")
    avg_per_job: Decimal = Field(..., description="Average earning per job (RM)")
    tips: Decimal = Field(..., description="Total tips received (RM)")
    change_pct: float = Field(..., description="Percentage change from previous period")


class EarningsPointSchema(BaseModel):
    label: str = Field(..., description="Chart bucket label (hour, day name, or week number)")
    amount: Decimal = Field(..., description="Total earnings for this bucket (RM)")


class EarningsBreakdownItem(BaseModel):
    job_id: str = Field(..., description="Job UUID")
    service_name: str = Field(..., description="Service type name")
    date: str = Field(..., description="Completion date in ISO format")
    gross_amount: Decimal = Field(..., description="Total job amount (RM)")
    commission: Decimal = Field(..., description="Platform fee deducted (RM)")
    payout: Decimal = Field(..., description="Net partner payout (RM)")


class EarningsResponse(BaseModel):
    summary: EarningsSummarySchema = Field(..., description="Aggregate earnings summary")
    chart: list[EarningsPointSchema] = Field(..., description="Chart data for earnings visualization")
    breakdown: list[EarningsBreakdownItem] = Field(..., description="Per-job earnings breakdown")
