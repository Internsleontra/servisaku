"""Payment/refund lifecycle tests that don't require real Billplz
credentials — a real `Payment` row is created directly via the DB (bypassing
the gateway, the same workaround tests/test_dispatch_engine_flow.py uses for
booking_status), then every payment/refund state-transition endpoint is
exercised against it: release, refund request/approve/reject/complete, and
the gateway-touching endpoints (sync) are confirmed to fail cleanly with the
real (unconfigured) Billplz gateway rather than mocking it away. Also
directly unit-tests routes.payments._mark_payment_paid/_mark_payment_failed
— the gateway-agnostic status-transition core every callback funnels
through — including the auto-confirm-booking and auto-start-dispatch side
effects."""
import uuid
from decimal import Decimal

from database import async_session
from models.booking import Booking
from models.payment import Payment, Refund
from routes.payments import _mark_payment_paid, _mark_payment_failed

from tests.conftest import API, auth


async def _get_seeded_address_and_service(client, token):
    addresses = (await client.get(f"{API}/consumer/addresses", headers=auth(token))).json()
    home = next((a for a in addresses if a.get("label") == "Home"), None)
    services = (await client.get(f"{API}/consumer/services", headers=auth(token))).json()
    match = next((s for s in services if "cleaning" in s["name"].lower()), None)
    return (
        home["id"] if home else None,
        match["id"] if match else (services[0]["id"] if services else None),
    )


async def _create_booking(client, consumer_token, scheduled_date: str) -> str | None:
    address_id, service_id = await _get_seeded_address_and_service(client, consumer_token)
    if not address_id or not service_id:
        return None
    created = await client.post(
        f"{API}/consumer/bookings",
        json={
            "service_id": service_id, "address_id": address_id,
            "scheduled_date": scheduled_date, "time_slot": "AFTERNOON",
            "slot_start_time": "14:00:00", "slot_end_time": "16:00:00",
        },
        headers=auth(consumer_token),
    )
    return created.json()["id"]


async def _create_escrowed_payment(booking_id: str) -> str:
    """Directly creates a HELD_IN_ESCROW Payment for a booking, bypassing
    the unconfigured Billplz gateway — mirrors what _mark_payment_paid would
    have produced from a real callback."""
    async with async_session() as db:
        booking = await db.get(Booking, booking_id)
        payment = Payment(
            booking_id=booking.id, consumer_id=booking.consumer_id,
            payment_reference=f"PYTEST-{uuid.uuid4().hex[:10].upper()}",
            payment_method="FPX", payment_gateway="BILLPLZ",
            gateway_transaction_id=f"fake-bill-{uuid.uuid4().hex[:8]}",
            amount_rm=Decimal("150.00"), status="HELD_IN_ESCROW",
        )
        db.add(payment)
        await db.commit()
        return str(payment.id)


async def test_get_payment_and_booking_payments_for_a_real_escrowed_payment(client, consumer_token, admin_token):
    booking_id = await _create_booking(client, consumer_token, "2027-02-01")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")
    payment_id = await _create_escrowed_payment(booking_id)

    got = await client.get(f"{API}/payments/{payment_id}", headers=auth(consumer_token))
    assert got.status_code == 200
    assert got.json()["status"] == "HELD_IN_ESCROW"
    assert Decimal(got.json()["amount_rm"]) == Decimal("150.00")

    by_admin = await client.get(f"{API}/payments/{payment_id}", headers=auth(admin_token))
    assert by_admin.status_code == 200

    for_booking = await client.get(f"{API}/payments/bookings/{booking_id}", headers=auth(consumer_token))
    assert for_booking.status_code == 200
    assert any(p["id"] == payment_id for p in for_booking.json())


async def test_get_payment_not_owned_by_the_requesting_partner_is_404(client, consumer_token, partner_token):
    """_booking_owned_by's partner branch: a partner not assigned to this
    booking must not be able to view its payment, even with a valid JWT."""
    booking_id = await _create_booking(client, consumer_token, "2027-02-02")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")
    payment_id = await _create_escrowed_payment(booking_id)

    resp = await client.get(f"{API}/payments/{payment_id}", headers=auth(partner_token))
    assert resp.status_code == 404


async def test_release_payment_success_then_conflict_on_second_release(client, consumer_token, admin_token):
    booking_id = await _create_booking(client, consumer_token, "2027-02-03")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")
    payment_id = await _create_escrowed_payment(booking_id)

    released = await client.post(f"{API}/payments/{payment_id}/release", headers=auth(admin_token))
    assert released.status_code == 200
    assert released.json()["status"] == "RELEASED"

    conflict = await client.post(f"{API}/payments/{payment_id}/release", headers=auth(admin_token))
    assert conflict.status_code == 409


