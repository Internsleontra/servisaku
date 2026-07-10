from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

__all__ = ["ChatThreadResponse", "ChatMessageResponse", "SendMessageRequest"]


class ChatThreadResponse(BaseModel):
    id: UUID
    booking_id: UUID
    consumer_id: UUID
    partner_id: UUID
    is_active: bool
    created_at: datetime
    closed_at: datetime | None = None

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
                "booking_id": "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
                "consumer_id": "2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
                "partner_id": "60d39483-1739-428e-98ba-b7c0648763c1",
                "is_active": True,
                "created_at": "2026-07-11T02:15:00Z",
                "closed_at": None,
            }
        },
    }


class ChatMessageResponse(BaseModel):
    id: UUID
    thread_id: UUID
    sender_user_id: UUID
    message: str | None = None
    attachment_s3_key: str | None = None
    is_read: bool
    read_at: datetime | None = None
    created_at: datetime

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": "3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
                "thread_id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
                "sender_user_id": "2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
                "message": "I'm on my way, ETA 10 minutes.",
                "attachment_s3_key": None,
                "is_read": False,
                "read_at": None,
                "created_at": "2026-07-11T02:20:00Z",
            }
        },
    }


class SendMessageRequest(BaseModel):
    message: str | None = Field(None, max_length=2000)
    attachment_s3_key: str | None = None

    model_config = {"json_schema_extra": {"example": {"message": "I'm on my way, ETA 10 minutes."}}}
