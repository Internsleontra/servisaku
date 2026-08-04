# 10 — Remaining Features: Implementation Specification

**Created:** 2026-07-30 · **Status:** Specification — implement in the phase order in §C.
**Scope:** the 10 remaining feature areas (payments, payouts, refunds/disputes, damage claims,
AI chatbot, notifications, email templates, customer support, legal/T&C, Malaysian taxation).

This document extends the existing codebase. **No new project, no re-architecture.** Every
item below names the real file it touches. Where an existing model, route, lib, or component
already does part of the job, the instruction is to *extend* it, never to replace it.

---

# Part A — Architecture findings (read first)

Five things in the current code determine how these features must be built. Three of them
are pre-existing defects that the payment work will otherwise amplify.

### A1. A payment gateway is already integrated — Billplz

`server/lib/billplz.js` + `server/routes/payments.js` implement bill creation, hosted
checkout redirect, X-Signature webhook verification, `WebhookEvent` idempotency, and a
`/sync` fallback for localhost. **This is production-shaped code and must be kept.**

Billplz covers FPX, DuitNow (via FPX rails), cards, and MY e-wallets. It does **not** cover
Apple Pay or Google Pay. Those require a second provider (Stripe is the pragmatic choice —
Apple/Google Pay are wallet wrappers over its card rails, and its `PaymentIntent` model maps
cleanly onto the existing `Payment` row).

**Decision:** generalise `billplz.js` into a provider registry rather than bolting a second
gateway onto the route.

```
server/lib/payments/
  index.js        ← registry: getProvider(name), providerForMethod(method), listMethods()
  billplz.js      ← moved verbatim from server/lib/billplz.js, exports the same names
  stripe.js       ← new: cards + Apple Pay + Google Pay
  cash.js         ← new: no external call; records collection + commission debit
  commission.js   ← new: THE single source of truth for platform fee / partner rate
server/lib/billplz.js  ← becomes a 3-line re-export shim (back-compat; delete in a later phase)
```

`server/routes/payments.js` then selects a provider instead of hardcoding Billplz. Every
existing endpoint keeps its path, request shape, and response shape.

### A2. Money is stored in two units — this will cause a rounding loss

- `Booking.price` is **MYR** (`Float`).
- `Payment.amount` is **sen** (`server/routes/payments.js:65` — `Math.round(booking.price * 100)`),
  and `markPaidAndEscrow` divides by 100 at `payments.js:36`.

Nothing documents this. Before adding a wallet ledger on top, fix it:

- Add `Payment.amountMyr Float` and keep `Payment.amount` (sen) as the gateway-facing value.
- **Every new money model in this spec stores MYR**, matching `Booking.price`, `EscrowLedger`,
  and `PayoutRecord`. Only the gateway adapters convert to sen at the boundary.
- Add a `toSen()` / `fromSen()` pair in `server/lib/payments/index.js` and use it nowhere else.

### A3. Commission is defined in three places, with two different answers

| Location | Value |
|---|---|
| `server/routes/payments.js:12` | `PLATFORM_FEE_RATE = 0.20` |
| `server/routes/payouts.js:108` | `PARTNER_RATE = 0.8` (implies 20%) |
| `src/lib/paymentEngine.js:4` | tiered `0.15 – 0.25` by partner tier — **never used by the server** |

Worse, `server/routes/payouts.js:109` is `Math.round((price||0) * PARTNER_RATE)` — it rounds
partner earnings **to whole ringgit**, silently discarding sen on every job.

**Fix as part of Feature 1:** `server/lib/payments/commission.js` becomes the only place a
rate is decided. It reads the tier table (promoting `src/lib/paymentEngine.js`'s
`COMMISSION_RATES` to the server) and returns `{ rate, commission, netPayout }` rounded with
`round2()`, the helper `server/lib/dynamicPricing.js` already uses. `payments.js`, `payouts.js`,
and every new module import from it. `src/lib/paymentEngine.js` keeps its exports as a
deprecated front-end shim.

### A4. SST is 6% in one file and 8% in another

- `server/lib/dynamicPricing.js:41` — `sstRate: 0.08`, `sstEnabled: false` by default.
- `src/lib/paymentEngine.js:11` — `TAX_RATE = 0.06`.

Malaysian service tax moved from 6% → 8% for most taxable services on 2024-03-01, with some
categories retained at 6%. The server's 8% is the correct default; the front-end 6% is stale
and is what a customer currently sees at checkout.

Feature 10 makes this data-driven via a `TaxConfig` table so the rate is never a literal
again, and back-fills historical bookings from the `priceBreakdown` snapshot they already
carry (`Booking.priceBreakdown`, `Booking.configVersion`) rather than recomputing.

> **Open decision for the business:** confirm ServisAku is SST-registered and which of its
> service categories are taxable at 8% vs 6% vs exempt. `Service.sstEnabled` already exists
> per-service, so the answer is configuration, not code. Implementation below assumes 8% on
> taxable services with per-service opt-in — flag if that is wrong.

### A5. The admin UI is a separate repository — out of scope here

The admin website is built by another developer in its own repo
(`admin` remote → `Dineshkuppuraj17/servisaku-admin`). **This repo does not scaffold
`src/apps/admin/`, and no admin app is mounted in `vite.config.js`.**

`src/pages/Admin{Analytics,Bookings,Communications,Dashboard,Finance,Operations,QualityCenter,Users}.jsx`
are eight pages left over from an earlier stage. Nothing imports them and there is no `/admin`
route anywhere in `src/`. They are dead code superseded by the separate repo; leave them alone
rather than extending them.

Consequences for everything below:

- Every **§7 Admin changes** section is an **API contract for the separate admin app**, not UI
  work in this repo. Ship the admin-scoped endpoints, guarded by
  `requireRole('admin','super_admin')` (`server/middleware/auth.js:60`), and treat their request
  and response shapes as a public interface once the other repo builds against them.
- The admin app runs on a **different origin**, so its URL must be added to the
  `CORS_ORIGIN` env var (`server/index.js:49`, comma-separated). This is deploy configuration,
  not a code change — but nothing admin-facing works until it is done.
- Admin authentication reuses the same JWT and the same `User.role`. No separate admin identity
  system, and no new middleware.

**Nothing in this spec is blocked on admin UI work.** Each feature ships its backend, its
consumer surface, and its partner surface independently.

---

# Part B — Conventions every feature below follows

Derived from the existing code; do not deviate.

| Concern | Existing convention | Reference |
|---|---|---|
| Route file | `Router()` + `router.use(authenticate)` + `asyncHandler` + `validate(zodSchema)` | `server/routes/refunds.js` |
| Errors | `throw new ApiError(status, msg)` from `server/lib/access.js` | `server/lib/access.js:10` |
| Authorization | `isAdmin`, `isBookingParticipant`, `bookingScope`, `requireRole` | `server/lib/access.js` |
| API output | `mapOut(row)` per route, **snake_case**, `created_date` alias kept | `server/routes/payouts.js:22` |
| Notifications | `notify({ userId, event, data })` — never inline mail/SMS | `server/lib/notifications/index.js` |
| New event | add to `CATALOG` in `server/lib/notifications/catalog.js`; nothing else | `catalog.js:36` |
| Out-of-band work | `enqueue(fn, { label })` — never block the response | `server/lib/notifications/queue.js` |
| External provider | pluggable adapter, inert + console-logging when unconfigured | `server/lib/notifications/push.js` |
| Money rounding | `round2()` | `server/lib/dynamicPricing.js` |
| Mount | `server/index.js` — add to both `/api` and `/api/v1` (same `api` router) | `server/index.js:64` |
| Front-end data | `servisaku.entities.X` via `ENTITY_PATHS` | `src/api/apiClient.js:78` |
| Tests | `node --test`, colocated `__tests__/*.test.js` | `server/lib/notifications/__tests__/` |

**Backward compatibility rule applied throughout:** no existing column is dropped or renamed,
no existing endpoint changes its response shape, and every new status value is *added* to an
enum rather than replacing the old set. Where a computed value becomes ledger-backed
(`GET /api/payouts/wallet`), the response keys stay byte-identical.

---

# Part C — Migration & phase order

Nine migrations, each independently deployable. Names follow the existing
`prisma/migrations/<timestamp>_<snake_name>` convention.

| # | Migration | Feature | Depends on |
|---|---|---|---|
| 1 | `payments_provider_registry` | 1 | — |
| 2 | `partner_wallet_ledger` | 1 | 1 |
| 3 | `payouts_settlements` | 2 | 2 |
| 4 | `refunds_disputes` | 3 | 1 |
| 5 | `damage_claims` | 4 | 3 |
| 6 | `support_tickets_v2` | 8 | — |
| 7 | `chatbot_conversations` | 5 | 6 |
| 8 | `legal_documents` | 9 | — |
| 9 | `tax_invoices` | 10 | 1 |

Notifications (6) and email templates (7) are code-only except one small table, and are
folded into whichever migration ships first.

Recommended build order: **1 → 10 → 2 → 3 → 4 → 8 → 6/7 → 9 → 5.**
Rationale: taxation lands before payouts because an invoice's SST line determines the
commissionable base; support lands before the chatbot because escalation needs a ticket to
escalate into.

---

---

# Feature 1 — Payment System

## 1. Business logic

Two settlement models coexist on the same `Booking`.

**Online payment (existing, extended).** Customer pays up-front → funds sit in
`EscrowLedger` (status `held`) → service completes → escrow releases → partner's wallet
`availableBalance` is credited net of commission. ServisAku holds the money and never has to
chase the partner. This already works end-to-end for Billplz; the work is adding methods.

**Cash payment (new).** Nothing is collected up-front. The partner receives cash from the
customer at completion, so **the partner now owes ServisAku the commission**. The cash flow
inverts the money direction, which is why it needs its own ledger rather than reusing escrow:

```
Booking created, paymentMethod = 'cash', paymentStatus = 'pending'
  → partner completes service            (status: completed)
  → partner records collection in-app    (POST /payments/cash/collect)
      · Payment row: method 'cash', provider 'cash', status 'paid'
      · Booking.paymentStatus → 'paid'
      · Invoice issued (Feature 10)
      · WalletLedgerEntry: commission_debit  → wallet.outstandingCommission += commission
      · NO escrow row — ServisAku never held these funds
  → settlement job groups the period's outstanding into a CommissionSettlement
  → partner pays the settlement (online, via the same gateway registry)
      · Payment row: type 'commission_settlement'
      · WalletLedgerEntry: settlement_credit → outstandingCommission -= amount
```

**Enforcement ladder when a settlement passes `dueDate`** — each step is a distinct state so
it is auditable and reversible, and admin can override at any rung:

| Days overdue | Action | Mechanism |
|---|---|---|
| 0 (due) | reminder | `commission_due` notification |
| +1, +3, +7 | escalating reminders | `commission_overdue`, `remindersSent` increments |
| +7 | **freeze new bookings** | `wallet.isFrozen = true` → dispatch filter excludes partner |
| +14 | **suspend payouts** | payout creation blocked while `isFrozen` |
| any | **admin override** | `adminOverrideBy` + reason, written to `WalletLedgerEntry` |

A partner's `availableBalance` from *online* jobs is **not** auto-seized to clear cash
commission — netting the two is a business decision with legal implications. Instead, offer
an explicit "settle from wallet balance" action the partner opts into. Admin can force it
with an override, and every such action is a ledger entry.

**Grace via `creditLimit`:** freezing a partner who owes RM 3.40 is hostile. `wallet.creditLimit`
(default configurable, suggest RM 50) means the ladder only triggers above the limit.

## 2. Database changes

Required. Three new tables (`PartnerWallet`, `WalletLedgerEntry`, `CommissionSettlement`) and
additive columns on `Payment`. Existing `EscrowLedger` and `PayoutRecord` are untouched —
`WalletLedgerEntry` records *movements*, escrow records *custody*; they answer different
questions and both are needed.

**Why a real ledger and not the current computation.** `server/routes/payouts.js:111`
(`computeWallet`) derives balances by re-summing bookings on every request. That is fine for
a demo and wrong for money: it cannot represent an adjustment, a penalty, a damage deduction,
a reversal, or cash commission at all, and it silently rounds to whole ringgit. The ledger is
append-only; balances are materialised on `PartnerWallet` and every change writes a row with
`balanceAfter` so any balance is reproducible and auditable.

## 3. Prisma schema changes

Append to `prisma/schema.prisma`, after the `Payment` model.

```prisma
// ─── §5 Partner wallet & cash-commission settlement ─────────────────────────

model PartnerWallet {
  id                    String    @id @default(cuid())
  partnerId             String    @unique
  // All amounts MYR (see docs/10 §A2). Materialised from WalletLedgerEntry.
  availableBalance      Float     @default(0) // released earnings, withdrawable
  pendingBalance        Float     @default(0) // earned but still in escrow
  outstandingCommission Float     @default(0) // owed to ServisAku from cash jobs
  lifetimeEarnings      Float     @default(0)
  lifetimeCommission    Float     @default(0)
  creditLimit           Float     @default(50) // grace before the freeze ladder starts
  settlementCycle       String    @default("weekly") // weekly | monthly
  nextSettlementDate    DateTime?
  isFrozen              Boolean   @default(false) // blocks new job dispatch
  payoutsSuspended      Boolean   @default(false)
  freezeReason          String?
  frozenAt              DateTime?
  currency              String    @default("MYR")
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  partner     User                  @relation(fields: [partnerId], references: [id], onDelete: Cascade)
  entries     WalletLedgerEntry[]
  settlements CommissionSettlement[]

  @@index([isFrozen])
  @@index([nextSettlementDate])
}

// Append-only. Never UPDATE or DELETE a row — corrections are new reversing rows.
model WalletLedgerEntry {
  id           String   @id @default(cuid())
  walletId     String
  partnerId    String
  type         String // earning_credit | commission_debit | payout_debit | settlement_credit
                      // | escrow_hold | escrow_release | refund_debit | damage_deduction
                      // | penalty | bonus | adjustment | reversal
  direction    String // credit | debit
  bucket       String // available | pending | outstanding
  amount       Float
  balanceAfter Float // bucket balance after this entry — makes any balance reproducible
  description  String
  bookingId    String?
  paymentId    String?
  payoutId     String?
  settlementId String?
  claimId      String?
  reversalOf   String? // WalletLedgerEntry.id this entry reverses
  createdById  String? // admin user id for manual adjustments
  // Guards double-credit when a webhook is redelivered. Composed by the caller,
  // e.g. "earning:<bookingId>" — the DB, not application logic, enforces once-only.
  idempotencyKey String? @unique
  metadata     Json?
  createdAt    DateTime @default(now())

  wallet PartnerWallet @relation(fields: [walletId], references: [id], onDelete: Cascade)

  @@index([partnerId, createdAt])
  @@index([bookingId])
  @@index([type])
}

model CommissionSettlement {
  id                  String    @id @default(cuid())
  walletId            String
  partnerId           String
  reference           String    @unique // human ref, e.g. "STL-2026W31-3F9A"
  cycle               String // weekly | monthly
  periodStart         DateTime
  periodEnd           DateTime
  grossCashCollected  Float     @default(0)
  commissionDue       Float     @default(0)
  sstOnCommission     Float     @default(0) // ServisAku's commission is itself a taxable service
  totalDue            Float     @default(0)
  amountPaid          Float     @default(0)
  status              String    @default("pending") // pending | partially_paid | paid | overdue | waived | written_off
  dueDate             DateTime
  paidAt              DateTime?
  paymentId           String? // Payment row of type 'commission_settlement'
  bookingIds          Json? // snapshot of the bookings rolled into this settlement
  remindersSent       Int       @default(0)
  lastReminderAt      DateTime?
  adminOverrideById   String?
  adminOverrideReason String?
  adminOverrideAt     DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  wallet PartnerWallet @relation(fields: [walletId], references: [id], onDelete: Cascade)

  @@index([partnerId, status])
  @@index([status, dueDate])
}
```

