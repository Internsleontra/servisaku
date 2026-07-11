"""Regression tests for the production-safety guards in config.py — added
during the Final Hardening stage so a misconfigured production deploy fails
fast at startup instead of silently running wide-open.

Each test instantiates `config.Settings` directly (bypassing the
`@lru_cache`'d `get_settings()`) with a scoped environment variable override,
restoring `os.environ` afterwards so it can't leak into other tests."""
import os

import pytest
from pydantic import ValidationError

from config import Settings


@pytest.fixture
def clean_env():
    """Settings() reads from process env + .env; snapshot/restore whatever
    keys a test touches so later tests see the real .env-derived values."""
    keys = ("ENVIRONMENT", "ALLOWED_ORIGINS", "JWT_SECRET_KEY")
    saved = {k: os.environ.get(k) for k in keys}
    yield
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


def test_wildcard_cors_is_rejected_in_production(clean_env):
    os.environ["ENVIRONMENT"] = "production"
    os.environ["ALLOWED_ORIGINS"] = '["*"]'
    os.environ["JWT_SECRET_KEY"] = "a-real-random-secret-not-the-placeholder"
    with pytest.raises(ValidationError, match="ALLOWED_ORIGINS"):
        Settings()


def test_placeholder_jwt_secret_is_rejected_in_production(clean_env):
    os.environ["ENVIRONMENT"] = "production"
    os.environ["ALLOWED_ORIGINS"] = '["https://app.example.com"]'
    os.environ["JWT_SECRET_KEY"] = "change-me-in-production-use-a-real-secret"
    with pytest.raises(ValidationError, match="JWT_SECRET_KEY"):
        Settings()


def test_production_with_real_secret_and_origins_boots_cleanly(clean_env):
    os.environ["ENVIRONMENT"] = "production"
    os.environ["ALLOWED_ORIGINS"] = '["https://app.example.com"]'
    os.environ["JWT_SECRET_KEY"] = "a-real-random-secret-not-the-placeholder"
    settings = Settings()
    assert settings.ENVIRONMENT == "production"


def test_wildcard_cors_and_placeholder_secret_are_allowed_outside_production(clean_env):
    """Development/staging must stay frictionless — these guards are
    production-only by design (see config.py's ENVIRONMENT docstring)."""
    os.environ["ENVIRONMENT"] = "development"
    os.environ["ALLOWED_ORIGINS"] = '["*"]'
    os.environ["JWT_SECRET_KEY"] = "change-me-in-production-use-a-real-secret"
    settings = Settings()
    assert settings.ALLOWED_ORIGINS == ["*"]
