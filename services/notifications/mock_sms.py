"""Mock SMS provider — no real SMS gateway is integrated yet (matches this
app's existing hardcoded-OTP posture). Logs what would have been sent and
returns success, behind the same SMSProvider interface a real provider
(Twilio, AWS SNS, etc.) would implement — swapping one in later means adding
a new class and updating registry.py, no dispatcher/route changes."""

import uuid

from services.notifications.sms_base import SMSProvider, SMSResult
from utils.logging import get_logger

logger = get_logger("mock_sms")


class MockSMSProvider(SMSProvider):
    name = "MOCK"

    async def send(self, phone: str, message: str) -> SMSResult:
        logger.info("mock_sms_sent", phone=phone, message=message)
        return SMSResult(success=True, provider_message_id=f"mock-{uuid.uuid4().hex[:12]}")