Additive changes to the **existing** `Payment` model (no column dropped or renamed):

```prisma
model Payment {
  // … all existing fields unchanged …
  amountMyr      Float?   // MYR mirror of `amount` (sen) — see docs/10 §A2
  type           String   @default("booking") // booking | commission_settlement | damage_compensation
  partnerId      String?  // set when the payer is a partner (settlement), not the consumer
  settlementId   String?
  refundedAmount Float    @default(0) // MYR, cumulative — supports repeated partial refunds
  sstAmount      Float    @default(0)
  platformFee    Float    @default(0)
  netToPartner   Float    @default(0)
  collectedById  String?  // partner user id who recorded a cash collection
  idempotencyKey String?  @unique

  @@index([type, status])
  @@index([partnerId])
}
```

`Payment.method` gains values — string column, so no migration beyond the zod enum:
`fpx | duitnow | card | applepay | googlepay | tng | grabpay | boost | cash`.
`Payment.provider` gains `stripe | cash` alongside `mock | billplz`.

Add to `model User`: `wallet PartnerWallet?`.
Add to `model Booking`: nothing — cash is fully represented by a `Payment` row.

**Migration:** `prisma/migrations/<ts>_payments_provider_registry` (Payment columns) then
`<ts>_partner_wallet_ledger` (three tables). Both are pure additions, so
`npx prisma migrate dev` generates them without a data-loss prompt. Add a one-off backfill
script `scripts/backfill-wallets.mjs` that creates a `PartnerWallet` per existing partner and
seeds `availableBalance` from the current `computeWallet()` output, writing one
`adjustment` ledger entry per partner labelled `opening_balance` — so the ledger is complete
from day one rather than starting mid-history.

## 4. API changes

**Modified — `server/routes/payments.js`:**

| Endpoint | Change |
|---|---|
| `POST /api/payments/create` | `method` enum widens; select provider via `providerForMethod()` instead of the hardcoded Billplz call at `payments.js:59-86`. Response shape unchanged. Add `client_secret` (Stripe only, nullable) alongside `checkout_url`. |
| `POST /api/payments/webhook/billplz` | unchanged |
| `POST /api/payments/:id/sync` | provider-dispatched instead of `isBillplzReady()`-gated |
| `GET /api/payments/:id` | response gains `type`, `refunded_amount`, `sst_amount` (additive) |

**New — `server/routes/payments.js`:**
- `POST /api/payments/webhook/stripe` — raw-body signature verification, mirrors the Billplz
  handler including the `WebhookEvent` idempotency guard (`payments.js:104-114`).
- `GET  /api/payments/methods` — public. Returns the enabled method list with availability
  derived from configured providers, so the front end stops hardcoding
  `src/lib/paymentEngine.js:13` `PAYMENT_METHODS`.
- `POST /api/payments/cash/collect` — **partner-only**, the cash flow's entry point.
  Body `{ booking_id, amount_collected }`. Asserts caller is the assigned partner and
  `booking.status === 'completed'`. Creates the cash `Payment`, issues the invoice, writes
  the `commission_debit` entry.

**New router — `server/routes/wallet.js`**, mounted at `/api/wallet`:

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/wallet` | partner | balances + freeze state |
| GET | `/api/wallet/ledger` | partner | paginated entries, filter `type`, `from`, `to` |
| GET | `/api/wallet/settlements` | partner | settlement history |
| GET | `/api/wallet/settlements/:id` | partner | detail incl. `bookingIds` |
| POST | `/api/wallet/settlements/:id/pay` | partner | start gateway checkout for the settlement |
| POST | `/api/wallet/settlements/:id/pay-from-balance` | partner | explicit opt-in netting |
| GET | `/api/wallet/admin/outstanding` | admin | commission report, filter/sort/export |
| POST | `/api/wallet/admin/:partnerId/override` | admin | unfreeze / waive / extend due date |
| POST | `/api/wallet/admin/:partnerId/adjust` | admin | manual credit/debit, reason required |

**Kept for compatibility:** `GET /api/payouts/wallet` (`payouts.js:127`) stays at its path
with its exact response keys (`lifetime`, `pending`, `withdrawn`, `withdrawable`, `balance`,
`currency`) — but it now reads `PartnerWallet` instead of re-summing bookings. Existing
callers (`src/pages/PartnerEarnings.jsx`, the Expo partner app) keep working unchanged.

## 5. Backend implementation

```
server/lib/payments/
  index.js       registry + toSen/fromSen; getProvider(name), providerForMethod(method),
                 listAvailableMethods()
  billplz.js     moved from server/lib/billplz.js, unchanged content
  stripe.js      createIntent / retrieveIntent / verifyWebhook / createRefund
  cash.js        no-op provider — satisfies the interface so routes stay uniform
  commission.js  rateFor(partner) / split(gross) — the ONLY commission source (§A3)
server/lib/wallet/
  index.js       public surface: creditEarning, debitCommission, debitPayout,
                 creditSettlement, adjust, reverse, getWallet
  ledger.js      post() — the single write path; runs in prisma.$transaction,
                 recomputes the bucket balance, honours idempotencyKey
  settlement.js  generateSettlements(cycle) / applyPayment / enforcement ladder
  freeze.js      shouldFreeze(wallet) / applyEnforcement(wallet) — pure, unit-testable
server/lib/billplz.js  → re-export shim
```

**Provider interface** (every adapter implements it; `cash.js` returns nulls):

```js
{ name, isReady(), supportsMethod(m),
  createCheckout({ amountSen, method, booking, customer, callbackUrl, redirectUrl, reference }),
  fetchStatus(gatewayRef),
  verifyWebhook(req),           // → { valid, eventId, gatewayRef, status, raw }
  createRefund({ gatewayRef, amountSen, reason }) }
```

**Ledger invariants — enforce these in `ledger.js`, not in callers:**
1. Every write is inside `prisma.$transaction` together with the `PartnerWallet` balance update.
2. `balanceAfter` is computed inside the transaction from the wallet row, never from a prior read.
3. `idempotencyKey` collision is caught and treated as success (return the existing entry) —
   a redelivered webhook must not double-credit.
4. Corrections are `reversal` rows with `reversalOf` set. Nothing is ever updated or deleted.

**Wiring into existing flows:**
- `server/routes/payments.js` `markPaidAndEscrow()` (`payments.js:27`) — after the escrow
  upsert, add `wallet.creditPending(booking, split)`.
- `server/routes/bookings.js` `notifyOnStatusChange()` (`bookings.js:20`) `case 'completed'` —
  for cash bookings, add a `payment_due_cash` consumer notification and a
  `record_cash_collection` partner prompt.
- `server/routes/escrow.js` PATCH → `released` (`escrow.js:54`) — move `pendingBalance` to
  `availableBalance` via `wallet.creditEarning`.
- `server/lib/matching.js` `isPartnerEligible()` — add `&& !wallet.isFrozen`. **This is the
  single line that makes "freeze new bookings" real**; without it the flag is cosmetic.
- `server/index.js` — mount `walletRouter`; start the settlement cron.

**Settlement scheduler:** extend the existing poller pattern in
`server/lib/notifications/queue.js` (`startScheduler`) rather than adding a cron dependency.
`server/lib/wallet/settlement.js` exports `startSettlementWorker(prisma)`, called from
`server/index.js:113` next to `startNotificationWorkers()`. It runs hourly, is idempotent per
period (unique on `reference`), and is safe to run on multiple instances because settlement
creation is guarded by that unique constraint.

## 6. Frontend implementation

**Web (`src/`):**
- `src/pages/PaymentCheckout.jsx` — replace the hardcoded method list with
  `GET /api/payments/methods`; add Apple/Google Pay buttons that only render when
  `window.ApplePaySession` / the Payment Request API reports availability. Cash selection
  shows a "you'll pay the professional directly" confirmation panel.
- `src/pages/PaymentReturn.jsx` — already handles the Billplz redirect; add the Stripe
  `payment_intent` query param branch, reusing the same `/sync` call.
- `src/lib/paymentEngine.js` — becomes a shim: `PAYMENT_METHODS` and `TAX_RATE` marked
  `@deprecated`, `calcPartnerPayout`/`calcPriceBreakdown` re-export server-derived values.
  Keep the file — `src/pages/AdminFinance.jsx` and others import it.
- **New** `src/pages/PartnerWallet.jsx` — balances, outstanding commission banner, ledger
  table, settlement history, "Settle now" CTA. Mount at `/partner/wallet` in
  `src/apps/partner/routes.jsx`; add the nav item to `src/apps/partner/PartnerSidebar.jsx`.
- **New** `src/components/partner/OutstandingCommissionBanner.jsx` — rendered on
  `PartnerDashboard.jsx` when `outstandingCommission > creditLimit`; turns red past `dueDate`.
- **New** `src/pages/admin/AdminCommissions.jsx`.
- `src/api/apiClient.js` — add `Wallet: '/wallet'`, `CommissionSettlement: '/wallet/settlements'`
  to `ENTITY_PATHS` (`apiClient.js:78`), plus a `payments.methods()` / `payments.collectCash()`
  pair alongside the existing custom entity methods (`claim`, `addPhotos`, `addExtra`).

**Mobile:** `servisaku-partner/src/app/partner/wallet.tsx` (+ tab entry) and the cash-collect
sheet inside `servisaku-partner/src/app/job/[id].tsx`. `servisaku-consumer/src/app/payment/`
gains the method picker parity. Both apps already have the API client and notification
center to hang these off.

## 7. Admin changes

- `src/pages/AdminFinance.jsx` (299 lines, exists) — add tabs: **Cash Collections**,
  **Outstanding Commission**, **Settlements**. Reuse its existing card/table components.
- New `AdminCommissions.jsx`: partner list sorted by outstanding, days-overdue column, freeze
  state, one-click override with mandatory reason, CSV export.
- Freeze/unfreeze and manual adjustment both require a reason string — the API rejects an
  empty one, and the reason lands in `WalletLedgerEntry.description`.

## 8. Customer changes

Method picker gains DuitNow, Apple Pay, Google Pay, and Cash. Cash bookings show
"Pay RM X to your professional on completion" on `BookingDetail.jsx` and a receipt once the
partner records collection. Customers see nothing about commission — that is strictly a
ServisAku↔partner concern.

## 9. Partner changes

New wallet screen; cash-collection confirmation on job completion; outstanding-commission
banner; settlement payment flow; explicit warning at the freeze threshold ("settle RM X by
<date> to keep receiving jobs"). When frozen, the job feed shows an explanatory empty state
rather than silently returning nothing.

## 10. Notifications

Add to `CATALOG` in `server/lib/notifications/catalog.js` (all `role: 'partner'` except the
first two):

| Event | Category | Priority | Channels |
|---|---|---|---|
| `payment_due_cash` (consumer) | payments | high | in_app, push |
| `cash_payment_recorded` (consumer) | payments | normal | in_app, email |
| `cash_collected` | payments | normal | in_app |
| `commission_due` | wallet | high | in_app, push, email |
| `commission_overdue` | wallet | urgent | in_app, push, email, sms |
| `settlement_generated` | wallet | high | in_app, email |
| `settlement_paid` | wallet | normal | in_app, email |
| `account_frozen_overdue` | wallet | urgent | in_app, push, email, sms |
| `account_unfrozen` | wallet | high | in_app, push |
| `payouts_suspended` | wallet | urgent | in_app, email |

The `wallet` category already exists in `CATEGORIES` (`catalog.js:20`) and
`NotificationPreference.walletEnabled` already gates it — no preference schema change.
`account_frozen_overdue` at `urgent` bypasses Do-Not-Disturb via the existing
`resolveChannels` logic in `server/lib/notifications/preferences.js`, which is correct: a
partner must not discover a freeze by finding an empty job feed.

## 11. Validation

- zod on every route (`server/middleware/validate.js`), matching the style of
  `payments.js:57`.
- `amount_collected` must equal `booking.price` within RM 0.01 — a partner cannot under-report
  cash to shrink their commission. A genuine mismatch is a dispute, not an edit.
- Cash collection requires `booking.status === 'completed'` **and** caller `=== booking.partnerId`.
- Settlement payment: `amount <= totalDue - amountPaid`.
- Admin adjustment: `reason` min 10 chars; amount non-zero; `type` restricted to
  `adjustment | penalty | bonus`.
- Never trust a client-supplied amount for commission — always `commission.split(gross)`.

## 12. Security

- Webhooks: Stripe signature verified against the raw body (mount `express.raw` for that path
  *before* `express.json` at `server/index.js:47`, the way the Billplz route already scopes
  `urlencoded` at `payments.js:97`). Reject unverified with 400 and no state change.
- Replay: reuse `WebhookEvent` `@@unique([provider, eventId])`.
- Idempotency: `WalletLedgerEntry.idempotencyKey` unique — a duplicated webhook cannot
  double-credit even if `WebhookEvent` is bypassed.
- Wallet mutations are **never** reachable from a client route. `POST /wallet/.../adjust` is
  `requireRole('admin','super_admin')`; everything else derives amounts server-side.
- Ledger is append-only at the code level; grant the app DB role `INSERT`-only on
  `WalletLedgerEntry` in production if the hosting provider supports it.
- Freeze state is read from the DB inside dispatch, not cached in a JWT.
- Rate-limit `/payments/cash/collect` (reuse the `authLimiter` pattern at `server/index.js:56`).
- Never log full gateway payloads containing card data; `Payment.raw` stores the gateway's
  own sanitised object only.

## 13. Edge cases

| Case | Handling |
|---|---|
| Customer pays cash, partner never records it | Booking sits `paymentStatus: pending`; nightly job flags >48h to admin; consumer gets "did you pay?" prompt |
| Partner records cash, customer disputes paying | Opens a dispute (Feature 3); commission debit is *reversed*, not deleted |
| Webhook arrives before `/create` commits | `Payment` is created before the gateway call (`payments.js:66`) — already correct; keep that order |
| Duplicate webhook | `WebhookEvent` + `idempotencyKey` |
| Refund on a cash booking | No gateway refund possible — resolves as a commission credit + partner-side deduction |
| Partner frozen mid-job | Existing accepted jobs continue; only *new* dispatch is blocked |
| Settlement spans a period with zero cash jobs | No settlement row created |
| Partner deleted with outstanding commission | Block hard-delete; require zero outstanding or an admin write-off (`status: written_off`) |
| Amount rounds to 0.005 | `round2()` everywhere; ledger totals reconciled by a nightly check job |
| Two settlements generated concurrently | `reference` unique constraint makes the second a no-op |
| Partner overpays a settlement | Excess becomes an `adjustment` credit to `availableBalance` |
| Apple Pay unavailable on device | Method hidden client-side *and* rejected server-side |

## 14. Testing checklist

```
server/lib/payments/__tests__/commission.test.js   split() rates, tiers, rounding to sen
server/lib/wallet/__tests__/ledger.test.js         balanceAfter, idempotency, reversal
server/lib/wallet/__tests__/freeze.test.js         ladder thresholds, creditLimit grace, override
server/lib/wallet/__tests__/settlement.test.js     period grouping, partial payment, overdue
server/routes/__tests__/payments.cash.test.js      collect authz, amount match, double-collect
```

- [ ] Cash: book → complete → collect → outstanding increases by exactly the commission
- [ ] Non-assigned partner cannot collect (403); consumer cannot collect (403)
- [ ] Collecting twice on one booking is rejected
- [ ] Settlement generated for the right period; paying it zeroes outstanding
- [ ] Partner frozen at threshold → excluded from `isPartnerEligible` → no new offers
- [ ] Admin override unfreezes and writes a ledger entry with the reason
- [ ] Overpayment lands as an available-balance credit
- [ ] Billplz webhook replay is a no-op; Stripe webhook with a bad signature is 400
- [ ] `GET /api/payouts/wallet` returns **identical keys** to today (regression guard)
- [ ] Backfill script: sum of opening-balance entries == old `computeWallet()` per partner
- [ ] FPX / DuitNow / card / Apple Pay / Google Pay each complete in sandbox

---

# Feature 2 — Weekly & Monthly Partner Payouts

## 1. Business logic

Payouts move money **out** to partners; settlements (Feature 1) move commission **in**. They
share `PartnerWallet` and must never be confused.

A payout run: select partners with `availableBalance > minimumPayout` (suggest RM 50) and
`payoutsSuspended === false`, group into a `PayoutBatch`, deduct any outstanding commission
the partner has *opted* to net off, generate a bank transfer file / gateway disbursement,
mark `PayoutRecord`s `processing` → `completed`/`failed`, and write `payout_debit` ledger
entries. A failed transfer reverses the debit and notifies the partner to fix bank details.

`PayoutRecord` already exists with the right shape; this feature adds period/batch/bank
context and turns ad-hoc records into scheduled runs.

## 2. Database changes

Required — additive columns on `PayoutRecord`, plus `PayoutBatch` and `PartnerBankAccount`.

`User.bankAccount String?` (`schema.prisma:40`) is a single opaque string — insufficient for a
real transfer (needs bank code, account name for name-matching, and a verification state).
Keep the column, mirror it into the new model during backfill.

## 3. Prisma schema changes

```prisma
model PayoutBatch {
  id            String    @id @default(cuid())
  reference     String    @unique // "PB-2026W31"
  cycle         String // weekly | monthly | manual
  periodStart   DateTime
  periodEnd     DateTime
  status        String    @default("draft") // draft | approved | processing | completed | failed
  partnerCount  Int       @default(0)
  totalGross    Float     @default(0)
  totalCommission Float   @default(0)
  totalNet      Float     @default(0)
  approvedById  String?
  approvedAt    DateTime?
  processedAt   DateTime?
  exportUrl     String? // generated bank transfer file
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  payouts PayoutRecord[]

  @@index([status, periodEnd])
}

