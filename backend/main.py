import asyncio
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from config import get_settings
from database import engine, Base, verify_connection
from services.rate_limit import limiter
from utils import setup_logging, AppException, app_exception_handler
from utils.logging import get_logger
from utils.middleware import LoggingMiddleware
from routes import (
    auth_router, partner_router, jobs_router,
    earnings_router, wallet_router, reviews_router,
    notifications_router, feedback_router,
    consumer_router, payments_router, uploads_router,
    notification_dispatch_router, dispatch_router, chat_router,
    admin_dashboard_router, admin_rbac_router, admin_users_router,
    admin_partners_router, admin_bookings_router, admin_catalog_router,
    admin_coupons_router, admin_settlements_router, admin_support_router,
    admin_training_router, analytics_router,
)
from services.dispatch.background import dispatch_sweep_loop
from services.realtime.socket_server import sio

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
        "description": "Consumer-facing endpoints: service catalog browsing, saved addresses, and booking creation. Booking assignment is handled by Smart Dispatch once payment is confirmed.",
    },
    {
        "name": "Payments",
        "description": "Create Billplz bills for bookings, verify payment status, manage escrow, and handle the refund approval workflow.",
    },
    {
        "name": "Uploads",
        "description": "Avatar, KYC document, and job photo uploads via Cloudinary — validated server-side uploads plus signed direct-upload URLs for the mobile client.",
    },
    {
        "name": "Reviews",
        "description": "View customer reviews and rating distribution summary.",
    },
    {
        "name": "Notifications",
        "description": "In-app notifications (list, unread count, mark read), device token registration, notification preferences, FCM topic subscribe/broadcast, delivery logs, and the retry mechanism.",
    },
    {
        "name": "Smart Dispatch",
        "description": (
            "Nearby-partner search, scoring (proximity/rating/completion/language/workload), the "
            "sequential job-offer queue with expiration and retry, manual override, dispatch/assignment "
            "history, and analytics. Auto-triggered when a booking's payment is confirmed; also drives "
            "real-time events over Socket.IO (see docs/SMART_DISPATCH.md and docs/SOCKET_ARCHITECTURE.md)."
        ),
    },
    {
        "name": "Chat",
        "description": "Per-booking chat between consumer and assigned partner (REST fallback — the primary path is Socket.IO, see docs/SOCKET_ARCHITECTURE.md).",
    },
    {
        "name": "Feedback & Support",
        "description": "Submit feedback/bug reports and view feedback history.",
    },
    {
        "name": "Admin - Dashboard",
        "description": "Aggregate platform metrics for the admin home screen.",
    },
    {
        "name": "Admin - RBAC",
        "description": "Role-based access control: roles, permissions, role assignment, and the admin action/audit-log viewers.",
    },
    {
        "name": "Admin - Users",
        "description": "User account and consumer management: list/detail, suspend/reactivate.",
    },
    {
        "name": "Admin - Partners",
        "description": "Partner application review: approve/reject/suspend, and KYC document verification.",
    },
    {
        "name": "Admin - Bookings",
        "description": "Booking oversight and admin-initiated cancellation. Dispatch (re)assignment is handled by the existing Smart Dispatch admin endpoints.",
    },
    {
        "name": "Admin - Catalog",
        "description": "Service category/service/add-on/pricing-rule/surge-rule CRUD, plus consumer membership package (subscription) management.",
    },
    {
        "name": "Admin - Coupons",
        "description": "Promotional coupon CRUD.",
    },
    {
        "name": "Admin - Settlements",
        "description": "Admin-initiated partner settlements/payouts.",
    },
    {
        "name": "Admin - Support",
        "description": "Support ticket dashboard: create/assign/resolve tickets and view evidence.",
    },
    {
        "name": "Admin - Training",
        "description": "Partner training module and quiz-question CRUD.",
    },
    {
        "name": "Admin - Analytics",
        "description": "Revenue, booking, partner performance, consumer, trend, conversion, cancellation, payment, notification, and support analytics for dashboards.",
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

    sweep_task = asyncio.create_task(dispatch_sweep_loop())
    logger.info("dispatch_background_worker_started", interval_seconds=settings.DISPATCH_SWEEP_INTERVAL_SECONDS)

    yield

    sweep_task.cancel()
    try:
        await sweep_task
    except asyncio.CancelledError:
        pass
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

# --- Rate limiting (see services/rate_limit.py) ---
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

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
app.include_router(uploads_router, prefix=API_PREFIX)
app.include_router(reviews_router, prefix=API_PREFIX)
app.include_router(notifications_router, prefix=API_PREFIX)
app.include_router(notification_dispatch_router, prefix=API_PREFIX)
app.include_router(dispatch_router, prefix=API_PREFIX)
app.include_router(chat_router, prefix=API_PREFIX)
app.include_router(feedback_router, prefix=API_PREFIX)
app.include_router(admin_dashboard_router, prefix=API_PREFIX)
app.include_router(admin_rbac_router, prefix=API_PREFIX)
app.include_router(admin_users_router, prefix=API_PREFIX)
app.include_router(admin_partners_router, prefix=API_PREFIX)
app.include_router(admin_bookings_router, prefix=API_PREFIX)
app.include_router(admin_catalog_router, prefix=API_PREFIX)
app.include_router(admin_coupons_router, prefix=API_PREFIX)
app.include_router(admin_settlements_router, prefix=API_PREFIX)
app.include_router(admin_support_router, prefix=API_PREFIX)
app.include_router(admin_training_router, prefix=API_PREFIX)
app.include_router(analytics_router, prefix=API_PREFIX)


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


@app.get("/health", tags=["Health"], summary="Detailed health check", description="Returns application health status including database connectivity, table count, and connected Socket.IO session count.")
async def health():
    from services.realtime.socket_server import get_connected_session_count
    try:
        db_info = await verify_connection()
        return {
            "status": "healthy",
            "database": {
                "connected": True,
                "name": db_info["database"],
                "tables": db_info["public_tables"],
            },
            "realtime": {"connected_sessions": get_connected_session_count()},
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": {"connected": False, "error": str(e)},
        }


# --- Socket.IO ASGI mount ---
# `app` above is the plain FastAPI instance (used directly by tests/tools that
# expect a FastAPI app, and by `python -c "import main"` sanity checks).
# `socket_app` is the actual ASGI entrypoint to run in production/dev:
#   uvicorn main:socket_app --host 0.0.0.0 --port 8000
# It wraps `app` and additionally serves the Socket.IO Engine.IO transport at
# /socket.io — see docs/SOCKET_ARCHITECTURE.md.
socket_app = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path="socket.io")
