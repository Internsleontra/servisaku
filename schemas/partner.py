from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field

__all__ = [
    "PartnerResponse", "UpdatePartnerRequest", "OnlineToggle",
    "KYCSubmission", "KYCPersonal", "BankAccountSchema",
    "ServiceAreaSchema", "AvailabilitySchema",
]


class BankAccountSchema(BaseModel):
    bank_name: str = Field(..., max_length=100, description="Bank name (e.g. Maybank, CIMB)")
    account_name: str = Field(..., max_length=120, description="Account holder's full name")
    account_number: str = Field(..., max_length=30, description="Bank account number")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"bank_name": "Maybank", "account_name": "Ahmad Rizal bin Abdullah", "account_number": "1234567890"},
            ]
        }
    }


class ServiceAreaSchema(BaseModel):
    id: UUID | None = Field(None, description="Area ID (returned in responses, not required for input)")
    name: str = Field(..., max_length=100, description="Area name (e.g. Petaling Jaya)")
    zone: str = Field(..., max_length=20, description="Zone classification (central, west, east, north, south)")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"name": "Petaling Jaya", "zone": "central"},
            ]
        }
    }


class AvailabilitySchema(BaseModel):
    day: str = Field(..., pattern=r"^(mon|tue|wed|thu|fri|sat|sun)$", description="Day of week (3-letter code)")
    enabled: bool = Field(True, description="Whether the partner is available on this day")
    start: str = Field(default="09:00", pattern=r"^\d{2}:\d{2}$", description="Start time in HH:MM format")
    end: str = Field(default="18:00", pattern=r"^\d{2}:\d{2}$", description="End time in HH:MM format")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"day": "mon", "enabled": True, "start": "09:00", "end": "18:00"},
            ]
        }
    }


class PartnerResponse(BaseModel):
    id: UUID = Field(..., description="Partner UUID")
    full_name: str = Field(..., description="Partner's full name")
    phone: str = Field(..., description="Phone number")
    email: str = Field(..., description="Email address")
    avatar_url: str | None = Field(None, description="Avatar image URL")
    nric: str | None = Field(None, description="NRIC number (for KYC)")
    is_online: bool = Field(..., description="Whether partner is currently online")
    kyc_status: str = Field(..., description="KYC status: not_started, pending, verified, rejected")
    rating: float = Field(..., description="Average rating (0-5)")
    total_jobs: int = Field(..., description="Total completed jobs")
    completion_rate: float = Field(..., description="Job completion rate percentage")
    acceptance_rate: float = Field(..., description="Job acceptance rate percentage")
    experience_years: int = Field(..., description="Years of experience")
    bio: str | None = Field(None, description="Partner bio/description")
    categories: list[str] = Field([], description="Service category IDs")
    service_areas: list[ServiceAreaSchema] = Field([], description="Service coverage areas")
    availability: list[AvailabilitySchema] = Field([], description="Weekly availability schedule")
    bank_account: BankAccountSchema | None = Field(None, description="Bank account for payouts")
    member_since: datetime = Field(..., description="Account creation date")

    model_config = {"from_attributes": True}


class UpdatePartnerRequest(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=120, description="Updated full name")
    email: EmailStr | None = Field(None, description="Updated email address")
    bio: str | None = Field(None, description="Updated bio/description")
    experience_years: int | None = Field(None, ge=0, le=50, description="Updated years of experience")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"full_name": "Ahmad Rizal", "bio": "Professional cleaner in KL area", "experience_years": 6},
            ]
        }
    }


class OnlineToggle(BaseModel):
    is_online: bool = Field(..., description="Set to true to go online, false to go offline")

    model_config = {
        "json_schema_extra": {
            "examples": [{"is_online": True}]
        }
    }


class KYCPersonal(BaseModel):
    nric: str = Field(..., max_length=20, description="NRIC number (e.g. 901201-14-5678)")
    experience_years: int = Field(..., ge=0, le=50, description="Years of professional experience")
    bio: str | None = Field(None, description="Professional bio/description")


class KYCSubmission(BaseModel):
    personal: KYCPersonal = Field(..., description="Personal details for verification")
    bank_account: BankAccountSchema = Field(..., description="Bank account for payouts")
    categories: list[str] = Field(..., min_length=1, description="Service category IDs (e.g. cleaning, ac, plumbing)")
    service_areas: list[ServiceAreaSchema] = Field(..., min_length=1, description="Service coverage areas")
    availability: list[AvailabilitySchema] = Field(..., min_length=1, description="Weekly availability slots")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "personal": {"nric": "901201-14-5678", "experience_years": 5, "bio": "Professional home service partner"},
                    "bank_account": {"bank_name": "Maybank", "account_name": "Ahmad Rizal bin Abdullah", "account_number": "1234567890"},
                    "categories": ["cleaning", "ac"],
                    "service_areas": [{"name": "Petaling Jaya", "zone": "central"}],
                    "availability": [
                        {"day": "mon", "enabled": True, "start": "09:00", "end": "18:00"},
                        {"day": "tue", "enabled": True, "start": "09:00", "end": "18:00"},
                    ],
                }
            ]
        }
    }
