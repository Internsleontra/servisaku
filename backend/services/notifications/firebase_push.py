import firebase_admin
from firebase_admin import credentials, messaging
from fastapi.concurrency import run_in_threadpool

from config import get_settings
from utils.errors import AppException
from services.notifications.push_base import PushProvider, PushResult

settings = get_settings()

_app: firebase_admin.App | None = None


def _ensure_configured() -> firebase_admin.App:
    global _app
    if not settings.FIREBASE_PROJECT_ID or not settings.FIREBASE_CLIENT_EMAIL or not settings.FIREBASE_PRIVATE_KEY:
        raise AppException(
            "push_provider_not_configured",
            "Firebase is not configured. Create a free Spark-plan project at "
            "https://console.firebase.google.com using intern@leontra.com, "
            "generate a service account key (Project Settings > Service Accounts), "
            "and set FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in .env.",
            status_code=503,
        )
    if _app is None:
        cred = credentials.Certificate({
            "type": "service_account",
            "project_id": settings.FIREBASE_PROJECT_ID,
            "client_email": settings.FIREBASE_CLIENT_EMAIL,
            # .env can't hold real newlines in a single-line value — the key
            # is stored with literal "\n" sequences and unescaped here.
            "private_key": settings.FIREBASE_PRIVATE_KEY.replace("\\n", "\n"),
            "token_uri": "https://oauth2.googleapis.com/token",
        })
        _app = firebase_admin.initialize_app(cred, name="servisaku")
    return _app


class FirebasePushProvider(PushProvider):
    name = "FIREBASE"

    async def send_to_token(
        self, token: str, title: str, body: str, data: dict[str, str] | None = None,
    ) -> PushResult:
        try:
            app = _ensure_configured()
        except AppException as e:
            return PushResult(success=False, error=e.message)
        message = messaging.Message(
            token=token,
            notification=messaging.Notification(title=title, body=body),
            data=data or {},
        )
        try:
            message_id = await run_in_threadpool(messaging.send, message, app=app)
            return PushResult(success=True, provider_message_id=message_id)
        except Exception as e:
            return PushResult(success=False, error=str(e))

    async def send_to_topic(
        self, topic: str, title: str, body: str, data: dict[str, str] | None = None,
    ) -> PushResult:
        try:
            app = _ensure_configured()
        except AppException as e:
            return PushResult(success=False, error=e.message)
        message = messaging.Message(
            topic=topic,
            notification=messaging.Notification(title=title, body=body),
            data=data or {},
        )
        try:
            message_id = await run_in_threadpool(messaging.send, message, app=app)
            return PushResult(success=True, provider_message_id=message_id)
        except Exception as e:
            return PushResult(success=False, error=str(e))

    async def subscribe_to_topic(self, tokens: list[str], topic: str) -> None:
        app = _ensure_configured()
        await run_in_threadpool(messaging.subscribe_to_topic, tokens, topic, app=app)

    async def unsubscribe_from_topic(self, tokens: list[str], topic: str) -> None:
        app = _ensure_configured()
        await run_in_threadpool(messaging.unsubscribe_from_topic, tokens, topic, app=app)
