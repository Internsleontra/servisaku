import httpx

from config import get_settings
from services.notifications.email_base import EmailProvider, EmailResult

settings = get_settings()


class ResendEmailProvider(EmailProvider):
    name = "RESEND"

    def is_configured(self) -> bool:
        return bool(settings.RESEND_API_KEY)

    async def send(self, to: str, subject: str, html: str, text: str | None = None) -> EmailResult:
        if not self.is_configured():
            return EmailResult(success=False, error="Resend is not configured")
        payload = {
            "from": f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM_ADDRESS}>",
            "to": [to],
            "subject": subject,
            "html": html,
        }
        if text:
            payload["text"] = text
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                json=payload,
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            )
        if resp.status_code >= 400:
            return EmailResult(success=False, error=f"Resend error {resp.status_code}: {resp.text}")
        return EmailResult(success=True, provider_message_id=resp.json().get("id"))