model PartnerBankAccount {
  id            String    @id @default(cuid())
  partnerId     String    @unique
  bankName      String
  bankCode      String? // SWIFT / DuitNow proxy resolution
  accountNumber String
  accountName   String // must match the partner's verified legal name
  accountType   String    @default("savings")
  isVerified    Boolean   @default(false)
  verifiedAt    DateTime?
  verifiedById  String?
  rejectionReason String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  partner User @relation(fields: [partnerId], references: [id], onDelete: Cascade)
}
```

Additive on the existing `PayoutRecord` (nothing removed):

```prisma
model PayoutRecord {
  // … existing fields unchanged …
  batchId            String?
  cycle              String   @default("manual") // weekly | monthly | manual
  periodStart        DateTime?
  periodEnd          DateTime?
  reference          String?  @unique // "PO-3F9A2B"
  commissionDeducted Float    @default(0)
  adjustments        Float    @default(0)
  bankSnapshot       Json? // bank details AS AT payout time — details change; records must not
  gatewayRef         String?
  paidAt             DateTime?
  bookingIds         Json?

  batch PayoutBatch? @relation(fields: [batchId], references: [id])

  @@index([batchId])
  @@index([status, scheduledDate])
}
```

`PayoutRecord.status` values extend to `pending | scheduled | processing | completed | failed | cancelled`
— `processing` and `cancelled` are new; the existing four keep their meaning, so
`server/routes/payouts.js:62` and `:87` just widen their zod enums.

## 4. API changes

**Modified `server/routes/payouts.js`** — all four existing endpoints keep their paths and
response shapes. `mapManyOut` (`payouts.js:22`) gains `batch_id`, `period_start`, `period_end`,
`reference`, `paid_at` (additive keys only). `computeWallet` (`:111`) reads `PartnerWallet`.
`POST /withdraw` (`:139`) validates against the ledger balance and `payoutsSuspended`.

**New:**

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/payouts/dashboard` | partner | earnings, pending, available, next payout date, chart series |
| GET | `/api/payouts/export` | partner+admin | CSV/PDF of a date range |
| GET | `/api/payouts/bank-account` | partner | current details + verification state |
| PUT | `/api/payouts/bank-account` | partner | submit/update (resets `isVerified`) |
| POST | `/api/payouts/batches` | admin | generate a draft batch for a period |
| GET | `/api/payouts/batches` | admin | list |
| GET | `/api/payouts/batches/:id` | admin | detail + member payouts |
| POST | `/api/payouts/batches/:id/approve` | admin | draft → approved |
| POST | `/api/payouts/batches/:id/process` | admin | execute; writes ledger debits |
| GET | `/api/payouts/batches/:id/export` | admin | bank transfer file |
| POST | `/api/payouts/:id/retry` | admin | retry a failed transfer |

`PUT /bank-account` verification: submitting new details sets `isVerified = false` and
notifies admin. A payout batch **excludes** partners with unverified bank details rather than
failing mid-transfer.

## 5. Backend implementation

```
server/lib/payouts/
  batch.js     generateBatch(cycle, periodStart, periodEnd) — pure selection + totals
  export.js    toCsv(batch) / toBankFile(batch) — format per the bank's spec
  schedule.js  startPayoutWorker(prisma) — weekly Mon 02:00 MYT / monthly 1st
```

Timezone matters: the hardening commit (`7e6d663`) already fixed a timezone bug, and
`NotificationPreference.timezone` defaults to `Asia/Kuala_Lumpur`. Period boundaries must be
computed in MYT, not UTC, or a Sunday-evening job lands in the wrong week.

`server/index.js` — call `startPayoutWorker()` beside `startNotificationWorkers()` (`:113`).

Batch processing is transactional per partner, not per batch: one partner's failed transfer
must not roll back the other 200.

## 6. Frontend implementation

- `src/pages/PartnerEarnings.jsx` (255 lines, exists) — extend into the payout dashboard:
  earnings/pending/available tiles, next payout date, batch history, export button. Reuse its
  chart components; do not create a parallel page.
- **New** `src/pages/PartnerBankDetails.jsx` at `/partner/bank-details`.
- **New** `src/pages/admin/AdminPayoutBatches.jsx`.
- `servisaku-partner/src/app/(tabs)/earnings.tsx` — parity.

Charts: follow the existing `src/components/analytics/` components rather than introducing a
new charting approach.

## 7. Admin changes

Batch generation → review (with per-partner drill-down) → approve → process → export.
Approval is a deliberate second step; never auto-disburse. Failed-transfer queue with retry.
`src/pages/AdminFinance.jsx` gains a **Payouts** tab linking to the batch pages.

## 8. Customer changes

None. Payouts are invisible to customers.

## 9. Partner changes

