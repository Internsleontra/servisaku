# Security Review

## Authentication

- **JWT** (HS256, `python-jose`) with separate access (`ACCESS_TOKEN_EXPIRE_MINUTES`,
  default 15) and refresh (`REFRESH_TOKEN_EXPIRE_DAYS`, default 30) tokens,
  each carrying a `type` claim (`access`/`refresh`) so one can never be used
  in place of the other (`auth.py::get_current_user_id` explicitly checks
  `type == "access"`; `routes/auth.py::refresh` checks `type == "refresh"`).
- **Passwords**: bcrypt via `passlib`/`bcrypt` (`auth.py::hash_password`),
  salted automatically per-hash (verified in `tests/test_unit_auth.py` —
  the same password hashes differently every call). Never logged, never
  returned in any response schema.
- **OTP verification** exists for phone-based registration (`routes/auth.py`)
  in addition to password login.

## Authorization

Two layers, applied consistently:

1. **Coarse role gate** — every protected route depends on
   `get_current_partner_id` / `get_current_admin_id` / `get_current_consumer_id`
   (`auth.py`), which checks the JWT's `role` claim and, for
   partner/consumer, resolves it to the actual owning row (so a partner
   token can never act on another partner's data — every partner/consumer-
   scoped query filters by the resolved `partner_id`/`consumer_id`, never a
   client-supplied one).
