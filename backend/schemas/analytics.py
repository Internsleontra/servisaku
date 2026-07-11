from datetime import datetime

from pydantic import BaseModel, Field

__all__ = [
    "RevenueAnalyticsResponse", "BookingAnalyticsResponse", "PartnerPerformanceResponse",
    "ConsumerAnalyticsResponse", "TrendMetricsResponse", "ConversionAnalyticsResponse",
    "CancellationAnalyticsResponse", "PaymentAnalyticsResponse",
    "NotificationAnalyticsResponse", "SupportAnalyticsResponse",
]


class RevenueAnalyticsResponse(BaseModel):
    total_captured_rm: float
    total_refunded_rm: float
    net_revenue_rm: float
    by_day: list[dict] = Field(..., description="[{date, captured_rm}] for the requested window")
    by_service_category: list[dict]
    generated_at: datetime


class BookingAnalyticsResponse(BaseModel):
    total_bookings: int
    by_status: dict[str, int]
    by_day: list[dict]
    by_service_category: list[dict]
    average_booking_value_rm: float
    generated_at: datetime


class PartnerPerformanceResponse(BaseModel):
    top_by_completed_jobs: list[dict]
    top_by_rating: list[dict]
    top_by_completion_rate: list[dict]
    average_rating_platform_wide: float
    average_completion_rate_platform_wide: float
    active_partner_count: int
    generated_at: datetime


class ConsumerAnalyticsResponse(BaseModel):
    total_consumers: int
    new_consumers_by_day: list[dict]
    repeat_booking_rate_pct: float
    top_consumers_by_spend: list[dict]
    generated_at: datetime


class TrendMetricsResponse(BaseModel):
    window_days: int
    bookings_by_day: list[dict]
    revenue_by_day: list[dict]
    new_users_by_day: list[dict]
    generated_at: datetime


class ConversionAnalyticsResponse(BaseModel):
    total_created: int
    reached_confirmed: int
    reached_partner_assigned: int
    reached_completed: int
    pending_payment_to_confirmed_pct: float
    confirmed_to_completed_pct: float
    overall_conversion_pct: float
    generated_at: datetime


class CancellationAnalyticsResponse(BaseModel):
    total_cancelled: int
    by_reason_status: dict[str, int]
    cancellation_rate_pct: float
    no_show_count: int
    generated_at: datetime


class PaymentAnalyticsResponse(BaseModel):
    by_status: dict[str, int]
    by_gateway: dict[str, int]
    by_method: dict[str, int]
    success_rate_pct: float
    total_refund_requests: int
    refund_approval_rate_pct: float
    generated_at: datetime


class NotificationAnalyticsResponse(BaseModel):
    by_channel: dict[str, int]
    by_status: dict[str, int]
    delivery_success_rate_pct: float
    by_provider: dict[str, int]
    generated_at: datetime


class SupportAnalyticsResponse(BaseModel):
    total_tickets: int
    by_type: dict[str, int]
    by_priority: dict[str, int]
    by_status: dict[str, int]
    average_resolution_hours: float | None
    sla_breach_count: int
    generated_at: datetime
