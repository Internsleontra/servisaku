# Git Commits — 10 July 2026

All commits below are on `main`, pushed to
`https://github.com/Dineshkuppuraj17/servisaku-mobile-Partner`.

## `609a825` — fix: reconcile SQLAlchemy models with the live servisakudb schema

Carried over from the prior session, committed at the start of today's
session before Payment Gateway work began. Moved identity from this app's
private `auth_users` table to the shared `users` table, and fixed
`Partner`/`PartnerDocument`/`PartnerAvailability`/`Review`/`Notification`
column-level drift against the live database — without this, a `Partner` row
could not be created at all.

## `6b2b4aa` — feat(payments): Stage 1 - Billplz payment gateway against live booking schema

The Payment Gateway, rebuilt from scratch mid-session after discovering the
live schema didn't match the original Stripe/job-centric plan (see
`DATABASE_CHANGES.md` for the full discovery). Adds: `Booking`, `Payment`,
`Refund`, `Service`, `ServiceCategory`, `ConsumerAddress` models; a minimal
consumer booking flow; Billplz integration (real, self-serve sandbox) and an
iPay88 stub (no self-serve sandbox exists); the escrow/refund-approval
workflow against `payments.status`/`refunds.status`.

*(An earlier, Stripe-based attempt at this stage was written, then fully
discarded — deleted, not committed — once the live schema was discovered.
No trace of it remains in history.)*

## `4817420` — refactor(payments): provider-agnostic gateway interface + docs hardening

Requested by the user after approving Stage 1: refactored direct
`billplz_service` calls into a `PaymentGateway` abstract interface +
registry so gateway selection never requires route/business-logic changes;
verified by exercising both `BILLPLZ` and `IPAY88` through the same code
path. Added Swagger request/response examples to every payment/consumer
schema and endpoint. Added `docs/BILLPLZ_SETUP.md`. Fixed stale
payment/escrow claims in `README.md`, `SERVICE_PARTNER_MODULE_DOCUMENTATION.md`,
`SYSTEM_DESIGN.md`, `PRODUCT_KNOWLEDGE.md`.

## `de8243a` — feat(uploads): Stage 2 - Cloudinary media uploads (avatar, KYC, job photos)

Avatar, KYC document, and job/booking photo uploads via Cloudinary's free
tier, reusing existing DB fields with zero schema changes. Both a validated
server-side upload path and a signed direct-to-Cloudinary path, per the task
list. Real magic-byte MIME sniffing, size limits, automatic image
optimization. Also fixed a pre-existing duplicate `payments_router`
registration in `main.py` found while wiring in the new router.

## `fa9b57e` — Merge branch 'main' of github.com:Dineshkuppuraj17/servisaku-mobile-Partner

Reconciles a diverged remote: `origin/main` had gained one commit
(`75aef4e`, 2 July 2026, "Delete backend/.env.example", authored by
Animesh) that this session's local history didn't have. Resolved a
modify/delete conflict on `backend/.env.example` by keeping it — this
session's Stage 1 and Stage 2 work both actively depend on it as the
template for `BILLPLZ_*`/`IPAY88_*`/`CLOUDINARY_*` config, and you'd
explicitly asked twice this session to keep it updated. **Flagged for your
attention**: worth confirming that the July 2 deletion wasn't an intentional
decision this merge just undid.

---

Pushed to `origin/main`: `75aef4e..fa9b57e`.
