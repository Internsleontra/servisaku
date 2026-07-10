from services.notifications.push_base import PushProvider
from services.notifications.firebase_push import FirebasePushProvider
from services.notifications.email_base import EmailProvider
from services.notifications.resend_email import ResendEmailProvider
from services.notifications.brevo_email import BrevoEmailProvider
from services.notifications.mailersend_email import MailerSendEmailProvider
from services.notifications.sms_base import SMSProvider
from services.notifications.mock_sms import MockSMSProvider

_push_provider: PushProvider = FirebasePushProvider()
_sms_provider: SMSProvider = MockSMSProvider()

# Preference order: Resend first, then Brevo, then MailerSend. The
# dispatcher tries each configured one in turn until one succeeds.
_email_providers: list[EmailProvider] = [
    ResendEmailProvider(), BrevoEmailProvider(), MailerSendEmailProvider(),
]


def get_push_provider() -> PushProvider:
    return _push_provider


def get_sms_provider() -> SMSProvider:
    return _sms_provider


def get_email_providers() -> list[EmailProvider]:
    return _email_providers
