# Testing Guide (Stage 8)

## Running the suite

```bash
cd backend
pip install -r requirements.txt
python -m pytest tests/ -v
```

With coverage:

```bash
python -m pytest tests/ --cov=. --cov-report=term-missing --cov-report=html
# open htmlcov/index.html for the browsable report
```

Socket.IO tests (`tests/test_socketio.py`) additionally need a real running
server, since python-socketio's client speaks the Engine.IO transport
protocol over real HTTP, not in-process ASGI:

```bash
uvicorn main:socket_app --host 127.0.0.1 --port 8000 &
python -m pytest tests/test_socketio.py -v
```

They skip cleanly (not fail) if nothing is listening on
`SOCKETIO_TEST_URL` (default `http://127.0.0.1:8000`).

## Architecture: why this suite runs against the real dev database

There is no separate test/staging database provisioned for this project —
`servisakudb` (AWS RDS, reached via the same SSH tunnel used throughout
development) is the only environment that exists. `tests/conftest.py` runs
the suite in-process against `main.app` via httpx's `ASGITransport` (no
separate server process needed for the REST suite) and the real database,
the same way every stage's manual live-verification was done throughout
this project.

This is a deliberate tradeoff, not an oversight:

- **Pro**: tests exercise the exact same live schema, enum values, FK
  constraints, and generated columns that broke things twice during Stage 6
  development (see docs/ADMIN_BACKEND.md) — a mocked/sqlite test DB would
  not have caught either bug.
- **Con**: tests are not isolated from each other or from concurrent manual
  testing/other team members' work on the same shared database, and the
  suite writes real rows (coupons, categories, support tickets, etc.).

**Every test that creates data is written to be additive and safe to
re-run**: fixed test data uses unique, timestamp-suffixed identifiers
(coupon codes, category slugs) so re-running the suite never collides with
its own prior run; tests that touch shared seed data (e.g. the partner
availability test) are written to preserve or expand coverage rather than
narrow it, since other tests and Stage 4 dispatch matching depend on the
seeded partner remaining bookable. See the module docstring in
`tests/test_dispatch_engine_flow.py` and `tests/test_partner_api.py` for
the two most deliberate examples of this.

## Test organization

| File | Covers |
|---|---|
| `test_unit_auth.py` | Password hashing, JWT create/decode — no DB, no network |
| `test_unit_uploads.py` | Magic-byte MIME sniffing, upload validation — no DB, no network |
| `test_unit_partner_kyc.py` | `partners.status` -> `kyc_status` translation helper |
| `test_auth_api.py` | Login, token refresh, RBAC gating fundamentals |
| `test_partner_api.py` | Partner profile, availability, jobs-today, wallet, reviews |
| `test_jobs_earnings_api.py` | Job lists, earnings breakdowns |
| `test_consumer_api.py` | Catalog browsing, addresses, booking creation |
| `test_payments_api.py` | Transaction history, refund/payment validation and 404 paths |
| `test_uploads_api.py` | Upload validation paths (no real Cloudinary needed) |
| `test_notifications_api.py` | Device tokens, preferences, delivery logs |
| `test_dispatch_api.py` | Dispatch route-layer validation/RBAC |
| `test_dispatch_engine_flow.py` | **Integration**: real candidate ranking, start/decline/retry/accept lifecycle |
| `test_chat_api.py` | Chat REST fallback |
| `test_admin_api.py` | All 10 admin route groups: RBAC enforcement, CRUD, error paths |
| `test_analytics_api.py` | All 11 analytics endpoints, RBAC, cross-checked funnel math |
| `test_integration_flows.py` | Multi-step: support ticket lifecycle, catalog CRUD, RBAC role assignment |
| `test_socketio.py` | JWT auth accept/reject, heartbeat round-trip (needs a live server) |

## Known gaps (disclosed, not hidden)

- **Third-party provider integrations** (Billplz bill creation, Cloudinary
  upload success path, Firebase push, Resend/Brevo/MailerSend email) can't
  be exercised end-to-end — no real credentials exist in this environment
  (see `docs/today-work/TEST_REPORT.md` "Why the third-party API calls
  themselves are unverified"). Everything short of the literal external
  HTTP call is tested: validation, error handling, and the "gateway not
  configured" failure path all return the correct clean error rather than a
  500 or a fake success.
- **`services/realtime/socket_server.py`** runs inside the separate
  `uvicorn` process that `test_socketio.py` connects to over real HTTP —
  `pytest-cov` can only instrument code executing in the pytest process
  itself, so this file's coverage number understates how thoroughly it was
  actually exercised (both by `test_socketio.py` here and by the extensive
  manual live-verification documented in `docs/SOCKET_ARCHITECTURE.md`).
- **KYC document verify/reject** (`admin_partners.py`) has no uploaded
  document to exercise against in the current live data (depends on the
  Cloudinary gap above) — covered by 404-path tests instead of the
  happy path.

## Coverage

See `docs/today-work/TEST_REPORT.md` for the exact numbers from the most
recent run. Coverage is measured with `.coveragerc` excluding `tests/`,
`migrations/`, `seed.py`, and `main.py` (startup/wiring code, not business
logic) from the denominator.
