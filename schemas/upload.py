from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

__all__ = [
    "AvatarUploadResponse", "KYCDocumentResponse", "JobPhotoResponse",
    "SignedUploadRequest", "SignedUploadResponse", "ConfirmUploadRequest",
]


class AvatarUploadResponse(BaseModel):
    url: str = Field(..., description="Optimized, CDN-hosted image URL")

    model_config = {
        "json_schema_extra": {
            "example": {"url": "https://res.cloudinary.com/demo/image/upload/v1/servisaku/avatars/partner_7a298b05.jpg"}
        }
    }


class KYCDocumentResponse(BaseModel):
    id: UUID
    document_type: str
    url: str
    file_name: str | None = None
    verification_status: str = Field(..., description="PENDING, VERIFIED, REJECTED")
    uploaded_at: datetime

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": "1b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e",
                "document_type": "MYKAD_FRONT",
                "url": "https://res.cloudinary.com/demo/image/upload/v1/servisaku/kyc/7a298b05_mykad_front.jpg",
                "file_name": "mykad_front.jpg",
                "verification_status": "PENDING",
                "uploaded_at": "2026-07-10T09:06:17.709940Z",
            }
        },
    }


class JobPhotoResponse(BaseModel):
    id: UUID
    job_id: UUID
    url: str
    caption: str | None = None
    uploaded_at: datetime

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": "6f1c1e2e-2b1a-4b7a-9e2d-1a2b3c4d5e6f",
                "job_id": "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
                "url": "https://res.cloudinary.com/demo/image/upload/v1/servisaku/jobs/9a8b7c6d/6f1c1e2e.jpg",
                "caption": "before",
                "uploaded_at": "2026-07-10T09:06:17.709940Z",
            }
        },
    }


class SignedUploadRequest(BaseModel):
    upload_type: Literal["avatar", "kyc_document", "job_photo"]
    document_type: Literal["MYKAD_FRONT", "MYKAD_BACK", "PASSPORT", "TRADE_CERTIFICATE", "BANK_STATEMENT"] | None = Field(
        None, description="Required when upload_type is 'kyc_document'"
    )
    job_id: UUID | None = Field(None, description="Required when upload_type is 'job_photo'")

    model_config = {
        "json_schema_extra": {"example": {"upload_type": "kyc_document", "document_type": "MYKAD_FRONT"}}
    }


class SignedUploadResponse(BaseModel):
    signature: str
    timestamp: int
    api_key: str
    cloud_name: str
    folder: str
    public_id: str
    overwrite: bool
    upload_url: str = Field(..., description="POST the file directly here (multipart/form-data) along with these params")

    model_config = {
        "json_schema_extra": {
            "example": {
                "signature": "3f7a9c2e1b4d5f6a8c9d0e1f2a3b4c5d6e7f8a9b",
                "timestamp": 1783694223,
                "api_key": "123456789012345",
                "cloud_name": "servisaku-demo",
                "folder": "servisaku/kyc",
                "public_id": "7a298b05_mykad_front",
                "overwrite": True,
                "upload_url": "https://api.cloudinary.com/v1_1/servisaku-demo/image/upload",
            }
        }
    }


class ConfirmUploadRequest(BaseModel):
    upload_type: Literal["avatar", "kyc_document", "job_photo"]
    public_id: str = Field(..., description="Must match the public_id issued by POST /uploads/signature")
    secure_url: str
    document_type: Literal["MYKAD_FRONT", "MYKAD_BACK", "PASSPORT", "TRADE_CERTIFICATE", "BANK_STATEMENT"] | None = None
    job_id: UUID | None = None
    file_name: str | None = None
    photo_type: Literal["before", "after", "general"] = "general"

    model_config = {
        "json_schema_extra": {
            "example": {
                "upload_type": "kyc_document",
                "public_id": "7a298b05_mykad_front",
                "secure_url": "https://res.cloudinary.com/servisaku-demo/image/upload/v1/servisaku/kyc/7a298b05_mykad_front.jpg",
                "document_type": "MYKAD_FRONT",
                "file_name": "mykad_front.jpg",
            }
        }
    }
