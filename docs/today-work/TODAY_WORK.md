# Today's Work — 10 July 2026

## Summary

Three backend stages were completed against the live shared AWS RDS database
(`servisakudb`, via SSH tunnel): **Payment Gateway** (Stage 1), **Media
Uploads** (Stage 2), and **Notification Dispatcher** (Stage 3). All three were
preceded by real discoveries about the live database that changed the
implementation approach mid-stream — documented in detail below and in
`DATABASE_CHANGES.md`.

## Timeline

1. **Model reconciliation carried over from the prior session** — a
   `Partner` row could not be created against `servisakudb` at all before
   this fix (identity split between this app's private `auth_users` and the
   shared `users` table). Fixed and committed (`609a825`) before this
   session's Payment Gateway work began.

2. **Payment Gateway, first attempt (Stripe, job-centric)** — built against
   the master prompt's literal instructions. While booting the app,
   `Base.metadata.create_all()` revealed that `payments`/`refunds` tables
   **already existed** in the shared database, built by another team member:
   keyed on `booking_id`/`consumer_id` (not this app's `jobs`/`customers`),
   using `IPAY88`/`BILLPLZ` gateway enums (not Stripe), with escrow modeled
   as payment status values. Both tables had 0 rows — no data was at risk —
   but the Stripe-based code would have failed on first write. Discarded and
   rebuilt.

3. **Payment Gateway, rebuilt against the real schema** — required standing
   up minimal booking-chain scaffolding first (0 bookings existed anywhere):
   read models for the existing service catalog, a writable consumer address
   model, a `Booking` model, and a minimal consumer-facing route group. Then
   Billplz (self-serve free sandbox) and a stubbed iPay88 (no self-serve
   sandbox exists) were implemented against the real `payments`/`refunds`
   tables. Committed as `6b2b4aa`.

4. **Approved by the user**, who asked for: full documentation pass,
   Swagger/OpenAPI examples on every endpoint, and a provider-agnostic
   gateway architecture so future gateways don't require business-logic
   changes. Delivered: `services/gateway_base.py` (interface) +
   `services/gateway_registry.py`, request/response examples on every
   payment/consumer schema, `docs/BILLPLZ_SETUP.md`, and targeted fixes to
   five other repo docs that had stale payment claims (iPay88-only plans,
   24h auto-escrow, Stripe roadmap mentions). Committed as `4817420`.

5. **Stage 2 — Cloudinary media uploads.** Avatar (partner + consumer), KYC
   documents, and job photos (before/after), reusing existing DB fields
   exactly as they were — no schema changes. Both a server-side validated
   upload path and a signed direct-to-Cloudinary path were implemented,
   since the task explicitly asked for both. Real magic-byte MIME sniffing
   (not just trusting the declared Content-Type), size limits, and automatic
   image optimization. Also fixed a pre-existing duplicate router
   registration bug found while touching `main.py`. Committed as `de8243a`.

6. **Merged and pushed.** The remote had diverged (a July 2 commit deleted
   `backend/.env.example`, while today's four commits actively extend that
   same file) — resolved by keeping the file, since it's the active template
   for Billplz/iPay88/Cloudinary config this session added, per your own
   explicit instructions this session to keep it updated. Flagged in case
   that deletion was actually intentional. Merged (`fa9b57e`) and pushed to
   `origin/main`.

7. **Pre-Stage-3 verification checklist** (your explicit ask before starting
   Stage 3): confirmed zero untracked/stray implementation files anywhere,
   local `main` exactly matched `origin/main`, discarded a trivial pre-existing
   whitespace-only diff in `backend/schemas/feedback.py` unrelated to any of
   this work, reinstalled from `requirements.txt` to confirm it reproduces the
   environment, and did a full boot + Swagger/ReDoc verification against the
   live database.

8. **Stage 3 — Notification Dispatcher.** Before writing any code, re-checked
   the live schema (per the established pattern) and found it had grown
   substantially since Stage 1/2 with entirely new tables from other team
   members' concurrent work (`device_tokens`, `notification_logs`,
   `notification_preferences`, plus unrelated `payment_transactions`,
   `escrow_transactions`, and several `*_legacy_stub` tables). Confirmed
   nothing already built (`payments`, `refunds`, `bookings`, `reviews`,
   `notifications`) had drifted, then built the dispatcher directly against
   the three new, empty, purpose-built tables: Firebase push (Spark/free
   plan), email via Resend→Brevo→MailerSend fallback, and a mock SMS
   provider, all behind provider interfaces mirroring the Payment Gateway's
   architecture. Wired into registration, booking creation, payment
   confirmation, and feedback submission. Found and fixed two real bugs
   during verification (a foreign-key race with `BackgroundTasks`, and an
   unconfigured-provider exception that could have broken payment
   confirmation) — see `DATABASE_CHANGES.md` and `TEST_REPORT.md`. Committed
   as `9572c0e`.

## What's genuinely done vs. pending real credentials

All three stages are **fully implemented and verified against the live
database** end-to-end — every DB write, authorization boundary, validation
rule, and error path was exercised with real HTTP calls. What's **not yet
verified** is the literal outbound call to each third-party API, because no
real credentials exist yet for any of them:

- **Billplz**: sandbox account is free and self-serve — you said you'd
  create it separately. See `docs/BILLPLZ_SETUP.md`.
- **Cloudinary**: free tier, self-serve at
  `https://cloudinary.com/users/register/free` using `intern@leontra.com`.
  Nobody has signed up yet.
- **iPay88**: stubbed on purpose — no self-serve sandbox exists; requires
  emailing `support@ipay88.com.my` for a manually-approved merchant account.
- **Firebase**: free (Spark plan) project at
  `https://console.firebase.google.com` using `intern@leontra.com`. Nobody
  has signed up yet.
- **Resend / Brevo / MailerSend**: all free-tier, self-serve. Nobody has
  signed up for any of them yet — the dispatcher tries whichever ones have
  an API key configured, in that preference order.

Once real keys land in `.env`, the only thing that could still need
adjustment is the Billplz X-Signature verification algorithm (implemented
per their documentation but never checked against a real callback) — the
Cloudinary signed-upload signature and the Firebase/email integrations have
no equivalent risk since they all call each vendor's own SDK/well-documented
REST contract rather than a hand-written reimplementation of a signing
scheme.

See `TEST_REPORT.md` for the full verification breakdown.
