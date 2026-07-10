from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

__all__ = [
    "DeviceTokenRegister", "DeviceTokenUpdate", "DeviceTokenResponse",
    "NotificationPreferenceResponse", "NotificationPreferenceUpdate",
    "TopicSubscribeRequest", "TopicSendRequest",
    "NotificationLogResponse", "RetryAllResponse",
]


class DeviceTokenRegister(BaseModel):
    device_token: str = Field(..., min_length=10, description="FCM registration token from the client SDK")
    device_type: Literal["ios", "android", "web"] | None = None

    model_config = {
        "json_schema_extra": {"example": {"device_token": "fcm-token-abc123...", "device_type": "android"}}
    }


class DeviceTokenUpdate(BaseModel):
    device_type: Literal["ios", "android", "web"] | None = None
    is_active: bool | None = None


class DeviceTokenResponse(BaseModel):
    id: UUID
    device_token: str
    device_type: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NotificationPreferenceResponse(BaseModel):
    booking_push: bool
    booking_sms: bool
    booking_email: bool
    payment_push: bool
    payment_sms: bool
    payment_email: bool
    promotional_push: bool
    promotional_sms: bool
    promotional_email: bool
    security_push: bool
    security_sms: bool
    security_email: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class NotificationPreferenceUpdate(BaseModel):
    booking_push: bool | None = None
    booking_sms: bool | None = None
    booking_email: bool | None = None
    payment_push: bool | None = None
    payment_sms: bool | None = None
    payment_email: bool | None = None
    promotional_push: bool | None = None
    promotional_sms: bool | None = None
    promotional_email: bool | None = None
    security_push: bool | None = None
    security_sms: bool | None = None
    security_email: bool | None = None

    model_config = {
        "json_schema_extra": {"example": {"promotional_push": False, "promotional_sms": False}}
    }


class TopicSubscribeRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_.~%-]+$")

    model_config = {"json_schema_extra": {"example": {"topic": "promotions-klang-valley"}}}


class TopicSendRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1)
    data: dict[str, str] | None = None

    model_config = {
        "json_schema_extra": {
            "example": {"title": "Weekend Promo", "body": "20% off AC servicing this weekend!", "data": {"screen": "promotions"}}
        }
    }


class NotificationLogResponse(BaseModel):
    id: UUID
    notification_id: UUID | None = None
    channel: str
    provider: str | None = None
    provider_message_id: str | None = None
    status: str = Field(..., description="QUEUED, SENT, DELIVERED, FAILED, BOUNCED")
    failure_reason: str | None = None
    fallback_sent: bool
    sent_at: datetime | None = None
    delivered_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RetryAllResponse(BaseModel):
    retried: int = Field(..., description="Number of FAILED deliveries that succeeded on retry")
    checked: int = Field(..., description="Total FAILED deliveries examined")