2. **Granular RBAC** (Stage 6, `services/rbac.py`) — admin endpoints
   additionally require a specific permission
   (`require_permission("partners.approve")`), resolved from the
   `user_roles -> roles -> role_permissions -> permissions` chain. A
   `SUPER_ADMIN`-role admin has `admin.full_access`, which satisfies every
   check; any other role only satisfies checks for its explicitly granted
   permissions. **Verified to fail closed**: a role with zero granted
   permissions (found in the pre-seeded `READ_ONLY` role's data) is denied
   on every admin endpoint, not just mutations — see `docs/ADMIN_BACKEND.md`.

**Ownership checks are never client-supplied**: every "does this
booking/thread/offer/document belong to the caller" check resolves the
caller's own scope ID server-side from their JWT `sub` claim first, then
compares — a client cannot pass `partner_id=<someone else's id>` to widen
access.

## Input validation

- **Every request body is a Pydantic schema** (`schemas/*.py`) with
  field-level constraints (`Field(..., min_length=...)`, `Literal[...]`
  enums, regex patterns for phone numbers/time strings) — FastAPI rejects
  malformed input with a `422` before any route code runs.
- **File uploads are content-validated, not just extension/Content-Type
  trusted**: `services/cloudinary_service.py::validate_image_upload`
  sniffs real magic bytes (JPEG/PNG/WEBP signatures) rather than trusting
  the client-supplied `Content-Type` header, which is trivially spoofable.
  A `.txt` renamed to `.jpg` is rejected (verified in
  `tests/test_unit_uploads.py` and `tests/test_uploads_api.py`).
- **SQL injection**: the ORM (SQLAlchemy) parameterizes everything by
  default; the handful of raw-SQL call sites (PostGIS proximity queries in
  `services/dispatch/matching.py`, aggregate queries in `routes/analytics.py`)
  all use bound `:parameter` placeholders via `text()`, never string
  interpolation of user input into SQL.

## Rate limiting

Added during Final Hardening. `slowapi` (in-memory by default, Redis-ready
via `RATE_LIMIT_STORAGE_URI` — see `.env.example` and
`docs/SOCKET_SCALING.md` for the same in-process-state caveat applied here)
gates the endpoints an attacker would actually target:

| Category | Endpoints | Default limit |
|---|---|---|
| Login | `POST /auth/login` | 10/minute |
| OTP request | `POST /auth/register` | 5/minute |
| OTP verify | `POST /auth/verify-otp` | 10/minute |
| Payment creation | `POST /payments/bookings/{id}/bill` | 20/minute |
| Refunds | `POST /payments/{id}/refunds`, `/refunds/{id}/approve\|reject\|complete` | 10/minute |
| Uploads | `POST /uploads/avatar\|kyc-documents\|jobs/{id}/photos` | 20/minute |
| Notification broadcast | `POST /notifications/topics/{topic}/send` | 5/minute |
| Admin-sensitive | Partner approve/reject/suspend/reactivate, KYC verify/reject, settlement create, user status update | 30/minute |

Enabled by default (`RATE_LIMIT_ENABLED=true`); the test suite disables it
process-wide via `tests/conftest.py` so functional tests aren't tripped by
their own repeated requests, with dedicated behavior tests in
`tests/test_rate_limiting.py` that explicitly re-enable it. Responses
include `X-RateLimit-*`/`Retry-After` headers (`headers_enabled=True` in
`services/rate_limit.py`) so well-behaved clients can back off correctly.
See `docs/DEPLOYMENT.md` for the reverse-proxy `X-Forwarded-For` note —
`get_remote_address` keys on `request.client.host`, which is the proxy's IP
unless forwarded correctly.

## Production startup guards

Added during Final Hardening (`config.py`). When `ENVIRONMENT=production`,
the app **refuses to start** if either:
- `ALLOWED_ORIGINS` is still the wildcard `["*"]`, or
- `JWT_SECRET_KEY` is still the placeholder default.

This turns the "known gaps" below from a documentation note someone has to
remember, into a startup-time failure that can't be silently missed. Both
are development-only defaults outside `ENVIRONMENT=production` — regression
tests in `tests/test_config_security.py`.

## Webhook / external callback verification

- **Billplz payment callback** (`POST /payments/billplz/callback`) verifies
  the `X-Signature` HMAC against `BILLPLZ_X_SIGNATURE_KEY` using
  `hmac.compare_digest` (constant-time comparison — verified in
  `services/billplz_gateway.py::verify_callback_signature`) before trusting
  any payment-status change. Fails closed: returns `False` (never trusts
  the callback) when no signature key is configured — verified in
  `tests/test_unit_notification_providers.py`. Implemented per Billplz's
  documented algorithm but not yet verified against a real callback (no
  live Billplz account exists in this environment; see
  `API_TESTING_REPORT.md`).

## Secrets management

- All credentials (`DATABASE_URL`, `JWT_SECRET_KEY`, Billplz/Cloudinary/
  Firebase/email API keys) are environment variables loaded via
  `pydantic-settings`, never hardcoded. `.env` is gitignored; `.env.example`
  documents every variable's purpose with no real values.
- **Default `JWT_SECRET_KEY`** (`config.py`) is a placeholder
  (`"change-me-in-production-use-a-real-secret"`) — **must** be overridden
  with a real random secret before any production deployment; see
  `docs/DEPLOYMENT.md`.
- Verified during Stage 6's pre-push checklist and spot-checked again this
  stage: no `.env` file, API key, or credential has ever been committed to
  git history for this backend.

## Audit trail

Stage 6 added two complementary logs for every admin mutation:
`admin_actions` (one line: who/what/when) and `audit_logs` (structured
before/after JSON for the most sensitive transitions — partner approval,
user suspension, catalog/coupon/pricing edits, refund decisions). Both are
best-effort (never raise, never block the action they're logging) but are
wired into every admin route file, including the pre-Stage-6 refund/
dispatch-override/notification-broadcast endpoints (see
`docs/ADMIN_BACKEND.md`).

## Resolved during Final Hardening

- ~~No rate limiting~~ — fixed, see "Rate limiting" above.
- ~~CORS wide open with no production guard~~ — fixed: `ALLOWED_ORIGINS`
  defaults to `["*"]` for local dev convenience, but the app now refuses to
  start with that value when `ENVIRONMENT=production` (see "Production
  startup guards" above). Set real origins in `.env` regardless — the guard
  is a safety net, not a substitute for actually configuring it.
- ~~Placeholder JWT secret has no production guard~~ — fixed, same
  mechanism as above.
- ~~Naive-datetime timezone bug~~ — fixed codebase-wide: every
  `datetime.utcnow()`/naive `datetime.now()` replaced with
  `utils.time.utc_now()` (timezone-aware) across 32 files (models,
  routes, auth token generation, notification dispatcher). Regression
  tests in `tests/test_timezone_regression.py`, including a static guard
  test that fails the suite if the naive pattern is ever reintroduced.

## Known gaps (still disclosed, not yet resolved)

- **No CSP/security headers middleware** — relies entirely on this being
  an API-only backend consumed by native mobile clients and Swagger UI, not
  directly rendering HTML to browsers. If an admin web dashboard is later
  built to consume this API directly, add `secure-headers`-style middleware.
- **JWT secret rotation** isn't implemented — a leaked `JWT_SECRET_KEY`
  invalidates every issued token only by changing the key (which also logs
  out every user); no per-token revocation list exists.
- **Rate limiting is in-memory, single-process** — correct for the current
  single-worker deployment; needs `RATE_LIMIT_STORAGE_URI=redis://...`
  before running multiple uvicorn workers, or each worker enforces its own
  independent limit instead of a shared one (same class of caveat as
  Socket.IO's in-process state — see `docs/SOCKET_SCALING.md`).
- **`get_remote_address` trusts `request.client.host` directly** — behind a
  reverse proxy, configure `X-Forwarded-For` trust correctly (see
  `docs/DEPLOYMENT.md`) or every request appears to share one IP/bucket.
- **Billplz/Cloudinary/Firebase/email integrations remain unverified
  against real sandbox credentials** — every "not configured" error path is
  tested (`tests/test_unit_notification_providers.py`), but no actual
  outbound call to any of these providers has ever succeeded in this
  environment. Do not treat any of them as production-verified.