Payout dashboard, bank details with verification badge, settlement history, statement export.
Clear copy on when money arrives ("Payouts run every Monday; funds reach your bank in 1–3
working days").

## 10. Notifications

New events (`role: 'partner'`, category `payments`): `payout_scheduled`, `payout_processing`,
`payout_completed`, `payout_failed` (urgent), `bank_details_verified`,
`bank_details_rejected`, `minimum_payout_not_met`.

`payment_released` and `weekly_earnings_summary` already exist (`catalog.js:316`, `:329`) —
reuse them; do not add duplicates.

## 11. Validation

Bank account number format per Malaysian bank; `accountName` must match the partner's
verified name from `PartnerDocument` (type `bank`/`mykad`) — mismatch blocks verification.
Payout amount ≤ available balance at *processing* time, re-checked inside the transaction.
Batch period cannot overlap an existing non-cancelled batch.

## 12. Security

Bank details are PII: `requireRole` on all admin reads, mask the account number in list
views (`****3456`), never log it. Only `super_admin` may approve/process a batch. Every batch
transition writes an audit row (`src/entities/AuditLog` exists on the front end — promote it
to a server model in this migration if you want a real audit trail). `bankSnapshot` on
`PayoutRecord` freezes details at payout time so a later edit cannot rewrite history.
Rate-limit `PUT /bank-account` (account-takeover target).

## 13. Edge cases

Zero-balance partner excluded; unverified bank details excluded with a notification;
partner changes bank details mid-batch (snapshot wins); transfer fails (reverse the debit,
restore balance, notify); partner suspended for overdue commission (excluded while
`payoutsSuspended`); negative balance from a post-payout refund (next payout nets it, never
goes below zero); partner deactivates with a pending payout (batch completes, then account
closes); duplicate batch for a period (unique `reference` blocks it).

## 14. Testing checklist

```
server/lib/payouts/__tests__/batch.test.js      selection, exclusions, totals, MYT boundaries
server/lib/payouts/__tests__/export.test.js     CSV/bank-file format
```

- [ ] Weekly batch picks exactly the eligible partners
- [ ] Below-minimum, unverified-bank, and suspended partners are excluded with the right notification
- [ ] Approve → process writes one `payout_debit` per partner; balances drop correctly
- [ ] One failed transfer does not roll back the batch
- [ ] Retry succeeds without double-debiting
- [ ] Period boundaries correct across a MYT/UTC date change
- [ ] Existing `GET /api/payouts` response keys unchanged (regression guard)
- [ ] Export opens cleanly in Excel and matches the batch totals

---

# Feature 3 — Refund & Dispute Management

## 1. Business logic

`RefundRequest` already exists (model + `server/routes/refunds.js`) with request/approve/
reject. What is missing is **execution**: an approved refund currently changes a status and
moves no money.

Full lifecycle:

```
requested → under_review → approved → processing → completed
                        ↘ rejected
                        ↘ (customer escalates) → dispute
```

- **Full refund** — entire booking price, incl. SST; credit note issued (Feature 10).
- **Partial refund** — a portion; `Payment.refundedAmount` accumulates so repeated partials
  can never exceed the paid amount.
- **Auto-approval** — cancellations inside policy (the tiered rules in
  `src/lib/paymentEngine.js:37` `calcRefundAmount`: >48h full, 4–48h 75%, <4h 50%) approve
  without a human. Everything else queues for admin.
- **Partner liability** — when the refund is the partner's fault, `partnerLiabilityAmount` is
  debited from their wallet. When it is ServisAku's or a customer change of mind, the platform
  absorbs it. This attribution is an explicit admin field, not an inference.
- **Escrow interaction** — if escrow is still `held`, refund from escrow (no gateway call).
  If already `released`, refund from platform funds and claw back from the partner wallet.

`calcRefundAmount` currently lives client-side only, so a customer could request any amount.
Move the policy to `server/lib/refunds/policy.js`; the front end may still call it for preview.

## 2. Database changes

Required — additive columns on `RefundRequest`, plus a `Dispute` model. Disputes are distinct
from refunds: a dispute may resolve with no refund at all (redo the service, partner warning),
and a refund may happen with no dispute.

## 3. Prisma schema changes

```prisma
model RefundRequest {
  // … existing fields unchanged …
  paymentId              String?
  refundMethod           String  @default("original") // original | wallet_credit | bank_transfer | manual
  gatewayRefundRef       String?
  processedAt            DateTime?
  approvedById           String?
  approvedAt             DateTime?
  rejectionReason        String?
  partnerLiabilityAmount Float   @default(0)
  liableParty            String? // partner | platform | customer | shared
  evidence               Json? // [{ kind, url, caption, uploadedBy }]
  policyApplied          String? // "cancel_gt_48h" — which rule produced the amount
  isAutoApproved         Boolean @default(false)
  slaDueAt               DateTime?
  disputeId              String?
  failureReason          String?

  @@index([status, createdAt])
  @@index([consumerId])
}

model Dispute {
  id             String    @id @default(cuid())
  reference      String    @unique // "DSP-3F9A2B"
  bookingId      String
  raisedById     String
  raisedByRole   String // consumer | partner
  againstId      String?
  category       String // service_quality | no_show | overcharge | damage | behaviour | payment | other
  description    String
  desiredOutcome String? // refund | redo | compensation | apology | other
  status         String    @default("open") // open | investigating | awaiting_response | resolved | closed | escalated
  priority       String    @default("normal")
  assignedToId   String?
  resolution     String?
  resolutionType String? // full_refund | partial_refund | redo | no_action | compensation
  refundRequestId String?
  slaDueAt       DateTime?
  resolvedAt     DateTime?
  resolvedById   String?
  evidence       Json?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  booking Booking @relation(fields: [bookingId], references: [id])

  @@index([status, priority])
  @@index([bookingId])
}
```

`RefundRequest.status` extends to
`pending | under_review | approved | processing | completed | rejected | failed | cancelled`.
The existing four values are preserved, so `refunds.js:74`'s enum only widens.

Add to `model Booking`: `disputes Dispute[]`.
`Booking.status` already supports `disputed` (`bookings.js:386` `CONSUMER_STATUSES`) — reuse it.

## 4. API changes

**Modified `server/routes/refunds.js`:**
- `POST /api/refunds` (`:44`) — compute the eligible amount server-side via
  `refunds/policy.js` instead of trusting `refund_amount` (`:55-57`); auto-approve when policy
  allows; return `policy_applied`.
- `PATCH /api/refunds/:id` (`:79`) — approving now *executes*: gateway refund + escrow/wallet
  movement + notification. Requires `liable_party` when `partner_liability_amount > 0`.
- `GET /api/refunds` (`:28`) — partners can now see refunds affecting their jobs
  (currently admin/consumer only). Use `bookingScope(req.user)`.

**New:**
- `GET  /api/refunds/:id` — detail with timeline
- `POST /api/refunds/:id/cancel` — consumer withdraws while `pending`
- `GET  /api/refunds/policy?booking_id=` — preview eligible amount before requesting
- `POST /api/refunds/:id/retry` — admin, failed gateway refund

**New router `server/routes/disputes.js`** at `/api/disputes`:
`GET /`, `POST /`, `GET /:id`, `PATCH /:id` (admin), `POST /:id/evidence`,
`POST /:id/messages`, `POST /:id/resolve` (admin), `POST /:id/escalate`.

## 5. Backend implementation

```
server/lib/refunds/
  policy.js    eligibleRefund(booking, reason, now) — port of calcRefundAmount, server-authoritative
  execute.js   executeRefund(request) — gateway/escrow/wallet orchestration, idempotent
  index.js
server/lib/disputes/
  index.js     create, assign, resolve; SLA computation
```

`executeRefund` decision table — implement exactly this, it is the crux of the feature:

| Escrow state | Payment method | Action |
|---|---|---|
| `held` | online | reduce escrow, gateway refund, `escrow → refunded` |
| `released` | online | gateway refund from platform funds + `refund_debit` on partner wallet |
| n/a | cash | credit the partner's `outstandingCommission` down; partner refunds the customer directly, tracked as an obligation |
| any | partial | proportional split; `Payment.refundedAmount += amount` |

Wire `notifyOnStatusChange` in `server/routes/bookings.js:38` `case 'cancelled'` to call
`refunds/policy.js` and auto-create the request when eligible.

## 6. Frontend implementation

- **New** `src/pages/RefundRequest.jsx` (`/booking/:id/refund`) — shows the policy preview
  before submission so the amount is never a surprise.
- **New** `src/pages/RefundStatus.jsx` (`/refunds/:id`) — timeline reusing
  `src/components/BookingTimeline.jsx`.
- **New** `src/pages/DisputeCenter.jsx` + `DisputeDetail.jsx`.
- `src/pages/BookingDetail.jsx` — "Request refund" / "Raise dispute" actions, gated on status.
- `src/pages/AdminFinance.jsx` — **Refunds** tab; new `src/pages/admin/AdminDisputes.jsx`.
- `src/api/apiClient.js` — `RefundRequest: '/refunds'` already mapped (`apiClient.js:85`);
  add `Dispute: '/disputes'`.

## 7. Admin changes

Refund queue sorted by SLA breach risk; approve/reject with mandatory note (already enforced
by `patchSchema` at `refunds.js:73`); liability attribution; bulk-approve for auto-eligible
cancellations; dispute board with assignment and resolution recording.
`src/pages/AdminQualityCenter.jsx` exists and is the natural home for disputes.

## 8. Customer changes

Request refund from booking detail with a clear policy preview; track status; upload evidence;
escalate to dispute if rejected; notifications at each step.

## 9. Partner changes

Visibility of refunds affecting their jobs; ability to respond to a dispute before resolution
(fairness — a partner should never first learn of a liability deduction from their wallet);
liability deductions itemised in the wallet ledger.

## 10. Notifications

`refund_initiated` and `refund_completed` already exist (`catalog.js:166`, `:173`) — reuse.
New: `refund_requested`, `refund_approved`, `refund_rejected`, `refund_failed`,
`dispute_raised` (both roles), `dispute_response_needed` (partner, urgent),
`dispute_resolved`, `dispute_escalated`, `partner_liability_applied` (partner).

## 11. Validation

Refund amount never exceeds `booking.price - alreadyRefunded`; `refund_type` consistent with
the amount; reason min 5 / max 2000 (matches `refunds.js:39`); only one active request per
booking (already enforced at `refunds.js:49`); evidence ≤ 10 files, ≤ 10 MB each;
dispute only on bookings in `completed | cancelled | disputed`.

## 12. Security

Consumers may only request on their own bookings (already checked at `refunds.js:46`).
Approval is `requireRole('admin','super_admin')` (already at `:79`) — keep it.
Amounts always recomputed server-side. Gateway refund calls are idempotent via
`gatewayRefundRef`. Evidence uploads: validate MIME by content, not extension; store outside
the web root with signed URLs. Full audit trail on every state change.

## 13. Edge cases

Refund after escrow release; refund on a cash booking; partial then full request (second
capped at the remainder); gateway refund fails (status `failed`, retry queue, admin alert);
customer disputes after refund completes; partner disputes their liability; booking refunded
then re-disputed; refund exceeding remaining escrow (split escrow + platform); customer
account deleted mid-refund (proceed to the original payment method); currency rounding
(sum of partials must equal the full amount exactly).

## 14. Testing checklist

```
server/lib/refunds/__tests__/policy.test.js    every tier boundary, incl. exactly 48h and 4h
server/lib/refunds/__tests__/execute.test.js   all four decision-table rows, partial accumulation
```

- [ ] Policy preview matches what is actually granted
- [ ] Auto-approval fires only inside policy
- [ ] Partial refunds accumulate and cannot exceed the paid amount
- [ ] Refund with escrow `held` vs `released` both settle correctly
- [ ] Partner liability debits the wallet with a visible ledger entry
- [ ] Failed gateway refund is retryable and does not double-refund
- [ ] Non-owner cannot request (403); non-admin cannot approve (403)
- [ ] Dispute → refund linkage; resolution closes both
- [ ] Existing `GET/POST/PATCH /api/refunds` response keys unchanged

---

# Feature 4 — Damage Claims

## 1. Business logic

A distinct workflow from refunds: the loss is to the customer's *property*, not the service
fee, and the amount is unrelated to the booking price. A RM 120 aircon service can damage a
RM 4,000 TV.

```
submit (photos/video/evidence, within 48h of completion)
  → auto-acknowledged, SLA clock starts
  → partner notified, has 72h to respond
  → admin investigates (evidence from both sides, may request more)
  → decision: approved (full/partial) | rejected | shared liability
  → compensation: wallet credit | refund to original method | bank transfer | insurance claim
  → partner liability debited per the approved split
  → closed; customer may appeal once
```

**Resolution timeline (SLA), each notified on breach risk:**
acknowledge ≤ 24h · partner response ≤ 72h · investigation ≤ 7 days · compensation ≤ 14 days
from approval.

**Liability split** is explicit (`partnerLiabilityPercent`): partner fault 100%, pre-existing
damage 0%, ambiguous → shared. Above a threshold (suggest RM 1,000), route to the partner's
insurance — `PartnerDocument` already has an `insurance` type (`schema.prisma:122`), so the
policy reference is already on file.

## 2. Database changes

Required — three new tables. No existing model changes except a `Booking` back-relation.

## 3. Prisma schema changes

```prisma
model DamageClaim {
  id                     String    @id @default(cuid())
  reference              String    @unique // "DMG-3F9A2B"
  bookingId              String
  consumerId             String
  partnerId              String?
  category               String // property | appliance | furniture | fixture | vehicle | personal_item | other
  itemDescription        String
  incidentDescription    String
  incidentAt             DateTime?
  claimedAmount          Float
  approvedAmount         Float     @default(0)
  currency               String    @default("MYR")
  status                 String    @default("submitted")
  // submitted | acknowledged | awaiting_partner_response | investigating | awaiting_evidence
  // | approved | partially_approved | rejected | compensating | compensated | closed | appealed
  partnerResponse        String?
  partnerRespondedAt     DateTime?
  partnerLiabilityPercent Float    @default(0)
  partnerLiabilityAmount Float     @default(0)
  platformAbsorbed       Float     @default(0)
  investigatorId         String?
  investigationNotes     String?
  decisionReason         String?
  decidedById            String?
  decidedAt              DateTime?
  compensationMethod     String? // wallet_credit | original_payment | bank_transfer | insurance | replacement
  compensationRef        String?
  compensatedAt          DateTime?
  insuranceClaimRef      String?
  acknowledgeDueAt       DateTime?
  responseDueAt          DateTime?
  investigationDueAt     DateTime?
  compensationDueAt      DateTime?
  appealCount            Int       @default(0)
  closedAt               DateTime?
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  booking  Booking             @relation(fields: [bookingId], references: [id])
  evidence DamageClaimEvidence[]
  events   DamageClaimEvent[]

  @@index([status, createdAt])
  @@index([partnerId])
  @@index([consumerId])
}

model DamageClaimEvidence {
  id           String   @id @default(cuid())
  claimId      String
  uploadedById String
  uploadedByRole String // consumer | partner | admin
  kind         String // photo | video | document | invoice | quote | receipt
  fileUrl      String
  thumbnailUrl String?
  mimeType     String?
  sizeBytes    Int?
  durationSec  Int? // video
  caption      String?
  capturedAt   DateTime? // EXIF timestamp when available
  createdAt    DateTime @default(now())

  claim DamageClaim @relation(fields: [claimId], references: [id], onDelete: Cascade)

  @@index([claimId])
}

// Immutable investigation timeline — the audit record for a money decision.
model DamageClaimEvent {
  id         String   @id @default(cuid())
  claimId    String
  actorId    String?
  actorRole  String // consumer | partner | admin | system
  action     String // submitted | acknowledged | evidence_added | partner_responded
                    // | note_added | status_changed | decided | compensated | appealed
  fromStatus String?
  toStatus   String?
  note       String?
  metadata   Json?
  createdAt  DateTime @default(now())

  claim DamageClaim @relation(fields: [claimId], references: [id], onDelete: Cascade)

  @@index([claimId, createdAt])
}
```

Add to `model Booking`: `damageClaims DamageClaim[]`.

## 4. API changes

**New router `server/routes/damageClaims.js`** at `/api/damage-claims`:

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/` | all (scoped) | consumer: own; partner: against them; admin: all |
| POST | `/` | consumer | submit |
| GET | `/:id` | participant | detail + evidence + timeline |
| POST | `/:id/evidence` | participant | add evidence |
| DELETE | `/:id/evidence/:eid` | uploader (pre-decision) | remove own upload |
| POST | `/:id/respond` | partner | partner's account of the incident |
| PATCH | `/:id` | admin | status, investigator, notes |
| POST | `/:id/decide` | admin | approve/partial/reject + liability split |
| POST | `/:id/compensate` | admin | execute compensation |
| POST | `/:id/appeal` | consumer | one appeal |
| GET | `/stats` | admin | dashboard aggregates |

**File upload:** there is no upload endpoint in the codebase today —
`server/routes/bookings.js:500` `POST /:id/photos` accepts *URLs*, and `PartnerDocument.fileUrl`
is likewise a URL. So a real uploader is a prerequisite. Add `server/routes/uploads.js`
(`POST /api/uploads` → signed URL or multipart to S3/Appwrite Storage; Appwrite is already a
dependency — `server/appwrite.js`, `src/lib/appwrite.js` — so **use Appwrite Storage** and
avoid adding a cloud vendor). Then damage claims, dispute evidence, support attachments, and
partner documents all share one uploader.

## 5. Backend implementation

```
server/lib/damageClaims/
  index.js        submit, respond, decide, compensate
  sla.js          due-date computation + breach detection (pure, testable)
  compensation.js executes the chosen method; reuses refunds/execute.js and wallet/ledger.js
server/lib/uploads/
  index.js        Appwrite Storage adapter — signed URL issue + MIME/size validation
```

SLA breach detection folds into the existing scheduler alongside
`startNotificationWorkers()`. Compensation reuses `wallet.debit(partner, 'damage_deduction')`
and `refunds/execute.js` — do not write a third money path.

## 6. Frontend implementation

- **New** `src/pages/DamageClaimSubmit.jsx` (`/booking/:id/damage-claim`) — multi-step:
  category → description → amount → evidence upload → review.
- **New** `src/pages/DamageClaimDetail.jsx` — timeline from `DamageClaimEvent`, reusing
  `src/components/BookingTimeline.jsx`.
- **New** `src/components/EvidenceUploader.jsx` — drag-drop, photo/video preview, progress,
  client-side compression before upload. Shared by disputes and support.
- **New** `src/pages/PartnerDamageClaims.jsx` + response form.
- **New** `src/pages/admin/AdminDamageClaims.jsx` — queue, SLA badges, evidence gallery,
  decision form with liability slider.
- Mobile: `servisaku-consumer/src/app/booking/[id]/damage-claim.tsx` (camera capture is the
  main reason to build this mobile-first) and `servisaku-partner/src/app/partner/claims.tsx`.

## 7. Admin changes

Investigation dashboard: queue by SLA urgency, side-by-side evidence viewer, liability slider
(0–100%) with live money preview, decision form with mandatory reason, compensation
execution, insurance-referral flag, per-partner claim-rate metric feeding
`src/pages/AdminQualityCenter.jsx`.

## 8. Customer changes

Submit within 48h of completion; upload photos/videos; track investigation; receive
compensation; appeal once. Entry point on `BookingDetail.jsx` and in the completion flow.

## 9. Partner changes

Notified immediately; 72h to respond with their own evidence; sees the decision and the
liability split; deduction appears in the wallet ledger with a link to the claim. Repeated
claims feed the quality score.

## 10. Notifications

New: `damage_claim_submitted` (consumer ack + partner alert, urgent),
`damage_claim_acknowledged`, `damage_response_required` (partner, urgent),
`damage_response_reminder`, `damage_investigation_started`, `damage_evidence_requested`,
`damage_claim_approved`, `damage_claim_rejected`, `damage_compensation_sent`,
`damage_liability_applied` (partner), `damage_sla_breach` (admin).

Add an `admin` role to the catalog's `role` field for the internal alerts (`renderEvent`
already passes `role` through — no schema change; `Notification.role` is a free string).

## 11. Validation

Claim within 48h of `completed` (configurable); `claimedAmount` > 0 and ≤ a sanity ceiling
(suggest RM 50,000 — above that, manual intake); ≥ 1 photo required; ≤ 20 files;
photos ≤ 10 MB, videos ≤ 100 MB / 2 min; MIME allow-list `jpeg|png|webp|heic|mp4|quicktime|pdf`;
partner response ≤ 5000 chars; `partnerLiabilityPercent` 0–100; `approvedAmount ≤ claimedAmount`;
one open claim per booking (a second is `appealed`, not new).

## 12. Security

Evidence is private — signed, short-lived URLs; never a public bucket. Access limited to the
claim's participants + admin (`isBookingParticipant` extends naturally). Validate file type by
magic bytes, not extension; strip EXIF GPS from photos shown to the *partner* (the customer's
home address is already known to them, but other metadata is not) while retaining the original
for admin. Rate-limit submissions (3/day/user). Only admin decides and compensates. Evidence
is immutable after a decision. Full `DamageClaimEvent` trail on every action — this is a money
decision and must be defensible.

## 13. Edge cases

Claim after the 48h window (allow submission, flag `late`, admin discretion); partner never
responds (proceed after 72h, note the non-response); partner already deactivated (platform
absorbs, recovery pursued separately); claimed amount exceeds partner's lifetime earnings
(insurance / write-off path); customer submits multiple claims on one booking (first is the
claim, rest are evidence); fraudulent claim detected (reject, flag account, feed quality
score); damage discovered weeks later (out of window → support ticket, not a claim);
video upload fails midway (resumable or explicit retry, never a half-saved claim);
partner disputes the decision (single appeal, then final); claim on a booking that was also
refunded (independent — the fee and the property loss are separate).

## 14. Testing checklist

```
server/lib/damageClaims/__tests__/sla.test.js           due dates, breach detection, MYT
server/lib/damageClaims/__tests__/compensation.test.js  each method, liability split arithmetic
server/lib/uploads/__tests__/validate.test.js           MIME magic bytes, size limits
```

- [ ] Submit with photos → partner notified within seconds
- [ ] Partner responds within 72h; non-response advances the claim
- [ ] Liability split arithmetic: partner + platform == approved amount, exactly
- [ ] Each compensation method settles and writes the right ledger entry
- [ ] Evidence is inaccessible to non-participants (signed URL expiry enforced)
- [ ] Oversized / wrong-MIME uploads rejected server-side even if the client allows them
- [ ] SLA breach fires the admin alert
- [ ] Appeal allowed once, second rejected
- [ ] `DamageClaimEvent` timeline is complete and ordered

---

# Feature 5 — AI Chatbot

## 1. Business logic

A support-deflection assistant, not a general chatbot. It answers from a curated ServisAku
knowledge base (booking, payment, refund, cancellation, damage, account FAQs), can look up the
*calling user's own* bookings and payments to answer "where is my refund?", and escalates to a
human when it cannot help.

**Escalation triggers** — any one of: low answer confidence, user asks explicitly, two
consecutive unresolved turns, detected frustration, or any topic touching money movement
(refund amounts, damage decisions). Escalation creates a `SupportTicket` (Feature 8)
pre-filled with the transcript, so the agent starts with full context.

**Firm boundary: the bot never mutates state.** It cannot cancel a booking, approve a refund,
or move money. It answers, explains, and hands off. This keeps prompt injection from a
customer message out of the money path entirely.

## 2. Database changes

Required — two new tables. Keep them separate from `ChatMessage` (`schema.prisma:296`), which
is booking-scoped consumer↔partner chat with a different lifecycle and different privacy rules.

## 3. Prisma schema changes

```prisma
model ChatbotConversation {
  id              String    @id @default(cuid())
  userId          String?  // null for anonymous pre-login visitors
  sessionId       String   // browser/device session for anonymous continuity
  role            String    @default("consumer") // consumer | partner
  locale          String    @default("en") // en | ms
  status          String    @default("active") // active | escalated | resolved | abandoned
  topic           String? // booking | payment | refund | damage | account | general
  escalatedAt     DateTime?
  supportTicketId String?
  messageCount    Int       @default(0)
  wasHelpful      Boolean? // thumbs up/down at close
  lastMessageAt   DateTime  @default(now())
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  messages ChatbotMessage[]

  @@index([userId, lastMessageAt])
  @@index([sessionId])
  @@index([status])
}

model ChatbotMessage {
  id             String   @id @default(cuid())
  conversationId String
  sender         String // user | bot | agent | system
  content        String
  intent         String? // classified intent
  confidence     Float? // 0–1; drives escalation
  sources        Json? // knowledge-base article ids cited
  toolCalls      Json? // read-only lookups performed
  model          String? // model id used, for cost attribution
  tokensIn       Int?
  tokensOut      Int?
  latencyMs      Int?
  flagged        Boolean  @default(false)
  createdAt      DateTime @default(now())

  conversation ChatbotConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
}
```

## 4. API changes

**New router `server/routes/chatbot.js`** at `/api/chatbot` (`authenticate` optional — allow
anonymous pre-login FAQ with a stricter rate limit):

| Method | Path | Purpose |
|---|---|---|
| POST | `/conversations` | start; returns id + greeting |
| GET | `/conversations` | authenticated user's history |
| GET | `/conversations/:id` | transcript |
| POST | `/conversations/:id/messages` | send; returns the bot reply (SSE-streamed) |
| POST | `/conversations/:id/escalate` | create a support ticket from the transcript |
| POST | `/conversations/:id/feedback` | thumbs up/down |
| POST | `/conversations/:id/close` | end |
| GET | `/faqs` | public — the static FAQ corpus, also feeds the Help Center |
| GET | `/admin/conversations` | admin: review, filter by escalated/flagged |
| GET | `/admin/stats` | deflection rate, top intents, unanswered questions |

## 5. Backend implementation

```
server/lib/chatbot/
  index.js       orchestrator: classify → retrieve → answer → decide escalation
  provider.js    LLM adapter — pluggable + inert when unconfigured, exactly like push.js
  knowledge.js   FAQ corpus (code-authored, versioned) + keyword/embedding retrieval
  context.js     read-only user context: recent bookings, payment states, open tickets
  guardrails.js  input sanitisation, output filtering, PII redaction, refusal rules
  escalation.js  trigger evaluation + ticket creation
```

**Provider:** Anthropic Claude. `claude-haiku-4-5-20251001` for intent classification (cheap,
high volume) and `claude-sonnet-5` for answer generation. Follow the `push.js` adapter
pattern — `setChatbotProvider(fn)`, `isChatbotReady()`, and a console-logging no-op when
`ANTHROPIC_API_KEY` is absent so the whole flow is testable without spend.

> **Before implementing `provider.js`, load the `claude-api` skill** — it carries the current
> SDK surface, streaming, tool-use, and prompt-caching specifics. Do not write the client from
> memory. Prompt caching on the system prompt + knowledge base is the single biggest cost lever
> here and is worth getting right on the first pass.

**Context retrieval is strictly read-only and strictly self-scoped.** `context.js` queries
only `WHERE consumerId = req.user.id` (or `partnerId`). It must not accept a booking id from
the message text — the user's own recent records are fetched by session identity, never by an
identifier the model produces. This closes the obvious data-exfiltration path.

**Knowledge base in code, not the DB** — same rationale as
`server/lib/notifications/catalog.js`: it is versioned, reviewable in PRs, and deployed
atomically with the code that depends on it. Admin-editable FAQ content can come later via
`HelpArticle` (Feature 8) as an additional retrieval source.

## 6. Frontend implementation

- **New** `src/components/ChatbotWidget.jsx` — floating launcher + panel, mounted in
  `src/lib/AppShell.jsx` so it is available across the consumer app.
- **New** `src/pages/ChatbotHistory.jsx` at `/support/chat`.
- `src/pages/Help.jsx` (99 lines, exists) — its five hardcoded FAQs (`Help.jsx:9-31`) become
  the seed of `knowledge.js`; the page then reads `GET /api/chatbot/faqs` and gains an
  "Ask the assistant" CTA.
- Mobile: `servisaku-consumer/src/app/support/chat.tsx`; reuse the existing chat UI components
  from `servisaku-consumer/src/app/chat/`.

Stream responses (SSE) — a 3-second silent wait reads as broken.

## 7. Admin changes

`src/pages/AdminCommunications.jsx` (exists) gains a **Chatbot** tab: transcript review,
escalation rate, top intents, an "unanswered questions" list that drives knowledge-base
authoring, and flagged-conversation review.

## 8. Customer changes

Chat widget on every consumer page; instant FAQ answers; personalised answers about their own
bookings; one-tap escalation to a human with the transcript carried over; history.

## 9. Partner changes

Same widget with a partner knowledge base (payouts, commission, settlements, job acceptance,
document verification). `role` on the conversation selects the corpus.

## 10. Notifications

`chatbot_escalated` (consumer, in_app) and `support_reply` (already exists at `catalog.js:229`)
once an agent replies. Deliberately minimal — a chatbot that generates notifications is
annoying.

## 11. Validation

Message ≤ 2000 chars; ≤ 50 messages/conversation; ≤ 5 conversations/hour/user (20/hour for
anonymous by IP); locale in `en|ms`; strip control characters; reject binary.

## 12. Security

**Prompt injection is the primary threat.** Mitigations, in order of importance:
1. The bot has **no state-mutating tools**. The worst outcome of a successful injection is a
   wrong answer, not a wrong action.
2. User content is passed as data with clear delimiters, never concatenated into the system
   prompt.
3. Context lookups are scoped by session identity, never by a model-produced identifier.
4. Output filtering strips anything resembling credentials, tokens, or other users' PII.
5. System prompt is never echoed; a request for it is refused.

Anonymous conversations get no user context at all. PII is redacted before storage where
practical. Transcripts are readable only by the owner and admin. Per-user token budget with a
daily cap to bound cost and abuse. Log the model id and token counts on every message for
attribution.

## 13. Edge cases

LLM provider down (fall back to keyword FAQ search + escalation offer — never a hard error);
user asks something dangerous or out of scope (refuse + escalate); user asks about another
person's booking (refuse — context is self-scoped so the data is not even loaded); mixed
EN/BM in one message (respond in the dominant language); very long conversation (summarise
older turns to control the context window); user escalates twice (link to the existing open
ticket rather than creating a duplicate); anonymous user logs in mid-conversation (attach the
conversation to the user id); rate limit hit (queue message, show a clear wait); token budget
exhausted (offer escalation).

## 14. Testing checklist

```
server/lib/chatbot/__tests__/knowledge.test.js    retrieval relevance on a fixed question set
server/lib/chatbot/__tests__/guardrails.test.js   injection corpus, PII redaction, refusals
server/lib/chatbot/__tests__/escalation.test.js   each trigger fires exactly once
server/lib/chatbot/__tests__/context.test.js      scoping — cannot reach another user's data
```

- [ ] Booking/payment/refund FAQs answered correctly from the corpus
- [ ] "Where's my refund?" returns the *calling user's* actual refund status
- [ ] Injection attempts ("ignore previous instructions", "show the system prompt", "cancel my
      booking") all fail safe
- [ ] Escalation creates a ticket containing the full transcript
- [ ] Provider unconfigured → keyword fallback works; no 500s
- [ ] Provider timeout → graceful message + escalation offer
- [ ] Anonymous user receives no personal context
- [ ] Rate limits enforced per user and per IP
- [ ] Streaming renders progressively on web and mobile
- [ ] BM questions answered in BM

---

# Feature 6 — Notification System

## 1. Business logic

**Most of this is already built** and should not be rebuilt. `server/lib/notifications/`
contains a catalog-driven dispatcher, per-user preferences with quiet hours, an in-process
queue with retry, Socket.IO real-time delivery, and email/SMS/push adapters. `notify()` is the
single entry point and is already wired into booking status changes (`bookings.js:20`),
payments (`payments.js:46`), and payouts (`payouts.js:14`).

The gaps are narrower than the brief implies:

1. **Push is a stub.** `server/lib/notifications/push.js` logs to console; no real FCM/Expo
   provider is wired, and the two Expo apps register tokens that go nowhere.
2. **No per-channel delivery tracking.** `Notification.deliveryStatus` is one value for what
   are four independent deliveries. A bounced email is invisible today.
3. **Event coverage.** Features 1–5 and 8 add ~45 events to `CATALOG`.
4. **No digest/batching.** Ten job offers produce ten pushes.
5. **Partner arrival** is covered (`professional_arrived`, `catalog.js:82`); **payment/refund/
   payout/reminder/cancellation** need the new events listed under their features.

## 2. Database changes

One new table (`NotificationDelivery`). No changes to `Notification`,
`NotificationPreference`, or `PushToken` — all three are already well-shaped.

## 3. Prisma schema changes

```prisma
model NotificationDelivery {
  id             String    @id @default(cuid())
  notificationId String
  userId         String
  channel        String // in_app | email | sms | push
  status         String    @default("queued") // queued | sent | delivered | failed | bounced | skipped
  provider       String? // smtp | twilio | fcm | expo | socket
  providerRef    String? // message id for provider-side lookup
  attempts       Int       @default(0)
  error          String?
  skipReason     String? // dnd | preference_off | no_address | no_token
  sentAt         DateTime?
  deliveredAt    DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  notification Notification @relation(fields: [notificationId], references: [id], onDelete: Cascade)

  @@index([notificationId])
  @@index([userId, channel, status])
  @@index([status, createdAt])
}
```

Add to `model Notification`: `deliveries NotificationDelivery[]`.
`Notification.deliveryStatus` stays as the roll-up so existing readers are unaffected.

Add to `model NotificationPreference` (additive, defaults preserve today's behaviour):
```prisma
  digestEnabled   Boolean @default(false)
  digestFrequency String  @default("daily") // daily | weekly
  digestHour      Int     @default(9)
```

## 4. API changes

**Modified** — `server/routes/notifications.js`: `GET /:id` includes `deliveries[]` for admin.
`POST /push-token` (`:125`) already exists and is correct.

**New:**
- `POST /api/notifications/admin/broadcast` — admin, segment-targeted announcement
- `GET  /api/notifications/admin/deliveries` — delivery/failure report
- `POST /api/notifications/test` — admin, send a test of any catalog event to oneself
- `POST /api/notifications/webhook/:provider` — delivery receipts (Twilio status callback,
  SES/SendGrid bounce, FCM feedback) → updates `NotificationDelivery`

## 5. Backend implementation

Changes are confined to `server/lib/notifications/`:

- **`push.js`** — implement `defaultProvider`: FCM HTTP v1 for web/android, Expo Push API for
  the two Expo apps (`PushToken.provider` already distinguishes `fcm|webpush|expo`,
  `schema.prisma:395`). Handle token invalidation by deleting dead `PushToken` rows.
- **`dispatcher.js`** — in `deliver()` (`:146`), create a `NotificationDelivery` row per channel
  before enqueueing, and have each adapter update it. Also record `skipReason` for channels
  dropped by `resolveChannels` — knowing *why* a notification was not sent is most of
  production debugging.
- **`queue.js`** — the in-process adapter (`:11`) is honest about its limits: work is lost on
  restart. Document the BullMQ swap via the existing `setQueueAdapter` seam; not required for
  launch, required before scale.
- **`digest.js`** (new) — batches low-priority notifications into a daily summary.
- **`catalog.js`** — add all events from Features 1–5, 8, 9, 10.

## 6. Frontend implementation

Already built: `src/pages/NotificationCenter.jsx`, `src/pages/NotificationSettings.jsx`,
`src/components/NotificationBell.jsx`, `src/lib/realtimeService.js`, and equivalents in both
Expo apps. Additions: digest toggle in settings, category filters for the new `wallet` events,
and real push permission prompts + token registration in the Expo apps (they currently
register into a stub).

## 7. Admin changes

`src/pages/AdminCommunications.jsx` (exists): broadcast composer with segment targeting,
delivery report (sent/delivered/failed/bounced by channel), per-event volume, and the test-send
tool.

## 8/9. Customer & Partner changes

Per-channel and per-category control already exists. New: digest preference, and push that
actually arrives.

## 10. Notification events

Consolidated additions across all features — add to `CATALOG` in one pass:

| Domain | Events |
|---|---|
| Payments (1) | `payment_due_cash`, `cash_payment_recorded`, `cash_collected`, `commission_due`, `commission_overdue`, `settlement_generated`, `settlement_paid`, `account_frozen_overdue`, `account_unfrozen`, `payouts_suspended` |
| Payouts (2) | `payout_scheduled`, `payout_processing`, `payout_completed`, `payout_failed`, `bank_details_verified`, `bank_details_rejected`, `minimum_payout_not_met` |
| Refunds (3) | `refund_requested`, `refund_approved`, `refund_rejected`, `refund_failed`, `dispute_raised`, `dispute_response_needed`, `dispute_resolved`, `dispute_escalated`, `partner_liability_applied` |
| Damage (4) | `damage_claim_submitted`, `damage_claim_acknowledged`, `damage_response_required`, `damage_response_reminder`, `damage_investigation_started`, `damage_evidence_requested`, `damage_claim_approved`, `damage_claim_rejected`, `damage_compensation_sent`, `damage_liability_applied`, `damage_sla_breach` |
| Chatbot (5) | `chatbot_escalated` |
| Support (8) | `ticket_created`, `ticket_assigned`, `ticket_replied`, `ticket_escalated`, `ticket_resolved`, `callback_requested`, `callback_scheduled`, `callback_completed`, `csat_request` |
| Legal (9) | `terms_updated`, `acceptance_required` |
| Tax (10) | `invoice_issued`, `credit_note_issued` |

Existing events already cover booking lifecycle, partner arrival, reminders, cancellation,
reviews, and security — reuse them.

## 11. Validation

Catalog events validated at boot (a startup assertion that every `CATALOG` entry has
`category ∈ CATEGORIES`, `priority ∈ PRIORITIES`, `channels ⊆ CHANNELS` — cheap, catches typos
before they reach production). Broadcast: segment size cap + admin confirmation above 1000
recipients. Push payload ≤ 4 KB. SMS ≤ 160 chars where possible (cost).

## 12. Security

Only the server calls `notify()` — `POST /api/notifications` (`notifications.js:156`) must stay
admin-only. Push tokens are per-user and validated on registration. Delivery webhooks are
signature-verified per provider. Broadcast is `requireRole('admin','super_admin')` with an audit
row. Never put OTPs, tokens, or full amounts owed in a push payload (visible on a lock screen)
— `otp_generated` (`catalog.js:89`) correctly uses in_app + sms only; keep that discipline.

## 13. Edge cases

User has no email/phone/token (record `skipReason`, do not fail); DND active and priority is
`urgent` (deliver — already handled by `preferences.js`); token expired (delete on FCM
`NotFound`); email bounces (mark, suppress after 3 hard bounces); user opts out entirely
(security notifications still land in-app — already the documented behaviour at
`schema.prisma:373`); scheduled notification whose user is deleted (skip); duplicate rapid
events (dedupe window per `(userId, event, bookingId)`); notification storm from a bulk admin
action (queue throttle).

## 14. Testing checklist

- [ ] Every new catalog event renders without throwing for empty `data`
- [ ] Boot-time catalog validation catches a deliberately malformed entry
- [ ] `NotificationDelivery` row per channel, with correct `skipReason` when dropped
- [ ] Real push arrives on Android, iOS, and web
- [ ] Invalid token is deleted after an FCM error
- [ ] Delivery webhook updates status correctly
- [ ] Digest batches and fires at the user's local hour
- [ ] Preference off → skipped with reason; urgent bypasses DND
- [ ] `POST /api/notifications` rejects non-admin (regression — this was a P0 class of bug)

---

# Feature 7 — Email Notifications

## 1. Business logic

`server/lib/notifications/dispatcher.js:50` `buildEmailHtml()` renders **one generic template**
for every email — a title, a paragraph, and a button. That is fine for "your professional
arrived" and wrong for an invoice, a payout statement, or a booking confirmation, all of which
need structured content (line items, amounts, dates, tax breakdown).

Introduce per-event templates while keeping the generic one as the fallback, so an event
without a bespoke template still sends.

## 2. Database changes

None. Templates live in code, versioned with the app — the same reasoning as
`notifications/catalog.js`. (`NotificationDelivery` from Feature 6 provides the tracking.)

## 3. Prisma schema changes

None.

## 4. API changes

New (admin-only, development quality-of-life):
- `GET  /api/admin/email-templates` — list
- `POST /api/admin/email-templates/:key/preview` — render with sample data, returns HTML
- `POST /api/admin/email-templates/:key/test` — send to the calling admin

## 5. Backend implementation

```
server/lib/emailTemplates/
  index.js                 render(templateKey, data) → { subject, html, text }; falls back to generic
  layout.js                shared shell — header, footer, brand tokens, unsubscribe link
  components.js            button, table, lineItems, amountRow, infoBox
  bookingConfirmation.js
  paymentSuccess.js
  invoice.js
  refund.js
  cancellation.js
  partnerAssigned.js
  payout.js
  commissionSettlement.js
  damageClaimUpdate.js
  supportTicket.js
  welcome.js
```

`dispatcher.js:151` changes from
`html: buildEmailHtml(rendered)` to
`html: renderTemplate(rendered.event, data).html ?? buildEmailHtml(rendered)`.
`buildEmailHtml` stays exactly where it is as the fallback — a one-line change at the call
site, no risk to the 40 events that already work.

Map events → templates in `catalog.js` by adding an optional `email.template` key alongside
the existing `email.subject` (`catalog.js:44`). Purely additive.

**Constraints:** table-based layout, inline CSS, ≤ 102 KB (Gmail clips beyond that), a plain-text
alternative for every template (`dispatcher.js:156` already sends one), dark-mode-safe colours,
600px max width, and every image absolute-URL'd. Brand tokens come from
`src/lib/design/` — mirror them into `layout.js` as literals rather than importing front-end
code into the server.

**Bilingual:** `NotificationPreference.language` already exists (`schema.prisma:381`) and is
already `en`/`ms`. Each template exports `{ en, ms }` subject + body; `render()` picks by
recipient preference. This is the single largest content task in this feature.

## 6. Frontend implementation

- `src/lib/emailTemplates.js` (66 lines, exists, front-end-only) — mark deprecated; the server
  is now authoritative. Do not delete yet; check its importers first.
- **New** `src/pages/admin/AdminEmailTemplates.jsx` — preview gallery with test-send.

## 7. Admin changes

Template preview with sample data, test send, delivery/bounce stats from
`NotificationDelivery`.

## 8/9. Customer & Partner changes

Properly formatted, branded, bilingual emails. Every template carries a preference-centre link
(not a raw unsubscribe — transactional email should not be unsubscribable, but the preference
page must be one click away).

## 10. Notifications

This *is* the delivery layer for the email channel. Templates required for:
Booking Confirmation, Payment Success, Refund, Cancellation, Partner Assigned, Invoice, Payout
— plus Commission Settlement, Damage Claim Update, Support Ticket, and Welcome.

## 11. Validation

Template key must exist in `CATALOG` with `email:` set; required data fields asserted at render
(a missing `amount` on an invoice email must fail loudly in dev, not silently render "RM
undefined"); HTML escaped — **note `buildEmailHtml` currently interpolates `title` and `message`
unescaped** (`dispatcher.js:62-63`); those strings come from the catalog today so it is safe,
but templates rendering user-supplied content (ticket subject, dispute description) must escape.

## 12. Security

Escape all interpolated content (see above — this becomes a real XSS/HTML-injection vector the
moment user content enters an email). No secrets, tokens, or full account numbers in email
bodies. Deep links use short-lived signed tokens. SPF/DKIM/DMARC on the sending domain.
Rate-limit per recipient. Honour suppression lists on hard bounce.

## 13. Edge cases

SMTP unconfigured (already logs to console — `mailer.js:22`; keep); template missing (generic
fallback); missing data field (fail in dev, render a safe placeholder in production);
recipient has no email (skip with `skipReason: no_address`); very long content (truncate with
"view in app"); RTL/unicode names; email client strips CSS (test in Gmail, Outlook, Apple Mail).

## 14. Testing checklist

```
server/lib/emailTemplates/__tests__/render.test.js   every template renders in en + ms,
                                                     with full and minimal data
server/lib/emailTemplates/__tests__/escape.test.js   HTML injection via user content
```

- [ ] All 11 templates render valid HTML and a plain-text alternative
- [ ] Both languages render for every template
- [ ] Missing optional fields degrade gracefully
- [ ] `<script>` in a ticket subject is escaped in the email
- [ ] Renders correctly in Gmail (web + iOS + Android), Outlook, Apple Mail
- [ ] Under 102 KB
- [ ] Unknown event falls back to `buildEmailHtml` and still sends
- [ ] Preference-centre link works from every template

---

# Feature 8 — Customer Support

## 1. Business logic

`SupportTicket` exists (`schema.prisma:68`) with `category`, `subject`, `message`, and a binary
`open|resolved` status, plus a minimal two-endpoint router (`server/routes/support.js`). It is
a suggestion box, not a support system: no threading, no assignment, no SLA, no priority, no
agent view, no attachments.

Extend it into: ticket threading, assignment + SLA, priority, escalation levels, callback
requests, a searchable help centre, and CSAT.

**Escalation ladder:** L1 agent → L2 specialist → L3 manager. Automatic on SLA breach or
repeated reopening; manual by an agent. **SLA by priority:** urgent 1h first response / 4h
resolution · high 4h/24h · normal 12h/72h · low 24h/7d.

**Callback requests** are a distinct, lighter object — a customer asks to be phoned back in a
window; an agent claims and completes it. Modelling it as a ticket would distort ticket metrics.

## 2. Database changes

Required — additive columns on `SupportTicket`, plus four new tables.

## 3. Prisma schema changes

```prisma
model SupportTicket {
  // … existing fields (userId, category, subject, message, status, bookingId) unchanged …
  reference       String?   @unique // "TKT-3F9A2B"
  priority        String    @default("normal") // low | normal | high | urgent
  channel         String    @default("app") // app | email | phone | chatbot | whatsapp
  assignedToId    String?
  escalationLevel Int       @default(1) // 1 | 2 | 3
  slaFirstResponseAt DateTime?
  slaResolutionAt    DateTime?
  firstResponseAt DateTime?
  resolvedAt      DateTime?
  closedAt        DateTime?
  reopenCount     Int       @default(0)
  csatRating      Int? // 1–5
  csatComment     String?
  tags            Json?
  chatbotConversationId String?
  relatedClaimId  String?
  relatedDisputeId String?

  messages SupportTicketMessage[]

  @@index([status, priority])
  @@index([assignedToId, status])
}

model SupportTicketMessage {
  id          String   @id @default(cuid())
  ticketId    String
  senderId    String
  senderRole  String // consumer | partner | agent | system
  message     String
  isInternal  Boolean  @default(false) // agent-only note, never shown to the customer
  attachments Json? // [{ url, name, mimeType, sizeBytes }]
  createdAt   DateTime @default(now())

  ticket SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId, createdAt])
}

