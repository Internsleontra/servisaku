# API Updates — 10 July 2026

39 new endpoints across 4 route groups (3 new, 1 extending the existing
Notifications group). Full request/response schemas and examples are in
Swagger UI (`/docs`) — this is a quick-reference summary. See
`backend/API_TESTING_REPORT.md` for verification status per endpoint.

## Consumer (`/api/v1/consumer/*`) — 6 endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/consumer/service-categories` | List active categories |
| GET | `/consumer/services` | List active services, optional `?category_id=` |
| POST | `/consumer/addresses` | Add a saved address |
| GET | `/consumer/addresses` | List saved addresses |
| POST | `/consumer/bookings` | Create a booking (`PENDING_PAYMENT`) |
| GET | `/consumer/bookings` | List my bookings |

## Payments (`/api/v1/payments/*`) — 11 endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/payments/bookings/{booking_id}/bill` | Create/reuse a gateway checkout bill (`payment_gateway`: `BILLPLZ` default, `IPAY88`) |
| POST | `/payments/billplz/callback` | Billplz webhook receiver (public, X-Signature auth) |
| GET | `/payments/transactions` | Merged payment+refund history |
| GET | `/payments/bookings/{booking_id}` | List payments for a booking |
| GET | `/payments/{payment_id}` | Get a payment |
| POST | `/payments/{payment_id}/sync` | Manually re-fetch status from the gateway |
| POST | `/payments/{payment_id}/release` | Admin: release escrow |
| POST | `/payments/{payment_id}/refunds` | Request a refund |
| POST | `/payments/refunds/{refund_id}/approve` | Admin: approve |
| POST | `/payments/refunds/{refund_id}/reject` | Admin: reject |
| POST | `/payments/refunds/{refund_id}/complete` | Admin: mark completed after manual gateway-side execution |

## Uploads (`/api/v1/uploads/*`) — 10 endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/uploads/avatar` | Upload partner/consumer avatar |
| DELETE | `/uploads/avatar` | Delete avatar |
| POST | `/uploads/kyc-documents` | Upload/replace a KYC document |
| GET | `/uploads/kyc-documents` | List my KYC documents |
| DELETE | `/uploads/kyc-documents/{document_id}` | Delete a KYC document |
| POST | `/uploads/jobs/{job_id}/photos` | Upload a job photo (`photo_type`: before/after/general) |
| GET | `/uploads/jobs/{job_id}/photos` | List a job's photos |
| DELETE | `/uploads/jobs/{job_id}/photos/{photo_id}` | Delete a job photo |
| POST | `/uploads/signature` | Get signed params for a direct-to-Cloudinary upload |
| POST | `/uploads/confirm` | Persist the result of a direct upload |

## Notification Dispatch (`/api/v1/notifications/*`) — 12 endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/notifications/device-tokens` | Register/reactivate a device token (upsert) |
| GET | `/notifications/device-tokens` | List my device tokens |
| PUT | `/notifications/device-tokens/{id}` | Update type/active flag |
| DELETE | `/notifications/device-tokens/{id}` | Remove a device token |
| GET | `/notifications/preferences` | Get my preferences (auto-creates defaults) |
| PUT | `/notifications/preferences` | Update preferences |
| POST | `/notifications/topics/subscribe` | Subscribe my devices to an FCM topic |
| POST | `/notifications/topics/unsubscribe` | Unsubscribe |
| POST | `/notifications/topics/{topic}/send` | Admin: broadcast to a topic |
| GET | `/notifications/logs` | My delivery history across all channels |
| POST | `/notifications/logs/{id}/retry` | Admin: retry one failed delivery |
| POST | `/notifications/retry-failed` | Admin: bulk retry recent failures |

## Breaking changes

None — every existing endpoint's request/response shape is unchanged.

## Notable design decisions

- **Payment gateway is provider-agnostic** at the API level: `payment_gateway`
  in the bill-creation request body is a real, working switch, not a fixed
  default — verified by creating bills with both `BILLPLZ` and `IPAY88`
  values and confirming both route correctly (`IPAY88` reaches its
  not-yet-available stub, cleanly, with no special-casing anywhere in
  `routes/payments.py`).
- **Uploads support two flows** on purpose (the task asked for both): upload
  the file straight through this API (validated, simplest), or get a signed
  URL and upload directly to Cloudinary from the mobile client, then call
  `/uploads/confirm` — useful for large files on slow connections.
- **Notification delivery is best-effort and non-blocking by design**: a
  failing or unconfigured channel (e.g. Firebase not set up yet) never
  surfaces as an error to the triggering action — it's logged to
  `notification_logs` as `FAILED` instead, retryable later via
  `/notifications/retry-failed`. Confirmed live: submitting feedback with a
  registered device token but zero notification providers configured still
  returns `201`, with both the push and email attempts correctly logged as
  failed.
- **`GET /notifications/logs` vs. `GET /notifications`**: intentionally
  distinct. The former is the delivery-attempt log across push/SMS/email
  (with provider and status); the latter is the pre-existing in-app
  notification list. A single triggering event produces one row in the
  latter and up to three in the former (one per requested channel).
