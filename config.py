from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "Servisaku Partner API"
    DEBUG: bool = False

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

    # CORS
    ALLOWED_ORIGINS: list[str] = ["*"]

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