model CallbackRequest {
  id             String    @id @default(cuid())
  userId         String
  phone          String
  preferredFrom  DateTime
  preferredTo    DateTime
  topic          String?
  bookingId      String?
  status         String    @default("requested") // requested | scheduled | attempted | completed | cancelled
  assignedToId   String?
  scheduledAt    DateTime?
  attemptCount   Int       @default(0)
  lastAttemptAt  DateTime?
  completedAt    DateTime?
  outcomeNote    String?
  ticketId       String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([status, preferredFrom])
}

model HelpCategory {
  id        String @id @default(cuid())
  slug      String @unique
  name      String
  nameMy    String
  iconKey   String @default("HelpCircle")
  audience  String @default("consumer") // consumer | partner | all
  sortOrder Int    @default(0)
  isActive  Boolean @default(true)

  articles HelpArticle[]
}

model HelpArticle {
  id            String   @id @default(cuid())
  categoryId    String
  slug          String   @unique
  title         String
  titleMy       String
  bodyMd        String
  bodyMdMy      String
  audience      String   @default("consumer")
  tags          Json?
  viewCount     Int      @default(0)
  helpfulCount  Int      @default(0)
  notHelpfulCount Int    @default(0)
  isPublished   Boolean  @default(true)
  sortOrder     Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  category HelpCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@index([categoryId, isPublished])
}
```

`SupportTicket.status` extends to
`open | in_progress | awaiting_customer | escalated | resolved | closed | reopened`.
Existing `open` and `resolved` keep their meaning — a pure widening of `support.js`'s enum.
`SupportTicket.category` extends with `refund | damage | account | complaint`.

Add to `model User`: `callbackRequests CallbackRequest[]`.

## 4. API changes

**Modified `server/routes/support.js`:** `GET /` (`:24`) gains filters and admin scope (agents
must see all tickets, not just their own); `POST /` (`:41`) sets `reference`, `priority`, SLA
dates, and fires the notification. Both keep their response shape, extended additively.

**New:**

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/support/:id` | owner+agent | detail + thread |
| POST | `/api/support/:id/messages` | owner+agent | reply |
| PATCH | `/api/support/:id` | agent | status, priority, tags |
| POST | `/api/support/:id/assign` | agent | assign/claim |
| POST | `/api/support/:id/escalate` | agent | bump level |
| POST | `/api/support/:id/resolve` | agent | resolve + trigger CSAT |
| POST | `/api/support/:id/reopen` | owner | reopen within 7 days |
| POST | `/api/support/:id/csat` | owner | rate |
| GET/POST | `/api/support/callbacks` | user | list / request |
| PATCH | `/api/support/callbacks/:id` | agent | schedule / complete |
| GET | `/api/help/categories` | public | help centre nav |
| GET | `/api/help/articles` | public | list, `?category=`, `?audience=` |
| GET | `/api/help/articles/:slug` | public | article (increments `viewCount`) |
| GET | `/api/help/search?q=` | public | search |
| POST | `/api/help/articles/:slug/feedback` | public | helpful / not helpful |
| GET | `/api/support/admin/queue` | agent | work queue sorted by SLA risk |
| GET | `/api/support/admin/stats` | admin | volume, response times, CSAT, breaches |

