"""Unit tests — auth.py password hashing and JWT helpers. No DB, no network."""
import time
from datetime import timedelta

import pytest
from fastapi import HTTPException
from jose import jwt

from auth import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from config import get_settings

settings = get_settings()


def test_hash_password_produces_a_bcrypt_hash_not_the_plaintext():
    hashed = hash_password("Secret@123")
    assert hashed != "Secret@123"
    assert hashed.startswith("$2b$")


def test_verify_password_round_trip():
    hashed = hash_password("Secret@123")
    assert verify_password("Secret@123", hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_same_password_hashes_differently_each_time_due_to_salt():
    assert hash_password("Secret@123") != hash_password("Secret@123")


def test_create_access_token_round_trips_through_decode_token():
    token = create_access_token(sub="11111111-1111-1111-1111-111111111111", role="admin", kyc_status="verified")
    payload = decode_token(token)
    assert payload["sub"] == "11111111-1111-1111-1111-111111111111"
    assert payload["role"] == "admin"
    assert payload["kyc_status"] == "verified"
    assert payload["type"] == "access"


def test_create_access_token_defaults_to_partner_role():
    token = create_access_token(sub="some-user-id")
    payload = decode_token(token)
    assert payload["role"] == "partner"
    assert payload["kyc_status"] == "not_started"


def test_create_refresh_token_has_no_role_claim():
    token = create_refresh_token(sub="some-user-id")
    payload = decode_token(token)
    assert payload["type"] == "refresh"
    assert "role" not in payload


def test_decode_token_rejects_garbage_input():
    with pytest.raises(HTTPException) as exc_info:
        decode_token("this-is-not-a-jwt")
    assert exc_info.value.status_code == 401


def test_decode_token_rejects_a_token_signed_with_the_wrong_secret():
    forged = jwt.encode({"sub": "x", "role": "admin", "type": "access"}, "wrong-secret-key", algorithm=settings.JWT_ALGORITHM)
    with pytest.raises(HTTPException) as exc_info:
        decode_token(forged)
    assert exc_info.value.status_code == 401


def test_decode_token_rejects_an_expired_token():
    import datetime as dt
    now = dt.datetime.now(dt.timezone.utc)
    expired_payload = {
        "sub": "some-user-id", "role": "admin", "type": "access",
        "iat": now - dt.timedelta(hours=2),
        "exp": now - dt.timedelta(hours=1),
    }
    expired_token = jwt.encode(expired_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    with pytest.raises(HTTPException) as exc_info:
        decode_token(expired_token)
    assert exc_info.value.status_code == 401
