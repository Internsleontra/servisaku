"""Unit tests for services/notifications/dispatcher.py — the orchestration
logic (fallback chain, retry, preference checks, exception isolation).

**Mocking boundary**: real Firebase/Resend/Brevo/MailerSend credentials are
not available in this environment (see docs/today-work/TEST_REPORT.md), so
these tests substitute fake provider objects that implement the same
abstract interfaces (services/notifications/push_base.py,
email_base.py, sms_base.py) via monkeypatching
services.notifications.dispatcher.get_push_provider/get_email_providers/
get_sms_provider. This tests the dispatcher's own orchestration logic
(fallback ordering, retry bookkeeping, exception isolation) deterministically
and without a network call — it is NOT a substitute for real sandbox
verification of the providers themselves. The real (unconfigured) provider
classes' own "not configured" error paths are covered separately in
test_unit_notification_providers.py, against the actual provider code with
no mocking, exercising exactly what happens today with blank credentials.
Real sandbox/live provider verification remains outstanding — see
docs/today-work/TEST_REPORT.md's "Remaining blockers" section."""
import uuid

from sqlalchemy import select

from auth import decode_token
from database import async_session
from models.notification_delivery import DeviceToken, NotificationLog
from services.notifications import dispatcher
from services.notifications.email_base import EmailProvider, EmailResult
from services.notifications.push_base import PushProvider, PushResult
from services.notifications.sms_base import SMSProvider, SMSResult


class FakePushProvider(PushProvider):
    name = "FAKE_PUSH"

    def __init__(self, succeed: bool = True, raise_instead: bool = False):
        self.succeed = succeed
        self.raise_instead = raise_instead
        self.sent_to: list[str] = []

    async def send_to_token(self, token, title, body, data=None):
        if self.raise_instead:
            raise RuntimeError("simulated push provider crash")
        self.sent_to.append(token)
        if self.succeed:
            return PushResult(success=True, provider_message_id="fake-push-msg-1")
        return PushResult(success=False, error="fake push failure")

    async def send_to_topic(self, topic, title, body, data=None):
        return PushResult(success=self.succeed)

    async def subscribe_to_topic(self, tokens, topic):
        pass

    async def unsubscribe_from_topic(self, tokens, topic):
        pass


class FakeEmailProvider(EmailProvider):
    def __init__(self, name: str, configured: bool = True, succeed: bool = True):
        self.name = name
        self._configured = configured
        self.succeed = succeed
        self.sent_to: list[str] = []

    def is_configured(self) -> bool:
        return self._configured

    async def send(self, to, subject, html, text=None):
        self.sent_to.append(to)
        if self.succeed:
            return EmailResult(success=True, provider_message_id=f"{self.name}-msg-1")
        return EmailResult(success=False, error=f"{self.name} rejected the message")


class FakeSMSProvider(SMSProvider):
    name = "FAKE_SMS"

    def __init__(self, succeed: bool = True):
        self.succeed = succeed
        self.sent_to: list[str] = []

    async def send(self, phone, message):
        self.sent_to.append(phone)
        if self.succeed:
            return SMSResult(success=True, provider_message_id="fake-sms-msg-1")
        return SMSResult(success=False, error="fake sms failure")


def _user_id_from_token(token: str) -> uuid.UUID:
    return uuid.UUID(decode_token(token)["sub"])


async def _deactivate_existing_tokens(db, user_id) -> None:
    """Suite convention: tests are additive/idempotent, safe to re-run (see
    docs/TESTING_GUIDE.md) — but device-token assertions here need to know
    the *exact* set of active tokens a dispatch will fan out to, so any
    left over from a previous run of this same file must be cleared first."""
    existing = (await db.execute(select(DeviceToken).where(DeviceToken.user_id == user_id))).scalars().all()
    for row in existing:
        row.is_active = False
    await db.flush()


async def _add_active_device_token(db, user_id) -> str:
    await _deactivate_existing_tokens(db, user_id)
    token_value = f"pytest-fake-device-{uuid.uuid4()}"
    db.add(DeviceToken(user_id=user_id, device_token=token_value, device_type="ios", is_active=True))
    await db.flush()
    return token_value


async def test_dispatch_push_succeeds_with_an_active_device_token(admin_token, monkeypatch):
    user_id = _user_id_from_token(admin_token)
    fake_push = FakePushProvider(succeed=True)
    monkeypatch.setattr(dispatcher, "get_push_provider", lambda: fake_push)

    async with async_session() as db:
        token_value = await _add_active_device_token(db, user_id)
        notification = await dispatcher.dispatch(
            user_id=user_id, category="booking", title="pytest push success",
            body="body", db=db, channels=("PUSH",),
        )
        await db.commit()

        assert notification.id is not None
        assert fake_push.sent_to == [token_value]

        log = (await db.execute(
            select(NotificationLog).where(NotificationLog.notification_id == notification.id)
        )).scalar_one()
        assert log.status == "SENT"
        assert log.provider == "FAKE_PUSH"
        assert log.provider_message_id == "fake-push-msg-1"