Help-centre endpoints are **public** (mount alongside `catalogRouter` at `server/index.js:69`,
which is the existing no-auth mount point).

## 5. Backend implementation

```
server/routes/help.js            new — public help centre
server/lib/support/
  index.js       createTicket, reply, assign, escalate, resolve
  sla.js         due-date computation + breach detection (pure)
  routing.js     auto-assignment by category/load
  index adds an `agent` role concept — see §12
prisma/helpSeed.js               seed categories + articles from src/pages/Help.jsx FAQs
```

SLA breach detection joins the existing scheduler. Chatbot escalation (Feature 5) calls
`support.createTicket()` directly — one creation path, not two.

**Agent role:** `User.role` is currently `consumer | partner | admin | super_admin`
(`schema.prisma:32`). Support agents need ticket access without full admin. Add `support_agent`
as a fourth role and include it in the support routes' `requireRole` lists. This is a
string column, so no migration — but `server/lib/access.js` `ADMIN_ROLES` must **not** include
it, or agents inherit finance permissions.

## 6. Frontend implementation

- `src/pages/Help.jsx` (99 lines, exists) — becomes the help centre: category grid, search,
  article view, contact CTAs. Its five hardcoded FAQs seed `prisma/helpSeed.js`.
- **New** `src/pages/HelpArticle.jsx`, `src/pages/SupportTickets.jsx`,
  `src/pages/SupportTicketDetail.jsx`, `src/pages/CallbackRequest.jsx`.
