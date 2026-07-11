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

## Webhook / external callback verification

- **Billplz payment callback** (`POST /payments/billplz/callback`) verifies
  the `X-Signature` HMAC against `BILLPLZ_X_SIGNATURE_KEY` before trusting
  any payment-status change — implemented per Billplz's documented
  algorithm but not yet verified against a real callback (no live Billplz
  account exists in this environment; see `API_TESTING_REPORT.md`).

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

## Known gaps (disclosed)

- **No rate limiting** on any endpoint (login, OTP, refund requests, etc.)
  — a real risk for brute-force/abuse in production. Recommended: add
  `slowapi` or a reverse-proxy-level rate limiter before public launch.
- **CORS is wide open** (`ALLOWED_ORIGINS: list[str] = ["*"]` in
  `config.py`) — appropriate for development, **must** be restricted to
  the actual mobile app / admin dashboard origins before production.
- **No CSP/security headers middleware** — relies entirely on this being
  an API-only backend consumed by native mobile clients and Swagger UI, not
  directly rendering HTML to browsers. If an admin web dashboard is later
  built to consume this API directly, add `secure-headers`-style middleware.
- **JWT secret rotation** isn't implemented — a leaked `JWT_SECRET_KEY`
  invalidates every issued token only by changing the key (which also logs
  out every user); no per-token revocation list exists.
- **The asyncpg naive-datetime timezone bug** (see
  `docs/today-work/DATABASE_CHANGES.md`) is a correctness issue, not a
  security one, but is noted here since it affects audit-log timestamp
  accuracy in pre-Stage-4 code paths.
