from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field

__all__ = [
    "NotificationResponse",
]


class NotificationResponse(BaseModel):
    id: UUID = Field(..., description="Notification UUID")
    type: str = Field(..., description="Notification type: job, payout, rating, system")
    title: str = Field(..., description="Notification title")
    body: str = Field(..., description="Notification body text")
    is_read: bool = Field(..., description="Whether the notification has been read")
    ref_id: UUID | None = Field(None, description="Reference ID (e.g. related job or payout ID)")
    created_at: datetime = Field(..., description="Notification creation timestamp")

    model_config = {"from_attributes": True}