- `src/pages/PartnerSupport.jsx` (exists) — extend to the same threaded UI rather than a
  second implementation.
- **New** `src/pages/admin/AdminSupportQueue.jsx` + `AdminSupportTicket.jsx`.
- `src/api/apiClient.js` — add `SupportTicket: '/support'`, `CallbackRequest: '/support/callbacks'`,
  `HelpArticle: '/help/articles'` to `ENTITY_PATHS`.
- Mobile: `servisaku-consumer/src/app/support/` and `servisaku-partner/src/app/partner/support.tsx`.

## 7. Admin changes

Agent queue sorted by SLA breach risk, ticket detail with thread + internal notes + customer
context (bookings, payments, past tickets), assignment, escalation, macros/canned responses,
callback scheduling board, help-article CRUD, and a stats dashboard (volume, first response,
resolution, CSAT, breach rate).

## 8. Customer changes

Help centre with search; ticket creation with attachments; threaded conversation; status
tracking; callback request; CSAT after resolution; reopen within 7 days.

## 9. Partner changes

Same system, partner-audience articles and categories. `PartnerSupport.jsx` already exists as
the entry point.

## 10. Notifications

`support_ticket_created`, `support_reply`, `support_ticket_closed` already exist
(`catalog.js:221–242`) — reuse. New: `ticket_assigned` (agent), `ticket_escalated`,
`callback_requested`, `callback_scheduled`, `callback_completed`, `csat_request`,
`sla_breach_warning` (agent/admin).

## 11. Validation

Subject 3–140, message 5–4000 (matches `support.js:35-36`); ≤ 5 attachments, ≤ 10 MB each;
≤ 10 open tickets per user; callback window in the future, ≤ 30 days out, within business
hours; CSAT 1–5, once per ticket; reopen only within 7 days of resolution and ≤ 3 times;
help article slug unique and URL-safe.

## 12. Security

Ticket access: owner + assigned agent + admin only. **Internal notes (`isInternal`) must never
appear in a customer-facing response** — filter in `mapOut`, not in the UI; a client-side-only
filter is one API call away from a leak. Agents see only the customer context relevant to the
ticket. Attachments follow the Feature 4 upload rules (signed URLs, MIME by magic bytes).
Help-centre content is admin-authored Markdown — sanitise on render, no raw HTML. Rate-limit
ticket and callback creation. Phone numbers in callbacks are PII: masked in list views, full
value only to the assigned agent. Audit every status/assignment change.

## 13. Edge cases

Ticket for a deleted booking (keep, note it); customer replies after closure (auto-reopen if
within 7 days, else new ticket linked to the old); agent deactivated with an open queue
(reassign in bulk); duplicate tickets on one issue (merge, keeping both threads);
callback outside business hours (offer the next available window); customer unreachable
(3 attempts, then close with `outcomeNote`); ticket escalated to L3 with no L3 agent
(admin queue); help article deleted while linked from a ticket (soft-delete via
`isPublished: false`); CSAT requested on an auto-resolved ticket (skip).

## 14. Testing checklist

```
server/lib/support/__tests__/sla.test.js       due dates per priority, breach, MYT + business hours
server/lib/support/__tests__/routing.test.js   auto-assignment, load balancing
server/routes/__tests__/support.access.test.js internal notes never leak; cross-user 403
```

- [ ] Ticket creation sets reference, priority, SLA dates; notifies
- [ ] Thread ordering; internal notes invisible to the customer **at the API layer**
- [ ] Assignment, escalation, resolution transitions
- [ ] SLA breach fires the agent warning
- [ ] Reopen within 7 days works; day 8 does not
- [ ] CSAT accepted once
- [ ] Callback: request → schedule → attempt → complete
- [ ] Help search returns relevant articles in both languages
- [ ] `support_agent` role cannot reach finance endpoints (`ADMIN_ROLES` regression guard)
- [ ] Existing `GET/POST /api/support` response keys unchanged

---

# Feature 9 — Terms & Conditions

## 1. Business logic

Six document types (customer terms, partner terms, privacy policy, refund policy,
cancellation policy, damage policy), each independently versioned, each with a legally
defensible acceptance log.

**Version semantics:** documents are **immutable once published**. A change creates a new
version row. `effectiveFrom` sets when it takes force. A *material* change
(`requiresAcceptance: true`) blocks the app until re-accepted; a typo fix does not.

**Acceptance capture** must record what makes it evidentiary: user, document, exact version,
timestamp, IP, user agent, and the surface it happened on. That tuple is the entire legal value
of the feature.

**Enforcement:** on login and on app load, compare the user's accepted versions against active
documents requiring acceptance for their role. Any gap → a blocking modal. Partners
additionally accept partner terms at onboarding — `server/routes/partners.js:336`
(`/me/onboarding/submit`) is the natural hook, and `User.onboardedAt` already marks completion.

## 2. Database changes

Required — two new tables. Nothing existing changes.

## 3. Prisma schema changes

```prisma
model LegalDocument {
  id                 String    @id @default(cuid())
  slug               String // customer_terms | partner_terms | privacy_policy
                            // | refund_policy | cancellation_policy | damage_policy
  version            String // semver-ish: "1.0", "1.1", "2.0"
  title              String
  titleMy            String
  contentMd          String
  contentMdMy        String
  summary            String? // "what changed" shown in the re-acceptance modal
  summaryMy          String?
  audience           String    @default("consumer") // consumer | partner | all
  requiresAcceptance Boolean   @default(true) // false for a typo fix
  isActive           Boolean   @default(false) // exactly one active version per slug
  effectiveFrom      DateTime
  publishedById      String?
  publishedAt        DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  acceptances LegalAcceptance[]

  @@unique([slug, version])
  @@index([slug, isActive])
  @@index([audience, isActive])
}

// Append-only evidentiary record. Never update; never delete.
model LegalAcceptance {
  id         String   @id @default(cuid())
  userId     String
  documentId String
  slug       String // denormalised so the log survives a document purge
  version    String
  acceptedAt DateTime @default(now())
  ipAddress  String?
  userAgent  String?
  source     String   @default("web") // web | mobile_consumer | mobile_partner | onboarding | api
  locale     String   @default("en")

  user     User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  document LegalDocument @relation(fields: [documentId], references: [id])

  @@unique([userId, documentId])
  @@index([userId])
  @@index([slug, version])
}
```

Add to `model User`: `legalAcceptances LegalAcceptance[]`.

## 4. API changes

**New router `server/routes/legal.js`** at `/api/legal` — public reads mounted alongside
`catalogRouter` (`server/index.js:69`):

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/legal/documents` | public | active documents, `?audience=` |
| GET | `/api/legal/documents/:slug` | public | active version, `?locale=` |
| GET | `/api/legal/documents/:slug/versions` | admin | version history |
| GET | `/api/legal/pending` | auth | documents this user must accept |
| POST | `/api/legal/accept` | auth | `{ slug, version }` → records IP + UA server-side |
| GET | `/api/legal/acceptances` | auth | the user's own acceptance history |
| POST | `/api/legal/documents` | admin | create a draft version |
| PATCH | `/api/legal/documents/:id` | admin | edit a **draft** only |
| POST | `/api/legal/documents/:id/publish` | super_admin | activate; deactivates the prior version |
| GET | `/api/legal/admin/acceptances` | admin | compliance report, exportable |

## 5. Backend implementation

```
server/routes/legal.js
server/lib/legal/
  index.js       activeDocuments(audience), pendingFor(user), accept(user, slug, version, req)
  enforce.js     requireAcceptance middleware
prisma/legalSeed.js   seeds v1.0 of all six documents
```

**Enforcement middleware** is the subtle part. Applying it globally locks users out of the very
screens they need. Apply it narrowly to *value-creating* actions:
`POST /api/bookings`, `POST /api/bookings/dynamic`, `POST /api/payments/create`,
`POST /api/partners/me/onboarding/submit`. Reading, browsing, viewing existing bookings, and
support stay open. Returns `403` with `{ error, code: 'legal_acceptance_required', documents: [...] }`
so the client can show the right modal.

`accept()` captures `req.ip` and `req.headers['user-agent']` **server-side** — never from the
request body, which the client controls and which would make the log worthless.

## 6. Frontend implementation

- **New** `src/pages/Legal.jsx` at `/legal/:slug` — renders Markdown, language toggle
  (`src/lib/LanguageContext.jsx` exists), version + effective date, print-friendly.
- **New** `src/components/LegalAcceptanceModal.jsx` — blocking, scroll-to-bottom before the
  accept button enables, shows `summary` of what changed. Mounted in `src/lib/AppShell.jsx`.
- **New** `src/pages/admin/AdminLegalDocuments.jsx` — Markdown editor, preview, version
  history, publish (with a confirmation naming how many users will be forced to re-accept).
- Footer links in `src/apps/consumer/ConsumerLayout.jsx` and `src/apps/partner/PartnerLayout.jsx`.
- Checkbox + link at signup (`src/pages/OTPLogin.jsx`, `src/pages/ProfileSetup.jsx`) and
  partner onboarding (`src/pages/PartnerOnboarding.jsx`).
- Mobile: `servisaku-consumer/src/app/legal/[slug].tsx`, same for partner, plus the modal.

## 7. Admin changes

Document editor with Markdown preview, draft/publish workflow, version history with diff,
publish confirmation showing the re-acceptance blast radius, acceptance compliance report
(who accepted what, when, from where), CSV export for legal.

## 8. Customer changes

Accessible policies in EN/BM; acceptance at signup; re-acceptance modal on material change
with a plain-language summary; personal acceptance history in profile.

## 9. Partner changes

Partner terms + damage policy at onboarding; re-acceptance on change. A partner who has not
accepted the current damage policy should not be dispatched new jobs — wire this into
`server/lib/matching.js` `isPartnerEligible()` alongside the Feature 1 freeze check.

## 10. Notifications

New: `terms_updated` (in_app + email, with the summary) and `acceptance_required`
(high priority, in_app + push). Send `terms_updated` **before** `effectiveFrom`, not on it —
users should have notice, not a surprise wall.

## 11. Validation

`slug` in the fixed set; `version` unique per slug; `contentMd` non-empty in both languages;
`effectiveFrom` not in the past at publish; exactly one `isActive` per slug (enforce in a
transaction at publish); acceptance requires the version to be the currently active one
(prevents accepting a stale version); published documents are immutable — `PATCH` rejects
anything with `publishedAt` set.

## 12. Security

Publishing is `super_admin` only. Documents are immutable after publish — the only path to a
change is a new version. `LegalAcceptance` is append-only; **there is no update or delete
endpoint at all**, by design. IP/UA captured server-side. Markdown sanitised on render (no raw
HTML). Acceptance records survive user deletion for the statutory retention period — this
conflicts with `onDelete: Cascade` on `LegalAcceptance.userId`, so on account deletion,
anonymise `userId` rather than cascading, and keep the row. **Decide the retention period with
counsel before implementing deletion.** Public document reads must be genuinely public
(unauthenticated) — a policy behind a login wall is arguably not disclosed.

## 13. Edge cases

User accepted v1.0, v1.1 is a typo fix (`requiresAcceptance: false` → no prompt); user in the
middle of booking when a new version publishes (allow the in-flight booking to complete, prompt
after); user declines (they keep read access and can complete existing bookings but cannot
create new ones — never silently degrade, say so); document published with a future
`effectiveFrom` (previous version stays active until then); partner accepted consumer terms
only (audience filtering); account deleted (anonymise, retain); two admins publish concurrently
(transaction + unique active constraint); user switches language mid-read (both versions are
the same document, one acceptance).

## 14. Testing checklist

```
server/lib/legal/__tests__/pending.test.js    audience filtering, version comparison, typo fixes
server/lib/legal/__tests__/enforce.test.js    which endpoints block, which do not
```

- [ ] All six documents seed and render in EN + BM
- [ ] Publishing v2 deactivates v1 atomically
- [ ] `requiresAcceptance: false` does not prompt
- [ ] Acceptance records the correct IP/UA **from the server**, not the body
- [ ] Blocked endpoints return `legal_acceptance_required`; browsing stays open
- [ ] Partner onboarding records partner terms acceptance
- [ ] Acceptance is append-only — no endpoint can modify or delete one
- [ ] Public document endpoints work unauthenticated
- [ ] Compliance export matches the acceptance table exactly

---

# Feature 10 — Malaysian Taxation

## 1. Business logic

Malaysian **Sales & Service Tax (SST)** — specifically the *service tax* component, charged by
SST-registered providers on taxable services. Two distinct taxable supplies exist in this
marketplace, and conflating them is the classic error:

1. **ServisAku → Customer** — the service fee. Taxable if ServisAku is the principal.
2. **ServisAku → Partner** — the *commission* is itself a taxable service ServisAku supplies
   to the partner. This is why `CommissionSettlement.sstOnCommission` exists in Feature 1.

**Tax-inclusive vs tax-exclusive** must be decided explicitly. `server/lib/dynamicPricing.js:206`
currently computes `tax = (subtotal + platformFee) × sstRate` and adds it — i.e. **exclusive**.
Malaysian consumer expectation is usually a tax-inclusive displayed price. Recommendation:
keep exclusive computation internally (it is correct and auditable) but **display inclusive**
with the SST line itemised at checkout, which is both compliant and non-surprising.

**Invoice requirements:** an SST tax invoice must carry the supplier's name, address, and SST
registration number; a sequential invoice number; date of issue; customer details; a
description of the service; the taxable amount; the SST rate and amount separately; and the
total. A refund issues a **credit note** referencing the original invoice — never an edit to it.

Rate history matters: a booking made under a 6% regime must invoice at 6% forever, even after
the rate changes. `Booking.priceBreakdown` and `Booking.configVersion` already snapshot pricing
at booking time (`schema.prisma:160-162`) — that design decision pays off exactly here. Invoices
read the snapshot; they never recompute.

## 2. Database changes

Required — two new tables (`TaxConfig`, `Invoice`) and one sequence for invoice numbering. The
per-service `Service.sstEnabled` flag already exists (`schema.prisma:486`) and is reused as-is.

## 3. Prisma schema changes

```prisma
model TaxConfig {
  id             String    @id @default(cuid())
  code           String // SST_SERVICE | SST_COMMISSION
  rate           Float // 0.08
  registrationNo String? // ServisAku's SST registration number
  appliesTo      Json? // category/service slugs; null = all taxable
  isInclusive    Boolean   @default(false)
  isActive       Boolean   @default(true)
  effectiveFrom  DateTime
  effectiveTo    DateTime? // set when superseded — gives a full rate history
  notes          String?
  createdAt      DateTime  @default(now())

  @@index([code, isActive])
  @@unique([code, effectiveFrom])
}

