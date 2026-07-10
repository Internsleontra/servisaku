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
from routes.notification_dispatch import router as notification_dispatch_router
from routes.dispatch import router as dispatch_router
from routes.chat import router as chat_router
from routes.admin_dashboard import router as admin_dashboard_router
from routes.admin_rbac import router as admin_rbac_router
from routes.admin_users import router as admin_users_router
from routes.admin_partners import router as admin_partners_router
from routes.admin_bookings import router as admin_bookings_router
from routes.admin_catalog import router as admin_catalog_router
from routes.admin_coupons import router as admin_coupons_router
from routes.admin_settlements import router as admin_settlements_router
from routes.admin_support import router as admin_support_router
from routes.admin_training import router as admin_training_router

__all__ = [
    "auth_router", "partner_router", "jobs_router",
    "earnings_router", "wallet_router", "reviews_router",
    "notifications_router", "feedback_router",
    "consumer_router", "payments_router", "uploads_router",
    "notification_dispatch_router", "dispatch_router", "chat_router",
    "admin_dashboard_router", "admin_rbac_router", "admin_users_router",
    "admin_partners_router", "admin_bookings_router", "admin_catalog_router",
    "admin_coupons_router", "admin_settlements_router", "admin_support_router",
    "admin_training_router",
]
