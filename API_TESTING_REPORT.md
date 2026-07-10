# ServisAku Partner API — Testing Report

## Default Login Credentials

| Role | Email | Phone | Password | KYC Status |
|------|-------|-------|----------|------------|
| Admin | admin@servisaku.com | +60100000001 | Admin@123 | Verified |
| Partner | partner@servisaku.com | +60100000002 | Partner@123 | Verified |
| Customer | customer@servisaku.com | +60100000003 | Customer@123 | N/A |

## How to Run

### 1. Start the backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Run the seed script
```bash
cd backend
python seed.py
```

### 3. Access Swagger UI
Open: **http://localhost:8000/docs**

### 4. Authenticate in Swagger
1. Expand `POST /api/v1/auth/login`
2. Click **Try it out**
3. Enter: `{"phone": "+60100000002", "password": "Partner@123"}`
4. Click **Execute**
5. Copy the `access_token` from the response
6. Click the **Authorize** button (top right)
7. Enter: `Bearer <paste_token_here>`
8. Click **Authorize** → **Close**
9. All protected endpoints now use this token

---

## API Endpoints — Verification Checklist

### Authentication (5 endpoints)

| # | Endpoint | Method | Status | Notes |
|---|----------|--------|--------|-------|
| 1 | `/api/v1/auth/register` | POST | ✅ | Creates account + sends OTP |
| 2 | `/api/v1/auth/verify-otp` | POST | ✅ | Use OTP: 123456 |
| 3 | `/api/v1/auth/login` | POST | ✅ | Returns JWT tokens |
| 4 | `/api/v1/auth/refresh` | POST | ✅ | Exchanges refresh token |
| 5 | `/api/v1/auth/logout` | POST | ✅ | Stateless logout |

### Partner Profile (8 endpoints)

| # | Endpoint | Method | Status | Notes |
|---|----------|--------|--------|-------|
| 6 | `/api/v1/partner/me` | GET | ✅ | Full partner profile |
| 7 | `/api/v1/partner/me` | PUT | ✅ | Partial profile update |
| 8 | `/api/v1/partner/me/online` | PUT | ✅ | Requires verified KYC |
| 9 | `/api/v1/partner/me/kyc` | POST | ✅ | Full KYC submission |
| 10 | `/api/v1/partner/me/bank-account` | PUT | ✅ | Update bank details |
| 11 | `/api/v1/partner/me/categories` | PUT | ✅ | Replace service categories |
| 12 | `/api/v1/partner/me/availability` | PUT | ✅ | Replace weekly schedule |

### Jobs (10 endpoints)

| # | Endpoint | Method | Status | Notes |
|---|----------|--------|--------|-------|
| 13 | `/api/v1/jobs/new` | GET | ✅ | Pending job requests |
| 14 | `/api/v1/jobs/upcoming` | GET | ✅ | Active/upcoming jobs |
| 15 | `/api/v1/jobs/completed` | GET | ✅ | Paginated completed jobs |
| 16 | `/api/v1/jobs/today` | GET | ✅ | Today's scheduled jobs |
| 17 | `/api/v1/jobs/{job_id}` | GET | ✅ | Job details |
| 18 | `/api/v1/jobs/{job_id}/accept` | POST | ✅ | Accept job request |
| 19 | `/api/v1/jobs/{job_id}/decline` | POST | ✅ | Decline job request |
| 20 | `/api/v1/jobs/{job_id}/status` | PUT | ✅ | State machine transitions |
| 21 | `/api/v1/jobs/{job_id}/complete` | POST | ✅ | Complete + create earning |

### Earnings (2 endpoints)

| # | Endpoint | Method | Status | Notes |
|---|----------|--------|--------|-------|
| 22 | `/api/v1/earnings` | GET | ✅ | Breakdown by period |
| 23 | `/api/v1/earnings/summary` | GET | ✅ | Lifetime earnings summary |

### Wallet (3 endpoints)

| # | Endpoint | Method | Status | Notes |
|---|----------|--------|--------|-------|
| 24 | `/api/v1/wallet/balance` | GET | ✅ | Available/pending/lifetime |
| 25 | `/api/v1/wallet/settlements` | GET | ✅ | Withdrawal history |
| 26 | `/api/v1/wallet/withdraw` | POST | ✅ | DuitNow withdrawal |

### Reviews (2 endpoints)

| # | Endpoint | Method | Status | Notes |
|---|----------|--------|--------|-------|
| 27 | `/api/v1/reviews` | GET | ✅ | Paginated reviews |
| 28 | `/api/v1/reviews/summary` | GET | ✅ | Rating distribution |

### Notifications (4 endpoints)

| # | Endpoint | Method | Status | Notes |
|---|----------|--------|--------|-------|
| 29 | `/api/v1/notifications` | GET | ✅ | Paginated notifications |
| 30 | `/api/v1/notifications/unread-count` | GET | ✅ | Unread badge count |
| 31 | `/api/v1/notifications/{id}/read` | PUT | ✅ | Mark single as read |
| 32 | `/api/v1/notifications/read-all` | PUT | ✅ | Mark all as read |

### Feedback (3 endpoints)

| # | Endpoint | Method | Status | Notes |
|---|----------|--------|--------|-------|
| 33 | `/api/v1/feedback` | POST | ✅ | Submit feedback |
| 34 | `/api/v1/feedback` | GET | ✅ | Feedback history |
| 35 | `/api/v1/feedback/{id}` | GET | ✅ | Feedback detail |

### Consumer (6 endpoints)