async def test_dispatch_push_with_no_device_tokens_logs_failed(admin_token, monkeypatch):
    user_id = _user_id_from_token(admin_token)
    fake_push = FakePushProvider(succeed=True)
    monkeypatch.setattr(dispatcher, "get_push_provider", lambda: fake_push)

    async with async_session() as db:
        await _deactivate_existing_tokens(db, user_id)

        notification = await dispatcher.dispatch(
            user_id=user_id, category="booking", title="pytest push no tokens",
            body="body", db=db, channels=("PUSH",),
        )
        await db.commit()

        assert fake_push.sent_to == []
        log = (await db.execute(
            select(NotificationLog).where(NotificationLog.notification_id == notification.id)
        )).scalar_one()
        assert log.status == "FAILED"
        assert log.failure_reason == "No active device tokens"


async def test_dispatch_push_provider_exception_does_not_break_dispatch(admin_token, monkeypatch):
    """dispatch()'s per-channel try/except must isolate a provider crash —
    the business action that triggered the notification (e.g. payment
    confirmation) must never fail because a push provider blew up."""
    user_id = _user_id_from_token(admin_token)
    crashing_push = FakePushProvider(raise_instead=True)
    monkeypatch.setattr(dispatcher, "get_push_provider", lambda: crashing_push)

    async with async_session() as db:
        await _add_active_device_token(db, user_id)
        notification = await dispatcher.dispatch(
            user_id=user_id, category="booking", title="pytest push crash isolation",
            body="body", db=db, channels=("PUSH",),
        )
        await db.commit()
        assert notification.id is not None  # dispatch() itself did not raise


async def test_dispatch_email_fallback_uses_second_provider_after_first_fails(consumer_token, monkeypatch):
    user_id = _user_id_from_token(consumer_token)
    first = FakeEmailProvider("FIRST_PROVIDER", configured=True, succeed=False)
    second = FakeEmailProvider("SECOND_PROVIDER", configured=True, succeed=True)
    monkeypatch.setattr(dispatcher, "get_email_providers", lambda: [first, second])

    async with async_session() as db:
        notification = await dispatcher.dispatch(
            user_id=user_id, category="booking", title="pytest email fallback",
            body="body", db=db, channels=("EMAIL",), email_to="pytest@example.com",
        )
        await db.commit()

        assert first.sent_to == ["pytest@example.com"]
        assert second.sent_to == ["pytest@example.com"]

        log = (await db.execute(
            select(NotificationLog).where(NotificationLog.notification_id == notification.id)
        )).scalar_one()
        assert log.status == "SENT"
        assert log.provider == "SECOND_PROVIDER"


async def test_dispatch_email_skips_unconfigured_providers(consumer_token, monkeypatch):
    user_id = _user_id_from_token(consumer_token)
    unconfigured = FakeEmailProvider("UNCONFIGURED", configured=False, succeed=True)
    configured = FakeEmailProvider("CONFIGURED", configured=True, succeed=True)
    monkeypatch.setattr(dispatcher, "get_email_providers", lambda: [unconfigured, configured])

    async with async_session() as db:
        notification = await dispatcher.dispatch(
            user_id=user_id, category="booking", title="pytest email skip unconfigured",
            body="body", db=db, channels=("EMAIL",), email_to="pytest2@example.com",
        )
        await db.commit()

        assert unconfigured.sent_to == []  # never called — not configured
        assert configured.sent_to == ["pytest2@example.com"]


async def test_dispatch_email_with_no_configured_providers_logs_failed(consumer_token, monkeypatch):
    user_id = _user_id_from_token(consumer_token)
    monkeypatch.setattr(dispatcher, "get_email_providers", lambda: [
        FakeEmailProvider("A", configured=False), FakeEmailProvider("B", configured=False),
    ])

    async with async_session() as db:
        notification = await dispatcher.dispatch(
            user_id=user_id, category="booking", title="pytest email none configured",
            body="body", db=db, channels=("EMAIL",), email_to="pytest3@example.com",
        )
        await db.commit()

        log = (await db.execute(
            select(NotificationLog).where(NotificationLog.notification_id == notification.id)
        )).scalar_one()
        assert log.status == "FAILED"
        assert log.provider == "NONE"
        assert log.failure_reason == "No email provider configured"


async def test_dispatch_sms_success_and_failure(partner_token, monkeypatch):
    user_id = _user_id_from_token(partner_token)

    async with async_session() as db:
        monkeypatch.setattr(dispatcher, "get_sms_provider", lambda: FakeSMSProvider(succeed=True))
        ok_notification = await dispatcher.dispatch(
            user_id=user_id, category="security", title="pytest sms ok",
            body="body", db=db, channels=("SMS",), phone_to="+60100000099",
        )
        await db.commit()
        ok_log = (await db.execute(
            select(NotificationLog).where(NotificationLog.notification_id == ok_notification.id)
        )).scalar_one()
        assert ok_log.status == "SENT"

    async with async_session() as db:
        monkeypatch.setattr(dispatcher, "get_sms_provider", lambda: FakeSMSProvider(succeed=False))
        fail_notification = await dispatcher.dispatch(
            user_id=user_id, category="security", title="pytest sms fail",
            body="body", db=db, channels=("SMS",), phone_to="+60100000099",
        )
        await db.commit()
        fail_log = (await db.execute(
            select(NotificationLog).where(NotificationLog.notification_id == fail_notification.id)
        )).scalar_one()
        assert fail_log.status == "FAILED"


