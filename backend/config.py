from pydantic_settings import BaseSettings
from pydantic import model_validator
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "Servisaku Partner API"
    DEBUG: bool = False

    # ENVIRONMENT gates production-only safety checks below (e.g. refusing to
    # boot with wildcard CORS). Expected values: "development", "staging", "production".
    ENVIRONMENT: str = "development"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/servisaku"

    # JWT
    JWT_SECRET_KEY: str = "change-me-in-production-use-a-real-secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Supabase (optional, for storage)
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""

    # Payments — Billplz (sandbox, self-serve at https://www.billplz-sandbox.com)
    BILLPLZ_BASE_URL: str = "https://www.billplz-sandbox.com/api/v3"
    BILLPLZ_API_KEY: str = ""
    BILLPLZ_COLLECTION_ID: str = ""
    BILLPLZ_X_SIGNATURE_KEY: str = ""

    # Payments — iPay88 (requires a manually-approved merchant account; no
    # self-serve sandbox signup exists, so this integration is a stub until
    # real credentials are obtained from iPay88 support)
    IPAY88_MERCHANT_CODE: str = ""
    IPAY88_MERCHANT_KEY: str = ""

    # Public base URL this server is reachable at, used to build Billplz
    # callback_url/redirect_url. In local dev this needs a tunnel (e.g. ngrok)
    # since Billplz must be able to reach it directly.
    APP_PUBLIC_BASE_URL: str = "http://localhost:8000"

    PAYMENT_CURRENCY: str = "MYR"

    # Media uploads — Cloudinary free tier. Sign up at
    # https://cloudinary.com/users/register/free
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    MAX_UPLOAD_SIZE_MB: int = 10

    # Push — Firebase Cloud Messaging (Spark/free plan). Create a project at
    # https://console.firebase.google.com, then Project Settings > Service
    # Accounts > Generate new private key. Pull project_id/client_email/
    # private_key out of that JSON — never commit the JSON file itself.
    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_CLIENT_EMAIL: str = ""
    FIREBASE_PRIVATE_KEY: str = ""

    # Email — tried in this order: Resend, then Brevo, then MailerSend.
    # All three have a free tier. Only the ones with an API key set are used.
    RESEND_API_KEY: str = ""
    BREVO_API_KEY: str = ""
    MAILERSEND_API_KEY: str = ""
    EMAIL_FROM_ADDRESS: str = "notifications@servisaku.com"
    EMAIL_FROM_NAME: str = "ServisAku"

    # Smart Dispatch — sequential offer queue tuning
    DISPATCH_OFFER_TIMEOUT_SECONDS: int = 90
    DISPATCH_MAX_CANDIDATES: int = 5
    DISPATCH_MAX_ATTEMPTS: int = 5
    DISPATCH_SEARCH_RADIUS_KM_CAP: int = 50
    DISPATCH_SWEEP_INTERVAL_SECONDS: int = 20

    # CORS — never wildcard ("*") when ENVIRONMENT=production; enforced below.
    ALLOWED_ORIGINS: list[str] = ["*"]

    # Rate limiting (slowapi/limits syntax: "<count>/<second|minute|hour|day>").
    # Backed by in-memory storage by default — correct for a single uvicorn
    # worker/process (this project's current deployment shape, see
    # docs/DEPLOYMENT.md). Running multiple worker processes needs a shared
    # store (RATE_LIMIT_STORAGE_URI=redis://...) or each worker enforces its
    # own independent counters — same caveat as the Socket.IO in-process bus
    # documented in docs/SOCKET_SCALING.md.
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_STORAGE_URI: str = "memory://"
    RATE_LIMIT_LOGIN: str = "10/minute"
    RATE_LIMIT_OTP_REQUEST: str = "5/minute"
    RATE_LIMIT_OTP_VERIFY: str = "10/minute"
    RATE_LIMIT_PAYMENT: str = "20/minute"
    RATE_LIMIT_REFUND: str = "10/minute"
    RATE_LIMIT_UPLOAD: str = "20/minute"
    RATE_LIMIT_NOTIFICATION_BROADCAST: str = "5/minute"
    RATE_LIMIT_ADMIN_SENSITIVE: str = "30/minute"

    model_config = {"env_file": ".env", "extra": "ignore"}

    _PLACEHOLDER_JWT_SECRET = "change-me-in-production-use-a-real-secret"

    @model_validator(mode="after")
    def _forbid_unsafe_production_config(self) -> "Settings":
        if self.ENVIRONMENT != "production":
            return self
        if self.ALLOWED_ORIGINS == ["*"]:
            raise ValueError(
                "ALLOWED_ORIGINS=[\"*\"] is not allowed when ENVIRONMENT=production. "
                "Set ALLOWED_ORIGINS to the real client origin(s) in .env — "
                "see .env.example."
            )
        if self.JWT_SECRET_KEY == self._PLACEHOLDER_JWT_SECRET:
            raise ValueError(
                "JWT_SECRET_KEY is still the placeholder default and ENVIRONMENT=production. "
                "Generate a real secret (python -c \"import secrets; print(secrets.token_hex(32))\") "
                "and set it in .env."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