async def test_sync_payment_fails_cleanly_with_the_real_unconfigured_billplz_gateway(client, consumer_token):
    """Not mocked — exercises the real BillplzGateway.get_bill() call
    through the route layer, same "not configured" contract verified in
    isolation by tests/test_unit_notification_providers.py."""
    booking_id = await _create_booking(client, consumer_token, "2027-02-04")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")
    payment_id = await _create_escrowed_payment(booking_id)

    resp = await client.post(f"{API}/payments/{payment_id}/sync", headers=auth(consumer_token))
    assert resp.status_code == 503


async def test_refund_full_approval_and_completion_lifecycle(client, consumer_token, admin_token):
    booking_id = await _create_booking(client, consumer_token, "2027-02-05")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")
    payment_id = await _create_escrowed_payment(booking_id)

    requested = await client.post(
        f"{API}/payments/{payment_id}/refunds", json={"reason": "pytest full refund lifecycle"},
        headers=auth(consumer_token),
    )
    assert requested.status_code == 201
    refund = requested.json()
    assert refund["status"] == "PENDING_APPROVAL"
    assert Decimal(refund["amount_rm"]) == Decimal("150.00")
    refund_id = refund["id"]

    approved = await client.post(f"{API}/payments/refunds/{refund_id}/approve", headers=auth(admin_token))
    assert approved.status_code == 200
    assert approved.json()["status"] == "APPROVED"

    completed = await client.post(
        f"{API}/payments/refunds/{refund_id}/complete", json={"gateway_refund_id": "pytest-manual-payout-ref"},
        headers=auth(admin_token),
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "COMPLETED"

    payment_after = await client.get(f"{API}/payments/{payment_id}", headers=auth(admin_token))
    assert payment_after.json()["status"] == "REFUNDED"  # full amount refunded


async def test_refund_rejection_lifecycle(client, consumer_token, admin_token):
    booking_id = await _create_booking(client, consumer_token, "2027-02-06")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")
    payment_id = await _create_escrowed_payment(booking_id)

    requested = await client.post(
        f"{API}/payments/{payment_id}/refunds", json={"reason": "pytest rejection lifecycle"},
        headers=auth(consumer_token),
    )
    refund_id = requested.json()["id"]

    rejected = await client.post(f"{API}/payments/refunds/{refund_id}/reject", headers=auth(admin_token))
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "REJECTED"

    # A rejected refund is no longer pending approval — completing it must 409.
    complete_attempt = await client.post(
        f"{API}/payments/refunds/{refund_id}/complete", json={}, headers=auth(admin_token),
    )
    assert complete_attempt.status_code == 409


async def test_partial_refund_leaves_payment_partially_refunded(client, consumer_token, admin_token):
    booking_id = await _create_booking(client, consumer_token, "2027-02-07")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")
    payment_id = await _create_escrowed_payment(booking_id)

    requested = await client.post(
        f"{API}/payments/{payment_id}/refunds",
        json={"reason": "pytest partial refund", "amount": "50.00"},
        headers=auth(consumer_token),
    )
    assert requested.status_code == 201
    assert requested.json()["is_partial"] is True
    refund_id = requested.json()["id"]

    await client.post(f"{API}/payments/refunds/{refund_id}/approve", headers=auth(admin_token))
    completed = await client.post(
        f"{API}/payments/refunds/{refund_id}/complete", json={}, headers=auth(admin_token),
    )
    assert completed.status_code == 200

    payment_after = await client.get(f"{API}/payments/{payment_id}", headers=auth(admin_token))
    assert payment_after.json()["status"] == "PARTIALLY_REFUNDED"


async def test_refund_amount_exceeding_remaining_balance_is_409(client, consumer_token):
    booking_id = await _create_booking(client, consumer_token, "2027-02-08")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")
    payment_id = await _create_escrowed_payment(booking_id)

    resp = await client.post(
        f"{API}/payments/{payment_id}/refunds",
        json={"reason": "pytest over-refund", "amount": "999.00"},
        headers=auth(consumer_token),
    )
    assert resp.status_code == 409


async def test_transactions_endpoint_includes_both_payments_and_refunds(client, consumer_token, admin_token):
    booking_id = await _create_booking(client, consumer_token, "2027-02-09")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")
    payment_id = await _create_escrowed_payment(booking_id)
    requested = await client.post(
        f"{API}/payments/{payment_id}/refunds", json={"reason": "pytest transactions listing", "amount": "25.00"},
        headers=auth(consumer_token),
    )
    assert requested.status_code == 201

    txns = await client.get(f"{API}/payments/transactions", headers=auth(consumer_token))
    assert txns.status_code == 200
    types = {t["type"] for t in txns.json() if t["booking_id"] == booking_id}
    assert "payment" in types
    assert "refund" in types


# --- Direct unit tests of the gateway-agnostic status-transition core ------

async def test_mark_payment_paid_confirms_booking_and_triggers_dispatch(client, consumer_token):
    """_mark_payment_paid is the one function every gateway callback (and
    the manual /sync poll) funnels through — this exercises its full
    happy path directly: INITIATED -> HELD_IN_ESCROW, PENDING_PAYMENT booking
    auto-confirmed, and Smart Dispatch auto-triggered for the
    now-unassigned CONFIRMED booking (see services/dispatch/engine.py)."""
    booking_id = await _create_booking(client, consumer_token, "2027-02-10")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")

    async with async_session() as db:
        from sqlalchemy.orm import selectinload
        from sqlalchemy import select
        booking = await db.get(Booking, booking_id)
        payment = Payment(
            # booking.id (a real uuid.UUID from the ORM), not the raw JSON
            # string booking_id — passing the string breaks selectinload's
            # in-memory identity-map matching below (str vs UUID hash
            # differently), leaving loaded_payment.booking as None even
            # though the row itself inserts/queries fine either way.
            booking_id=booking.id, consumer_id=booking.consumer_id,
            payment_reference=f"PYTEST-{uuid.uuid4().hex[:10].upper()}",
            payment_method="FPX", payment_gateway="BILLPLZ",
            gateway_transaction_id=f"fake-bill-{uuid.uuid4().hex[:8]}",
            amount_rm=Decimal("150.00"), status="INITIATED",
        )
        db.add(payment)
        await db.flush()
        payment_id = payment.id

        stmt = select(Payment).options(selectinload(Payment.booking)).where(Payment.id == payment_id)
        loaded_payment = (await db.execute(stmt)).scalar_one()
        assert loaded_payment.booking is not None
        await _mark_payment_paid(loaded_payment, db)
        await db.commit()

    async with async_session() as db:
        payment_after = await db.get(Payment, payment_id)
        booking_after = await db.get(Booking, booking_id)
        assert payment_after.status == "HELD_IN_ESCROW"
        assert payment_after.authorized_at is not None
        assert booking_after.booking_status in ("CONFIRMED", "PARTNER_ASSIGNED")  # dispatch may have assigned a partner synchronously


async def test_mark_payment_paid_is_a_noop_for_a_non_initiated_payment(client, consumer_token):
    """Guards against double-processing the same callback twice."""
    booking_id = await _create_booking(client, consumer_token, "2027-02-11")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")

    async with async_session() as db:
        booking = await db.get(Booking, booking_id)
        payment = Payment(
            booking_id=booking.id, consumer_id=booking.consumer_id,
            payment_reference=f"PYTEST-{uuid.uuid4().hex[:10].upper()}",
            payment_method="FPX", payment_gateway="BILLPLZ", amount_rm=Decimal("50.00"),
            status="HELD_IN_ESCROW",
        )
        db.add(payment)
        await db.flush()
        await _mark_payment_paid(payment, db)
        assert payment.status == "HELD_IN_ESCROW"  # unchanged — the no-op guard fired


async def test_mark_payment_failed_sets_failure_reason(client, consumer_token):
    booking_id = await _create_booking(client, consumer_token, "2027-02-12")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")

    async with async_session() as db:
        booking = await db.get(Booking, booking_id)
        payment = Payment(
            booking_id=booking.id, consumer_id=booking.consumer_id,
            payment_reference=f"PYTEST-{uuid.uuid4().hex[:10].upper()}",
            payment_method="FPX", payment_gateway="BILLPLZ", amount_rm=Decimal("50.00"),
            status="INITIATED",
        )
        db.add(payment)
        await db.flush()
        await _mark_payment_failed(payment, db, "pytest simulated gateway failure")
        assert payment.status == "FAILED"
        assert payment.failure_reason == "pytest simulated gateway failure"
        assert payment.failed_at is not None


async def test_mark_payment_failed_is_a_noop_for_a_non_initiated_payment(client, consumer_token):
    booking_id = await _create_booking(client, consumer_token, "2027-02-13")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")

    async with async_session() as db:
        booking = await db.get(Booking, booking_id)
        payment = Payment(
            booking_id=booking.id, consumer_id=booking.consumer_id,
            payment_reference=f"PYTEST-{uuid.uuid4().hex[:10].upper()}",
            payment_method="FPX", payment_gateway="BILLPLZ", amount_rm=Decimal("50.00"),
            status="RELEASED",
        )
        db.add(payment)
        await db.flush()
        await _mark_payment_failed(payment, db, "should not apply")
        assert payment.status == "RELEASED"
        assert payment.failure_reason is None
