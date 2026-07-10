import httpx

from config import get_settings
from services.notifications.email_base import EmailProvider, EmailResult

settings = get_settings()


class MailerSendEmailProvider(EmailProvider):
    name = "MAILERSEND"

    def is_configured(self) -> bool:
        return bool(settings.MAILERSEND_API_KEY)

    async def send(self, to: str, subject: str, html: str, text: str | None = None) -> EmailResult:
        if not self.is_configured():
            return EmailResult(success=False, error="MailerSend is not configured")
        payload = {
            "from": {"email": settings.EMAIL_FROM_ADDRESS, "name": settings.EMAIL_FROM_NAME},
            "to": [{"email": to}],
            "subject": subject,
            "html": html,
        }
        if text:
            payload["text"] = text
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.mailersend.com/v1/email",
                json=payload,
                headers={"Authorization": f"Bearer {settings.MAILERSEND_API_KEY}"},
            )
        if resp.status_code >= 400:
            return EmailResult(success=False, error=f"MailerSend error {resp.status_code}: {resp.text}")
        # MailerSend returns 202 Accepted with no body; the message id comes
        # back in a response header, not JSON.
        return EmailResult(success=True, provider_message_id=resp.headers.get("X-Message-Id"))