async def test_dispatch_respects_notification_preferences(consumer_token, monkeypatch):
    """category='promotional' + channel='sms' defaults to disabled
    (models/notification_delivery.py's promotional_sms default=False) — the
    dispatcher must skip the provider call entirely rather than attempt and
    fail."""
    user_id = _user_id_from_token(consumer_token)
    fake_sms = FakeSMSProvider(succeed=True)
    monkeypatch.setattr(dispatcher, "get_sms_provider", lambda: fake_sms)

    async with async_session() as db:
        prefs = await dispatcher.get_or_create_preferences(user_id, db)
        prefs.promotional_sms = False
        await db.flush()

        notification = await dispatcher.dispatch(
            user_id=user_id, category="promotional", title="pytest promo skip",
            body="body", db=db, channels=("SMS",), phone_to="+60100000099",
        )
        await db.commit()

        assert fake_sms.sent_to == []  # channel was disabled by preference — provider never called
        logs = (await db.execute(
            select(NotificationLog).where(NotificationLog.notification_id == notification.id)
        )).scalars().all()
        assert logs == []  # no log row either — the channel check short-circuits before any dispatch attempt


async def test_retry_log_on_a_sent_log_is_a_noop(admin_token, monkeypatch):
    user_id = _user_id_from_token(admin_token)
    async with async_session() as db:
        log = NotificationLog(user_id=user_id, channel="PUSH", provider="FAKE_PUSH", status="SENT")
        db.add(log)
        await db.flush()
        log_id = log.id
        await db.commit()

    async with async_session() as db:
        result_log, succeeded = await dispatcher.retry_log(log_id, db)
        assert succeeded is False
        assert result_log.status == "SENT"


async def test_retry_log_push_success_marks_log_sent(admin_token, monkeypatch):
    user_id = _user_id_from_token(admin_token)
    fake_push = FakePushProvider(succeed=True)
    monkeypatch.setattr(dispatcher, "get_push_provider", lambda: fake_push)

    async with async_session() as db:
        await _add_active_device_token(db, user_id)
        notification = await dispatcher.dispatch(
            user_id=user_id, category="booking", title="pytest retry setup",
            body="body", db=db, channels=(),  # no channels dispatched — we create the FAILED log manually below
        )
        failed_log = NotificationLog(
            notification_id=notification.id, user_id=user_id, channel="PUSH",
            provider="FAKE_PUSH", status="FAILED", failure_reason="simulated prior failure",
        )
        db.add(failed_log)
        await db.flush()
        log_id = failed_log.id
        await db.commit()

    async with async_session() as db:
        result_log, succeeded = await dispatcher.retry_log(log_id, db)
        await db.commit()
        assert succeeded is True
        assert result_log.status == "SENT"
        assert result_log.fallback_sent is True


async def test_retry_log_returns_false_for_a_nonexistent_log(admin_token):
    async with async_session() as db:
        log, succeeded = await dispatcher.retry_log(uuid.uuid4(), db)
        assert log is None
        assert succeeded is False


async def test_retry_all_failed_retries_up_to_the_limit(admin_token, monkeypatch):
    user_id = _user_id_from_token(admin_token)
    fake_push = FakePushProvider(succeed=True)
    monkeypatch.setattr(dispatcher, "get_push_provider", lambda: fake_push)

    async with async_session() as db:
        await _add_active_device_token(db, user_id)
        for _ in range(3):
            db.add(NotificationLog(user_id=user_id, channel="PUSH", provider="FAKE_PUSH", status="FAILED"))
        await db.commit()

    async with async_session() as db:
        retried, checked = await dispatcher.retry_all_failed(db, limit=2)
        await db.commit()
        assert checked == 2  # bounded by the limit, even though more FAILED rows exist
        assert retried <= checked


async def test_dispatch_standalone_rolls_back_on_a_real_fk_violation():
    """A genuinely invalid user_id (no matching users row) trips
    notifications.user_id's FK constraint on flush — dispatch_standalone
    must catch it, roll back, and not propagate, exactly like the
    'unconfigured provider' isolation tested above but for a DB-level
    failure instead of a provider-level one."""
    bogus_user_id = uuid.uuid4()
    await dispatcher.dispatch_standalone(
        user_id=bogus_user_id, category="booking", title="pytest standalone fk violation",
        body="body", channels=(),
    )
    # No assertion beyond "did not raise" — dispatch_standalone is documented
    # to swallow and log every failure so a background task never crashes.