model Invoice {
  id             String    @id @default(cuid())
  invoiceNo      String    @unique // "INV-2026-000001" — sequential, gapless
  type           String    @default("tax_invoice") // tax_invoice | credit_note
  bookingId      String?
  consumerId     String?
  partnerId      String? // set on commission/settlement invoices
  settlementId   String?
  paymentId      String?
  // Amounts, MYR. Copied from the booking's priceBreakdown snapshot — never recomputed.
  subtotal       Float
  discountTotal  Float     @default(0)
  platformFee    Float     @default(0)
  taxableAmount  Float
  sstRate        Float
  sstAmount      Float
  total          Float
  currency       String    @default("MYR")
  refundedAmount Float     @default(0)
  // Supplier + customer snapshots — an invoice must not change when a profile does.
  supplierName   String
  supplierAddress String?
  sstRegistrationNo String?
  customerName   String
  customerAddress String?
  customerPhone  String?
  customerEmail  String?
  lineItems      Json // [{ description, qty, unitPrice, amount, taxable }]
  creditNoteFor  String? // Invoice.id this credit note reverses
  reason         String? // credit note reason
  issuedAt       DateTime  @default(now())
  pdfUrl         String?
  createdAt      DateTime  @default(now())

  @@index([bookingId])
  @@index([consumerId, issuedAt])
  @@index([partnerId, issuedAt])
  @@index([type, issuedAt])
}
```

Add to `model Booking`: `invoices Invoice[]` (plural — a booking can have a tax invoice plus
one or more credit notes).

**Invoice numbering** must be gapless and sequential for audit. Do not use `cuid()` or a count
query. Use a Postgres sequence created in the migration SQL:

```sql
CREATE SEQUENCE invoice_no_seq START 1;
```

and allocate with `SELECT nextval('invoice_no_seq')` inside the invoice-creation transaction.
`prisma/migrations/<ts>_tax_invoices/migration.sql` gets this appended by hand — Prisma will
not generate it.

## 4. API changes

**Modified:**
- `POST /api/pricing/calculate` and `POST /api/bookings/calculate` (`server/routes/catalog.js:123`,
  `:147`) — response gains an explicit `tax` block `{ rate, amount, inclusive, registration_no }`.
  `computePrice` already returns `tax` and pushes an SST breakdown line
  (`dynamicPricing.js:206`, `:217`); this surfaces it consistently.
- `server/lib/dynamicPricing.js` — `sstRate` (`:41`) reads `TaxConfig` instead of the literal.
  Keep the literal as the fallback when no config row exists, so nothing breaks mid-migration.
- `server/routes/bookings.js` — issue an `Invoice` when `paymentStatus` becomes `paid`/`escrowed`.

**New router `server/routes/invoices.js`** at `/api/invoices`:

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/` | scoped | consumer: own; partner: commission invoices; admin: all |
| GET | `/:id` | participant | detail |
| GET | `/:id/pdf` | participant | PDF (generated on demand, cached to `pdfUrl`) |
| POST | `/:id/credit-note` | admin | issue a credit note |
| GET | `/admin/tax-report` | admin | SST collected/payable by period |
| GET | `/admin/tax-report/export` | admin | CSV/XLSX for the accountant |
| GET | `/api/tax/config` | public | active rate, for display |
| PATCH | `/api/tax/config` | super_admin | supersede the rate (creates a new row) |

## 5. Backend implementation

```
server/lib/tax/
  index.js      activeConfig(code, at), applicableRate(service, at), calcSst(base, rate, inclusive)
  invoice.js    issueInvoice(booking|settlement), issueCreditNote(invoice, amount, reason)
  numbering.js  nextInvoiceNo() — Postgres sequence, inside the caller's transaction
  report.js     sstReport(from, to) — collected, refunded via credit notes, net payable
  pdf.js        renderInvoicePdf(invoice)
```

**Hooks:**
- `markPaidAndEscrow` (`payments.js:27`) → `issueInvoice(booking)`.
- `POST /payments/cash/collect` (Feature 1) → `issueInvoice(booking)`.
- `executeRefund` (Feature 3) → `issueCreditNote(invoice, refundAmount, reason)`.
- `settlement.generate` (Feature 1) → commission invoice to the partner.

**Never recompute tax on an existing invoice.** All amounts come from
`Booking.priceBreakdown`, which is already snapshotted at booking time. This is the single most
important implementation rule in this feature.

PDF: `pdfkit` or `puppeteer`. Prefer `pdfkit` — no headless-Chrome dependency in the API
container, and an invoice is a fixed layout, not a web page.

## 6. Frontend implementation

- `src/pages/BookingInvoice.jsx` (exists) — read the `Invoice` record instead of deriving from
  the booking; show the SST line, registration number, and invoice number; add PDF download.
- `src/pages/PaymentCheckout.jsx` — itemised subtotal / platform fee / SST / total.
- `src/lib/paymentEngine.js:11` — remove the 6% literal; read from `GET /api/tax/config`.
  **This is the customer-visible fix for §A4.**
- **New** `src/pages/admin/AdminTaxReports.jsx`.
- `src/pages/AdminFinance.jsx` — **Tax** tab.
- Mobile: invoice screens in both apps.

## 7. Admin changes

Tax configuration (rate, registration number, effective dates, per-category applicability),
SST report by period (collected on services, collected on commission, refunded via credit
notes, net payable), export for the accountant, invoice search, credit note issuance.

## 8. Customer changes

Itemised SST at checkout and on the invoice; downloadable PDF tax invoice; credit note on
refund; invoice history in profile.

## 9. Partner changes

Commission invoices from ServisAku (needed for the partner's own tax filing — a
business-registered partner cannot claim an input without one); annual earnings statement;
SST breakdown on settlements.

## 10. Notifications

`invoice_generated` already exists (`catalog.js:181`) — reuse. New: `credit_note_issued`
(consumer) and `commission_invoice_issued` (partner).

## 11. Validation

Rate 0–1; effective dates non-overlapping per `code`; registration number format
(`W10-1808-32000000`-style); credit note amount ≤ original invoice total minus already-credited;
invoice number sequential and gapless (assert in the report job); line items sum to subtotal;
`subtotal + platformFee + sst - discount == total` — assert on write and fail loudly, because a
tax invoice that does not add up is a compliance problem, not a display bug.

## 12. Security

Only `super_admin` changes tax configuration. Invoices are immutable once issued — corrections
are credit notes; there is no invoice update endpoint. Invoice access is participant-scoped;
PDFs are served through signed, expiring URLs. Tax reports are admin-only. The invoice sequence
must never be reset. Retain invoices for the statutory period (7 years in Malaysia) — this
means invoices must **not** cascade-delete with a booking or user; use `onDelete: Restrict` or
anonymise, as with `LegalAcceptance`.

## 13. Edge cases

Rate changes between booking and payment (booking-time rate wins — the snapshot); service
`sstEnabled: false` (zero tax, but still issue an invoice); partial refund (partial credit note,
tax proportional); full refund (full credit note); discount applied (tax on the discounted
amount — matches `dynamicPricing.js:206` ordering); cash payment (invoice issued at collection,
not at booking); commission invoice for a partner not SST-registered (still issued; the
partner's own registration is their concern); pre-registration bookings (no SST, invoice notes
it); rounding (round SST to 2 dp, then total — never round the total first); ServisAku crosses
the SST registration threshold mid-year (new `TaxConfig` row with the correct `effectiveFrom`,
historical invoices untouched); concurrent invoice creation (the sequence handles it).

## 14. Testing checklist

```
server/lib/tax/__tests__/calc.test.js       inclusive vs exclusive, rounding, zero rate,
                                            discount ordering
server/lib/tax/__tests__/invoice.test.js    field completeness, immutability, credit notes
server/lib/tax/__tests__/numbering.test.js  sequential + gapless under concurrent creation
server/lib/tax/__tests__/report.test.js     period totals reconcile with the invoice table
```

- [ ] 8% SST computed and displayed correctly end to end
- [ ] Front-end no longer shows 6% anywhere (§A4 closed)
- [ ] Booking-time rate survives a later rate change
- [ ] Invoice numbers are sequential and gapless under concurrent load
- [ ] Every required SST tax-invoice field is present
- [ ] Partial and full credit notes carry proportional tax
- [ ] Commission invoice issued to the partner per settlement
- [ ] Tax report reconciles: collected − credited == net payable
- [ ] `sstEnabled: false` service produces a zero-tax invoice, not a missing one
- [ ] PDF renders correctly and downloads on web and both mobile apps
- [ ] Invoice cannot be edited or deleted through any endpoint

---

# Part D — Consolidated change inventory

## New server files (43)

```
server/routes/       wallet.js  disputes.js  damageClaims.js  chatbot.js  legal.js
                     invoices.js  help.js  uploads.js
server/lib/payments/ index.js  billplz.js(moved)  stripe.js  cash.js  commission.js
server/lib/wallet/   index.js  ledger.js  settlement.js  freeze.js
server/lib/payouts/  batch.js  export.js  schedule.js
server/lib/refunds/  index.js  policy.js  execute.js
server/lib/disputes/ index.js
server/lib/damageClaims/ index.js  sla.js  compensation.js
server/lib/chatbot/  index.js  provider.js  knowledge.js  context.js  guardrails.js  escalation.js
server/lib/support/  index.js  sla.js  routing.js
server/lib/legal/    index.js  enforce.js
server/lib/tax/      index.js  invoice.js  numbering.js  report.js  pdf.js
server/lib/uploads/  index.js
server/lib/emailTemplates/  index.js  layout.js  components.js + 11 templates
prisma/              helpSeed.js  legalSeed.js
scripts/             backfill-wallets.mjs
```

## Modified server files (11)

| File | Change |
|---|---|
| `prisma/schema.prisma` | +17 models, additive columns on `Payment`, `PayoutRecord`, `RefundRequest`, `SupportTicket`, `NotificationPreference`, `User`, `Booking`, `Notification` |
| `server/index.js` | mount 8 routers; start 3 workers; raw-body route for the Stripe webhook |
| `server/routes/payments.js` | provider registry; Stripe webhook; cash collect; methods endpoint |
| `server/routes/payouts.js` | ledger-backed wallet; batches; bank details; **fix the `Math.round` sen loss** |
| `server/routes/refunds.js` | server-side policy; execution on approval; partner visibility |
| `server/routes/support.js` | threading, SLA, priority, assignment, agent scope |
| `server/routes/bookings.js` | cash-completion hook; invoice issue; refund auto-create |
| `server/routes/escrow.js` | wallet credit on release |
| `server/routes/catalog.js` | tax block in pricing responses |
| `server/lib/notifications/catalog.js` | ~45 new events |
| `server/lib/notifications/dispatcher.js` | per-channel `NotificationDelivery`; template dispatch |
| `server/lib/notifications/push.js` | real FCM + Expo provider |
| `server/lib/dynamicPricing.js` | `sstRate` from `TaxConfig` |
| `server/lib/matching.js` | exclude frozen partners and partners with unaccepted terms |

## New frontend files (~30)

`src/pages/`: PartnerWallet, PartnerBankDetails, RefundRequest, RefundStatus, DisputeCenter,
DisputeDetail, DamageClaimSubmit, DamageClaimDetail, PartnerDamageClaims, ChatbotHistory,
HelpArticle, SupportTickets, SupportTicketDetail, CallbackRequest, Legal ·
`src/components/`: ChatbotWidget, EvidenceUploader, LegalAcceptanceModal,
OutstandingCommissionBanner

No admin pages — that UI lives in the separate `servisaku-admin` repo (§A5); this repo ships
only the admin-scoped API.

## Config

`CORS_ORIGIN` must gain the admin app's deployed origin (§A5) · new env vars:
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`ANTHROPIC_API_KEY`, `FCM_SERVICE_ACCOUNT`, `EXPO_ACCESS_TOKEN`, `SST_REGISTRATION_NO`,
`APPWRITE_STORAGE_BUCKET_ID`

---

# Part E — Cross-cutting risks

1. **The `Math.round` sen loss in `payouts.js:109` is live today.** Every completed job has
   already under- or over-paid partners by up to RM 0.50. Fix it in Feature 1 and decide
   whether to reconcile historical amounts — that is a business call, not a technical one.
2. **The 6% vs 8% SST split (§A4) means customers are currently quoted the wrong tax.**
   Whatever the correct rate, the two numbers must agree before launch.
3. **The in-process queue loses work on restart** (`queue.js:11`, honestly documented there).
   Acceptable for notifications; **not acceptable for settlement generation or payout
   processing**. Those must be idempotent and re-runnable — which is why every one of them is
   guarded by a unique constraint above.
4. **No file upload exists yet.** Features 3, 4, and 8 all depend on it. Build
   `server/lib/uploads/` on Appwrite Storage first; it is a shared prerequisite, not a
   per-feature task.
5. **The admin UI is a different repo and a different developer (§A5).** Six of ten features
   expose admin-scoped endpoints that nothing in this repo calls, so they are only exercised by
   tests until the other app integrates. Keep their response shapes stable, and add the admin
   origin to `CORS_ORIGIN` before that integration is attempted.
6. **Legal/tax retention conflicts with cascade deletes.** `LegalAcceptance` and `Invoice` must
   survive user deletion. Resolve the retention policy with counsel before implementing account
   deletion.
