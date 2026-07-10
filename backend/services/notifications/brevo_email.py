import httpx

from config import get_settings
from services.notifications.email_base import EmailProvider, EmailResult

settings = get_settings()


class BrevoEmailProvider(EmailProvider):
    name = "BREVO"

    def is_configured(self) -> bool:
        return bool(settings.BREVO_API_KEY)

    async def send(self, to: str, subject: str, html: str, text: str | None = None) -> EmailResult:
        if not self.is_configured():
            return EmailResult(success=False, error="Brevo is not configured")
        payload = {
            "sender": {"email": settings.EMAIL_FROM_ADDRESS, "name": settings.EMAIL_FROM_NAME},
            "to": [{"email": to}],
            "subject": subject,
            "htmlContent": html,
        }
        if text:
            payload["textContent"] = text
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.brevo.com/v3/smtp/email",
                json=payload,
                headers={"api-key": settings.BREVO_API_KEY, "Content-Type": "application/json"},
            )
        if resp.status_code >= 400:
            return EmailResult(success=False, error=f"Brevo error {resp.status_code}: {resp.text}")
        return EmailResult(success=True, provider_message_id=resp.json().get("messageId"))
