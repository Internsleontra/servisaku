from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from config import get_settings
from database import engine, Base, verify_connection
from utils import setup_logging, AppException, app_exception_handler
from utils.logging import get_logger
from utils.middleware import LoggingMiddleware
from routes import (
    auth_router, partner_router, jobs_router,
    earnings_router, wallet_router, reviews_router,
    notifications_router, feedback_router,
    consumer_router, payments_router,
)

settings = get_settings()
setup_logging(debug=settings.DEBUG)
logger = get_logger("main")

TAGS_METADATA = [
    {
        "name": "Authentication",
        "description": "Register, login, OTP verification, token refresh, and logout endpoints.",
    },
    {
        "name": "Partner Profile",
        "description": "View and update partner profile, KYC submission, bank account, categories, and availability.",
    },
    {
        "name": "Jobs",
        "description": "Browse new job requests, manage upcoming/completed jobs, accept/decline jobs, and update job status.",
    },
    {
        "name": "Earnings",
        "description": "View earnings breakdowns (daily/weekly/monthly) and lifetime earnings summary.",
    },
    {
        "name": "Wallet",
        "description": "Check wallet balance, view settlement history, and request withdrawals.",
    },
    {
        "name": "Consumer",
        "description": "Minimal consumer-facing endpoints (service catalog browsing, saved addresses, booking creation) needed to make the Payment Gateway testable end-to-end. Full booking lifecycle/dispatch belongs to a later stage.",
    },
    {
        "name": "Payments",
        "description": "Create Billplz bills for bookings, verify payment status, manage escrow, and handle the refund approval workflow.",
    },
    {
        "name": "Reviews",
        "description": "View customer reviews and rating distribution summary.",
    },
    {
        "name": "Notifications",
        "description": "Retrieve notifications, unread count, and mark notifications as read.",
    },
    {
        "name": "Feedback & Support",
        "description": "Submit feedback/bug reports and view feedback history.",
    },
    {
        "name": "Health",
        "description": "Application health check and database connectivity status.",
    },
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        db_info = await verify_connection()
        logger.info(
            "database_connected",
            database=db_info["database"],
            user=db_info["user"],
            tables=db_info["public_tables"],
            server=db_info["server"][:60],
        )
    except Exception as e:
        logger.error("database_connection_failed", error=str(e))
        raise RuntimeError(
            f"Cannot connect to PostgreSQL at {settings.DATABASE_URL.split('@')[-1]}. "
            f"Check that PostgreSQL is running and credentials are correct. Error: {e}"
        ) from e

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("schema_synced", message="All ORM tables ensured in database")

    yield

    await engine.dispose()
    logger.info("shutdown", message="Database connections closed")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description=(
        "## Servisaku Partner API\n\n"
        "Backend REST API for the **Servisaku Partner** mobile application — "
        "a home-services marketplace connecting verified service partners with customers in Malaysia.\n\n"
        "### Features\n"
        "- **JWT Authentication** with role-based access control\n"
        "- **KYC Verification** workflow for service partners\n"
        "- **Job Management** with state-machine status transitions\n"
        "- **Earnings & Wallet** with escrow-based payout system\n"
        "- **Reviews & Ratings** from customers\n"
        "- **Real-time Notifications**\n\n"
        "### Authentication\n"
        "1. Login via `POST /api/v1/auth/login` with phone + password\n"
        "2. Copy the `access_token` from the response\n"
        "3. Click **Authorize** above and enter: `Bearer <your_token>`\n"
        "4. All protected endpoints will use this token automatically\n\n"
        "### Test Credentials\n"
        "| Role | Phone | Password |\n"
        "|------|-------|----------|\n"
        "| Admin | +60100000001 | Admin@123 |\n"
        "| Partner | +60100000002 | Partner@123 |\n"
        "| Customer | +60100000003 | Customer@123 |\n"
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=TAGS_METADATA,
    lifespan=lifespan,
    swagger_ui_parameters={
        "persistAuthorization": True,
        "docExpansion": "list",
        "filter": True,
        "tryItOutEnabled": True,
    },
)

# --- Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(LoggingMiddleware)

# --- Exception handlers ---
app.add_exception_handler(AppException, app_exception_handler)

# --- Routers ---
API_PREFIX = "/api/v1"
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(partner_router, prefix=API_PREFIX)
app.include_router(jobs_router, prefix=API_PREFIX)
app.include_router(earnings_router, prefix=API_PREFIX)
app.include_router(wallet_router, prefix=API_PREFIX)
app.include_router(consumer_router, prefix=API_PREFIX)
app.include_router(payments_router, prefix=API_PREFIX)
app.include_router(payments_router, prefix=API_PREFIX)
app.include_router(reviews_router, prefix=API_PREFIX)
app.include_router(notifications_router, prefix=API_PREFIX)
app.include_router(feedback_router, prefix=API_PREFIX)


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        tags=TAGS_METADATA,
    )
    schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": (
                "Enter the JWT token obtained from POST /api/v1/auth/login.\n\n"
                "Format: `Bearer <access_token>`"
            ),
        }
    }
    schema["security"] = [{"BearerAuth": []}]
    app.openapi_schema = schema
    return schema


app.openapi = custom_openapi


@app.get("/", tags=["Health"], summary="Root health check", description="Returns basic application info and running status.")
async def root():
    return {"app": settings.APP_NAME, "version": "1.0.0", "status": "running"}


@app.get("/health", tags=["Health"], summary="Detailed health check", description="Returns application health status including database connectivity and table count.")
async def health():
    try:
        db_info = await verify_connection()
        return {
            "status": "healthy",
            "database": {
                "connected": True,
                "name": db_info["database"],
                "tables": db_info["public_tables"],
            },
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": {"connected": False, "error": str(e)},
        }