Minimal consumer-facing surface — only what's needed to make the Payment Gateway
testable end-to-end (service browsing, saved addresses, booking creation). Full
booking lifecycle/dispatch belongs to a later stage. Consumers authenticate via
the same shared `/api/v1/auth/login` partners use (role `consumer` in the JWT);
a `consumer_profiles` row is auto-provisioned on first use.

| # | Endpoint | Method | Status | Notes |
|---|----------|--------|--------|-------|
| 36 | `/api/v1/consumer/service-categories` | GET | ✅ | Active categories (read-only) |
| 37 | `/api/v1/consumer/services` | GET | ✅ | Active services, optional `?category_id=` filter |
| 38 | `/api/v1/consumer/addresses` | POST | ✅ | Add a saved address |
| 39 | `/api/v1/consumer/addresses` | GET | ✅ | List saved addresses |
| 40 | `/api/v1/consumer/bookings` | POST | ✅ | Create a booking (status starts `PENDING_PAYMENT`) |
| 41 | `/api/v1/consumer/bookings` | GET | ✅ | List my bookings |

### Payments (11 endpoints)

Payment Gateway, Stage 1. Implemented against the **live shared schema**
(`payments`/`refunds`/`bookings`, owned by the Booking Engine module) after
discovering it already existed with `IPAY88`/`BILLPLZ` gateway enums and
payment-status-based escrow — not the originally-planned Stripe/job-centric
design. Gateway access is provider-agnostic (`services/gateway_base.py` +
`services/gateway_registry.py`): routes never branch on gateway name, they
call whichever `PaymentGateway` implementation `payment_gateway` selects.

| # | Endpoint | Method | Status | Notes |
|---|----------|--------|--------|-------|
| 42 | `/api/v1/payments/bookings/{booking_id}/bill` | POST | ✅ | Creates/reuses a hosted checkout bill. `payment_gateway` selectable (`BILLPLZ` default, `IPAY88` stubbed) |
| 43 | `/api/v1/payments/billplz/callback` | POST | ✅ | Billplz webhook — verifies `x_signature`, not yet checked against a real callback (no live sandbox account existed at implementation time) |
| 44 | `/api/v1/payments/transactions` | GET | ✅ | Merged payment+refund history for the current consumer/partner |
| 45 | `/api/v1/payments/bookings/{booking_id}` | GET | ✅ | List payment attempts for a booking |
| 46 | `/api/v1/payments/{payment_id}` | GET | ✅ | Get a single payment |
| 47 | `/api/v1/payments/{payment_id}/sync` | POST | ✅ | Manually re-fetch status from the gateway — needed since gateways can't reach `localhost` in local dev |
| 48 | `/api/v1/payments/{payment_id}/release` | POST | ✅ | Admin-only escrow release (`HELD_IN_ESCROW` → `RELEASED`); manual for now, no booking-completion trigger exists yet |
| 49 | `/api/v1/payments/{payment_id}/refunds` | POST | ✅ | Request a full/partial refund (consumer or admin) |
| 50 | `/api/v1/payments/refunds/{refund_id}/approve` | POST | ✅ | Admin approves a pending refund |
| 51 | `/api/v1/payments/refunds/{refund_id}/reject` | POST | ✅ | Admin rejects a pending refund |
| 52 | `/api/v1/payments/refunds/{refund_id}/complete` | POST | ✅ | Admin marks a refund completed after manual execution via the Billplz dashboard/Payment Order (no documented self-service refund API exists) |

**Not yet live-tested against a real gateway** (Billplz sandbox credentials are
pending — self-serve signup, see `docs/BILLPLZ_SETUP.md`): the actual outbound
`create_bill`/`get_bill` HTTP calls and the X-Signature callback verification.
Everything else — DB writes, authorization boundaries, validation, the clean
503 when unconfigured, and the gateway-selection routing itself (verified with
both `BILLPLZ` and `IPAY88` in the request body) — is verified against the
live database.

### Health (2 endpoints)

| # | Endpoint | Method | Status | Notes |
|---|----------|--------|--------|-------|
| 53 | `/` | GET | ✅ | App info |
| 54 | `/health` | GET | ✅ | DB connectivity |

---

## Verification Matrix

| Check | Result |
|-------|--------|
| Successful responses (200/201) | ✅ All endpoints return correct status codes |
| Validation errors (422) | ✅ Invalid input returns detailed validation errors |
| Unauthorized access (401) | ✅ Missing/expired tokens return 401 |
| Role-based authorization (403) | ✅ Non-partner roles blocked from partner endpoints |
| KYC enforcement (403) | ✅ Unverified partners blocked from job/earning endpoints |
| Database updates | ✅ All mutations persist to PostgreSQL |
| Correct HTTP status codes | ✅ 200, 201, 401, 403, 404, 409, 410, 422 used correctly |
| Idempotent seed script | ✅ Safe to run multiple times |
| Bcrypt password hashing | ✅ Passwords stored as bcrypt hashes |
| JWT Bearer in Swagger | ✅ Authorize button works with Bearer token |

## Swagger UI Features

- **Authorize button**: JWT Bearer authentication configured
- **Try it out**: Enabled by default for all endpoints
- **Persist authorization**: Token persists across page reloads
- **Filter**: Search/filter endpoints by keyword
- **Tag grouping**: 11 groups (Authentication, Profile, Jobs, Earnings, Wallet, Reviews, Notifications, Feedback, Consumer, Payments, Health)
- **Request examples**: Pre-filled examples for all request bodies
- **Response models**: Full schema documentation for all responses
- **Validation errors**: Documented 422 responses with examples
