# Billplz Sandbox Setup Guide

Billplz is the primary payment gateway implemented in Stage 1 of the Payment
Gateway module (`backend/services/billplz_gateway.py`). It was chosen over
iPay88 for the *first* integration purely because it has a free, self-serve
sandbox — iPay88 requires a manually-approved merchant account (see
"iPay88" below). Both are wired through the same provider-agnostic interface
(`backend/services/gateway_base.py`), so switching the default or adding more
gateways later doesn't require touching route/business logic.

## 1. Create a sandbox account

1. Go to **https://www.billplz-sandbox.com** and sign up.
   - Use `intern@leontra.com` as the account email, per project convention.
   - The sandbox is a fully separate environment from production Billplz —
     no real money moves, and it has its own signup (production credentials
     from `billplz.com` will **not** work here).
2. Confirm the verification email and log in to the sandbox dashboard.

## 2. Create a Collection

Bills in Billplz belong to a "Collection" (roughly: a named bucket of bills,
e.g. per product line).

1. In the sandbox dashboard, go to **Collections → Create Collection**.
2. Name it something like `ServisAku Bookings`.
3. Copy the **Collection ID** shown on the collection's page — this is
   `BILLPLZ_COLLECTION_ID`.

## 3. Get the API Secret Key

1. Go to **Settings → API Keys** (sometimes under your account/profile menu).
2. Copy the **API Secret Key** — this is `BILLPLZ_API_KEY`. It's used as the
   HTTP Basic Auth username on every API call (no password needed).

## 4. Get the X Signature Key

1. Still under **Settings**, find **X Signature Key** (used to verify that
   webhook callbacks genuinely came from Billplz, not a forged request).
2. Copy it — this is `BILLPLZ_X_SIGNATURE_KEY`.

## 5. Fill in `.env`

```env
BILLPLZ_BASE_URL=https://www.billplz-sandbox.com/api/v3
BILLPLZ_API_KEY=<your API Secret Key>
BILLPLZ_COLLECTION_ID=<your Collection ID>
BILLPLZ_X_SIGNATURE_KEY=<your X Signature Key>
```

`BILLPLZ_BASE_URL` already defaults to the sandbox URL in `.env.example` —
only change it to `https://www.billplz.com/api/v3` when actually moving to
production, which is out of scope for now.

## 6. Callbacks need a public URL

Billplz sends payment confirmations by POSTing to the bill's `callback_url`,
which this backend builds from `APP_PUBLIC_BASE_URL` as:

```
{APP_PUBLIC_BASE_URL}/api/v1/payments/billplz/callback
```

Billplz's servers can't reach `http://localhost:8000` — so for local
development, either:

- **Tunnel your local server** (e.g. `ngrok http 8000`) and set
  `APP_PUBLIC_BASE_URL` to the tunnel's HTTPS URL, or
- **Skip the callback and poll manually** — call
  `POST /api/v1/payments/{payment_id}/sync` after paying a test bill. It
  re-fetches the bill's status directly from Billplz and applies the same
  status transition the callback would have.

## 7. Test the flow

1. Create a booking: `POST /api/v1/consumer/bookings` (as a consumer).
2. Create a bill: `POST /api/v1/payments/bookings/{booking_id}/bill` with
   `{"payment_method": "FPX", "payment_gateway": "BILLPLZ"}`.
3. Open the returned `bill_url` in a browser — the Billplz sandbox checkout
   page accepts test card numbers / test FPX bank selections (shown on the
   page itself; sandbox test instruments change occasionally, so use
   whatever the sandbox checkout page currently offers).
4. Either wait for the callback (if tunneled) or call
   `POST /api/v1/payments/{payment_id}/sync` to confirm payment.
5. Check `GET /api/v1/payments/{payment_id}` — status should move
   `INITIATED` → `HELD_IN_ESCROW`, and the booking's `booking_status` should
   move `PENDING_PAYMENT` → `CONFIRMED`.

## Verifying the X-Signature algorithm

`BillplzGateway.verify_callback_signature()` implements the algorithm
documented at support.billplz.com/api (HMAC-SHA256 over sorted
`key`+`value` pairs joined with `|`), but this was written **without** a real
sandbox account to test against. Once real callbacks start arriving, check
the server logs for any `hmac_verified: false` on a payment that should have
succeeded — that would mean the algorithm needs adjusting against Billplz's
actual behavior.

## iPay88 (not yet available)

iPay88 requires a manually-approved merchant account — there's no self-serve
sandbox equivalent to Billplz's. To get test credentials, email
**support@ipay88.com.my** requesting sandbox/demo access. Once
`IPAY88_MERCHANT_CODE` / `IPAY88_MERCHANT_KEY` are available,
`backend/services/ipay88_gateway.py` needs its stub methods replaced with a
real implementation against iPay88's actual API documentation (their request
signing scheme is MD5-based, different from Billplz's HMAC-SHA256 — do not
assume the two are structurally similar).
