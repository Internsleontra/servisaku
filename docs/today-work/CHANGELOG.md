# Changelog — 10 July 2026

## Added

### Payment Gateway (Stage 1)
- `models/booking.py`, `models/catalog.py` (`Service`, `ServiceCategory`),
  `models/consumer_address.py`, `models/payment.py` (`Payment`, `Refund`) —
  mapped to the live shared schema.
- `routes/consumer.py` — minimal consumer flow: browse categories/services,
  manage saved addresses, create/list bookings.
- `routes/payments.py` — bill creation, Billplz callback, transaction
  history, payment sync/release, refund request/approve/reject/complete.
- `services/gateway_base.py`, `services/gateway_registry.py`,
  `services/billplz_gateway.py`, `services/ipay88_gateway.py` — provider-
  agnostic payment gateway interface.
- `auth.py`: `get_current_consumer_id` (auto-provisions a `consumer_profiles`
  row on first use), `get_current_admin_id`.
- `docs/BILLPLZ_SETUP.md` — sandbox signup walkthrough.
- Config: `BILLPLZ_*`, `IPAY88_*`, `APP_PUBLIC_BASE_URL`, `PAYMENT_CURRENCY`.

### Media Uploads (Stage 2)
- `services/cloudinary_service.py` — validated server-side upload, signed
  direct-upload params, delete, magic-byte MIME sniffing.
- `routes/uploads.py` — avatar (partner/consumer), KYC documents, job
  photos (before/after), signed-upload + confirm flow.
- `schemas/upload.py`.
- Config: `CLOUDINARY_*`, `MAX_UPLOAD_SIZE_MB`.

## Changed

- `routes/jobs.py`: ended the session unchanged from its prior-session state
  — an experimental Stripe-era escrow tweak was tried and then reverted when
  that whole approach was discarded (see `GIT_COMMITS.md`).
- `models/consumer_profile.py`: now writable (was read-only), gained
  `created_at`/`updated_at`.
- `main.py`: registered `consumer_router`, `payments_router`,
  `uploads_router`; added their Swagger tag descriptions.
- `seed.py`: added consumer profile/address, one sample service, one sample
  `PENDING_PAYMENT` booking for end-to-end testing.
- `backend/API_TESTING_REPORT.md`: added Consumer (6), Payments (11), and
  Uploads (10) endpoint sections.
- `README.md`, `SERVICE_PARTNER_MODULE_DOCUMENTATION.md`, `SYSTEM_DESIGN.md`,
  `PRODUCT_KNOWLEDGE.md`: corrected stale payment/escrow/file-upload claims
  with targeted fixes and dated addendum notes (not full rewrites — these
  documents are largely authored by other team members).

## Fixed

- `main.py`: `payments_router` was registered twice via
  `app.include_router` (duplicated every payment route in the OpenAPI
  schema — harmless but sloppy; found while wiring in `uploads_router`).

## Removed

- `services/billplz_service.py`, `services/ipay88_service.py` — replaced by
  the provider-agnostic `*_gateway.py` equivalents.
