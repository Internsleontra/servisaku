from routes.auth import router as auth_router
from routes.partner import router as partner_router
from routes.jobs import router as jobs_router
from routes.earnings import router as earnings_router
from routes.wallet import router as wallet_router
from routes.reviews import router as reviews_router
from routes.notifications import router as notifications_router
from routes.feedback import router as feedback_router
from routes.consumer import router as consumer_router
from routes.payments import router as payments_router
from routes.uploads import router as uploads_router

__all__ = [
    "auth_router", "partner_router", "jobs_router",
    "earnings_router", "wallet_router", "reviews_router",
    "notifications_router", "feedback_router",
    "consumer_router", "payments_router", "uploads_router",
]
