"""Unit tests — models/partner.py::kyc_status_from_partner_status translation
helper (partners.status enum -> the mobile app's kyc_status vocabulary)."""
from models.partner import kyc_status_from_partner_status, PARTNER_STATUS_VALUES


def test_draft_status_maps_to_not_started():
    assert kyc_status_from_partner_status("DRAFT") == "not_started"


def test_submitted_and_under_review_map_to_pending():
    assert kyc_status_from_partner_status("SUBMITTED") == "pending"
    assert kyc_status_from_partner_status("UNDER_REVIEW") == "pending"


def test_approved_and_active_map_to_verified():
    assert kyc_status_from_partner_status("APPROVED") == "verified"
    assert kyc_status_from_partner_status("ACTIVE") == "verified"


def test_rejected_and_suspended_map_to_rejected():
    assert kyc_status_from_partner_status("REJECTED") == "rejected"
    assert kyc_status_from_partner_status("SUSPENDED") == "rejected"


def test_unknown_status_defaults_to_not_started_rather_than_raising():
    assert kyc_status_from_partner_status("SOME_FUTURE_STATUS") == "not_started"


def test_every_live_partner_status_value_has_a_mapping():
    for status in PARTNER_STATUS_VALUES:
        result = kyc_status_from_partner_status(status)
        assert result in ("not_started", "pending", "verified", "rejected")
