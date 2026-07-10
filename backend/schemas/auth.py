from pydantic import BaseModel, EmailStr, Field

__all__ = [
    "RegisterRequest", "LoginRequest", "VerifyOtpRequest",
    "RefreshRequest", "ForgotPasswordRequest", "ResetPasswordRequest",
    "TokenResponse",
]


class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120, description="Partner's full name")
    phone: str = Field(..., pattern=r"^\+?60\d{9,10}$", description="Malaysian phone number (e.g. +60112345678)")
    email: EmailStr = Field(..., description="Email address")
    password: str = Field(..., min_length=8, max_length=128, description="Password (min 8 characters)")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "full_name": "Ahmad Rizal",
                    "phone": "+60112345678",
                    "email": "ahmad@example.com",
                    "password": "SecurePass@123",
                }
            ]
        }
    }


class LoginRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\+?60\d{9,10}$", description="Malaysian phone number")
    password: str = Field(..., min_length=1, description="Account password")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"phone": "+60100000002", "password": "Partner@123"},
            ]
        }
    }


class VerifyOtpRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\+?60\d{9,10}$", description="Phone number that received the OTP")
    otp: str = Field(..., min_length=6, max_length=6, description="6-digit OTP code (use 123456 for testing)")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"phone": "+60112345678", "otp": "123456"},
            ]
        }
    }


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., description="Valid refresh token from login/verify-otp response")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"refresh_token": "eyJhbGciOiJIUzI1NiIs..."},
            ]
        }
    }


class ForgotPasswordRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\+?60\d{9,10}$", description="Registered phone number")


class ResetPasswordRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\+?60\d{9,10}$", description="Registered phone number")
    otp: str = Field(..., min_length=6, max_length=6, description="6-digit OTP code")
    new_password: str = Field(..., min_length=8, max_length=128, description="New password")


class TokenResponse(BaseModel):
    access_token: str = Field(..., description="JWT access token (valid for 15 minutes)")
    refresh_token: str = Field(..., description="JWT refresh token (valid for 30 days)")
    expires_in: int = Field(..., description="Access token TTL in seconds")
    partner: dict | None = Field(None, description="Partner info (id, full_name, kyc_status)")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "access_token": "eyJhbGciOiJIUzI1NiIs...",
                    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
                    "expires_in": 900,
                    "partner": {
                        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                        "full_name": "Ahmad Rizal",
                        "kyc_status": "verified",
                    },
                }
            ]
        }
    }
