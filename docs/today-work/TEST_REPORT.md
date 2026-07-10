# Test Report — 10 July 2026

All testing was done with real HTTP calls against the live `servisakudb`
through the SSH tunnel — no mocks, no separate test database. No automated
test suite exists yet in this repo (tracked as a future stage).

## Payment Gateway

| Check | Result |
|---|---|
| Clean app boot / mapper registry configures with no errors | ✅ |
| Consumer login (shared `/auth/login`, role `consumer` in JWT) | ✅ |
| Browse service categories/services | ✅ |
| Create/list saved addresses | ✅ |
| Create a booking; reject foreign address_id (404), invalid time_slot (422) | ✅ |
| Create bill — clean 503 when Billplz unconfigured (not a crash) | ✅ |
| Create bill with explicit `payment_gateway: "BILLPLZ"` vs `"IPAY88"` — both route correctly through the gateway registry with zero special-casing in route code | ✅ |
| `GET /payments/transactions` — empty list, no errors | ✅ |
| Admin-only endpoints (`/release`, refund approve/reject/complete) reject non-admin (403) | ✅ |
| Refund/payment 404s for IDs that don't exist or aren't owned by the caller | ✅ |
| Regression: partner `/me`, `/wallet/balance`, `/jobs/today` unaffected | ✅ |
| Billplz X-Signature algorithm — unit-tested in isolation (accepts a correctly-signed payload, rejects a tampered one) | ✅ (algorithm self-consistency only) |
| Real outbound `create_bill`/`get_bill` HTTP calls to Billplz | ⏳ Pending sandbox credentials |
| Real Billplz callback delivery and signature verification | ⏳ Pending sandbox credentials + public tunnel |

## Media Uploads

| Check | Result |
|---|---|
| Clean app boot with `uploads_router` registered (10 routes) | ✅ |
| Valid JPEG/PNG (real files, generated via Pillow) pass magic-byte validation, reach the Cloudinary-not-configured 503 boundary | ✅ |
| Spoofed file — text content renamed `.jpg` with `Content-Type: image/jpeg` header — correctly rejected (422) by magic-byte sniffing, not fooled by the declared header | ✅ |
| Oversized file (11MB against a 10MB limit) correctly rejected (422) with accurate size reporting | ✅ |
| Invalid `document_type` rejected by Pydantic `Literal` validation (422) | ✅ |
| Upload to a nonexistent/foreign job rejected (404) | ✅ |
| Consumer blocked from KYC document upload (403, partner-only) | ✅ |
| `GET /uploads/kyc-documents` returns an empty list cleanly pre-upload | ✅ |
| Avatar upload/delete work identically for both partner and consumer roles through the shared scope dependency | ✅ |
| Signed-upload signature generation — independently recomputed the HMAC-SHA1 by hand per Cloudinary's documented algorithm; matches the SDK's own `cloudinary.utils.api_sign_request` output exactly | ✅ |
| Real outbound `upload`/`destroy` HTTP calls to Cloudinary | ⏳ Pending free-tier credentials |

## Full regression pass (after both stages, post-merge)

`GET /partner/me`, `GET /jobs/today`, `GET /wallet/balance`, `GET /reviews`,
`GET /notifications`, `GET /consumer/bookings`, `GET /payments/transactions`,
`GET /openapi.json`, `GET /docs` — all returned `200`. Zero regressions from
either stage's changes.

## Why the third-party API calls themselves are unverified

Both Billplz and Cloudinary require account signup before any real API call
can be made — an autonomous agent can't complete email verification / phone
verification flows required for third-party account creation. Per your
instructions, sandbox signup for Billplz is yours to do; Cloudinary's free
tier signup was listed as part of this stage's task but no credentials exist
yet. Everything short of the literal external HTTP call has been verified;
the two exceptions (Billplz X-Signature algorithm never seen a real
callback, and both providers' outbound calls) are called out explicitly
rather than assumed to work.
