# 12 — Terms & Conditions vs Implementation: Conflict Report

**Source of truth:** *ServisAku Terms & Conditions, DRAFT v1.0* (Consumer, Partner and
Platform Terms of Use, governed by the laws of Malaysia).
**Code reviewed:** branch `feat/partner-wallet-cash-commission` at `b251de5`.
**Date:** 2 August 2026.

## Governing rule for this document

The Terms & Conditions are the **legal source of truth**. The implementation is **not
changed automatically** where the two disagree. Every conflict below is reported with its
clause, the current behaviour, the impact, and a recommended resolution — and the affected
feature is **paused pending explicit approval**. Backend changes to refund maths, liability
caps, commission or retention are commercial and legal decisions, not technical cleanups.

Nothing in this report has been actioned in code.

## Status legend

| Status | Meaning |
|---|---|
| **PAUSED** | Work on this feature is stopped until a direction is approved |
| **OPEN** | Conflict recorded; no work was scheduled on it yet |
| **GATED** | Built, but disabled behind a flag so it cannot surface the conflict |

## Severity legend

| Severity | Meaning |
|---|---|
| **Critical** | Money is currently moving contrary to the contract, or the contract promises money the app will not pay |
| **High** | A contractual control or obligation is absent; exposure is real but not yet quantified per transaction |
| **Medium** | Contractual mismatch with limited immediate money impact, or an evidentiary gap |
| **Low** | A promised feature does not exist; no customer is currently harmed |

---

## Summary

| # | Conflict | Clause | Severity | Status |
|---|---|---|---|---|
| C-01 | Cancellation refund tiers pay less than the contract promises | 8.1 | **Critical** | PAUSED |
| C-02 | Cancellation fee is a percentage, not the contractual RM 15–30 band | 8.2 | **Critical** | PAUSED |
| C-03 | Partial refunds above RM 100 auto-approve without operations authorisation | 9.2 | High | PAUSED |
| C-04 | Escrow is never released automatically | 7.9(b) | High | PAUSED |
| C-05 | Commission rate is resolved live, not fixed at acceptance | 7.6 | High | PAUSED |
| C-06 | Platform liability cap is not enforced anywhere | 20.7 | High | PAUSED |
| C-07 | Damage reporting window is 48h in code, 24h in the contract | 20.10(a), 28.3(c) | Medium | PAUSED |
| C-08 | Surge multiplier has no 1.5x ceiling | 10.6 | Medium | OPEN |
| C-09 | Bookings are not bound to the T&C version in force | 25.5, 33.12 | Medium | OPEN |
| C-10 | Quality complaint windows and the workmanship guarantee do not exist | 28.2, 28.3 | Medium | OPEN |
| C-11 | Retention periods (7 years / 90 days) are not implemented | 18.11, 17.4 | Medium | OPEN |
| C-12 | Booking timing constants are not enforced | 6.3, 6.5, 6.14 | Medium | OPEN |
| C-13 | No-show fee does not exist | 6.15(a) | Medium | OPEN |
| C-14 | Tipping does not exist | 10.12 | Low | OPEN |
| C-15 | Late-payment interest of 1%/month is not charged | 7.12 | Low | OPEN |
| C-16 | Dormant-account deactivation does not exist | 5.12 | Low | OPEN |

> **Update, 2 Aug 2026 — this report is now generated, not hand-written.**
> The conflict detection engine (`server/lib/policy/conflicts.js`, `docs/13-policy-registry.md` §F)
> reproduces every finding below from seeded data, and decomposes them to key level:
> **45 key-level conflicts — 15 critical, 21 high, 5 medium, 4 low.** The counts differ
> because one finding here can span several policy keys (C-02 alone is four:
> `cancellation.fee_min_myr`, `fee_max_myr`, `high_value_threshold_myr`,
> `high_value_fee_percent`). The engine also surfaced items this manual pass missed —
> `commission.change_notice_days` (7.6, 14-day notice), `partner.appeal_window_days`
> (23.2), `partner.reverification_months` (4.3), and a refund-timing mismatch where the
> chatbot states 3–10 working days against the contract's 5–7 (9.4).
>
> The narrative findings below remain the reviewed, human-readable version and are what
> the approval sheet refers to. Neither document changes any code.

**Also GATED:** the AI chatbot's Terms & Conditions knowledge source
(`docs/11-ai-chatbots.md` §C2, phase 6) ships disabled. Enabling it would make the
assistant quote clauses the platform does not honour — turning every conflict below into a
statement made directly to a customer, in writing, with a clause citation attached.

---

# C-01 · Cancellation refund tiers pay less than the contract promises

**Severity: Critical · Status: PAUSED**

### The clause

> **8.1 Free cancellation window.** A Customer may cancel a confirmed Booking free of
> charge at any time more than four (4) hours before the scheduled start time. The full
> amount paid is refunded in accordance with Clause 9.

Reinforced by the parameter schedule: *"Free cancellation window (Customer) — More than 4
hours before scheduled start."*

### The implementation

`server/lib/refunds/policy.js:17` and `:97`:

```js
export const FULL_REFUND_HOURS = 48;
export const PARTIAL_REFUND_HOURS = 4;
…
if (hoursNotice > FULL_REFUND_HOURS) return build(100, POLICIES.CANCEL_GT_48H, …);
if (hoursNotice > PARTIAL_REFUND_HOURS) return build(75, POLICIES.CANCEL_4_TO_48H, …);
return build(50, POLICIES.CANCEL_LT_4H, …);
```

| Notice given | T&C 8.1 owes | Code pays | Shortfall |
|---|---|---|---|
| More than 48h | 100% | 100% | — |
| 4h – 48h | **100%** | **75%** | **25% of booking value** |
| Under 4h | fee applies (see C-02) | 50% | see C-02 |

There is a second, separate divergence at `policy.js:103`: a booking in status `accepted`
refunds 50% **regardless of notice**. A customer cancelling three days ahead of a job a
partner has already accepted is contractually owed 100% and is paid 50%.

### Impact

Every customer cancelling between 4 and 48 hours ahead has been underpaid by a quarter of
their booking value, and every customer cancelling an already-accepted booking at any
notice by half. On a RM 200 booking that is RM 50 and RM 100 respectively.

This is a **Consumer Protection Act 1999** exposure, not merely a contractual one — clause
9.11 and 32.1 both preserve statutory rights that cannot be contracted out of, and the
platform's own published terms are the benchmark a Tribunal for Consumer Claims would
apply. It is also live today, on historical transactions, not only prospectively.

### Recommended resolution

**Change the code to match the contract.** The T&C is the binding side, and it is also the
document the customer saw. Specifically:

- `FULL_REFUND_HOURS: 48 → 4`, so any cancellation more than 4 hours out is 100%.
- The `accepted`-status 50% rule must be removed or reduced to apply only inside the 4-hour
  window; partner mobilisation cost is what the cancellation fee in C-02 is for.
- Decide separately whether to **reconcile historically underpaid cancellations**. That is
  a business call with a defined population — it can be quantified from `RefundRequest`
  rows where `policy IN ('cancel_4_to_48h', 'partner_accepted')`.

**Alternative, if the 48-hour tier is commercially necessary:** amend the T&C before
launch rather than after. Clause 25.2 requires 14 days' notice for a material change to
cancellation or refund rules, and clause 25.5 protects bookings already confirmed — so an
amendment cannot fix the existing population either way.

### Paused

Any change to `policy.js`, and the chatbot's `c.refund.policy` intent, which would
otherwise state one of the two numbers as fact.

---

# C-02 · Cancellation fee is a percentage, not the contractual band

**Severity: Critical · Status: PAUSED**

### The clause

> **8.2 Late cancellation by the Customer.** Cancellation within four (4) hours of the
> scheduled start time attracts a Cancellation Fee. The Cancellation Fee is between RM 15
> and RM 30 for standard Bookings, scaled by Booking Value … For high-value Bookings
> (above RM 300), Bookings requiring specialist mobilisation, and multi-day works … a
> higher Cancellation Fee of up to fifty per cent (50%) of the Booking Value may apply, as
> disclosed at the point of booking.

### The implementation

There is no cancellation fee. `grep -rniE "cancellationFee|no_show_fee" server/` returns
nothing. `policy.js` instead withholds a **percentage**: 50% of the booking value inside 4
hours, expressed as a refund of the other 50%.

| Booking value | T&C 8.2 fee | Code effectively charges | Difference |
|---|---|---|---|
| RM 80 | RM 15 | RM 40 | Customer overcharged RM 25 |
| RM 150 | ~RM 22 | RM 75 | Customer overcharged ~RM 53 |
| RM 280 | RM 30 | RM 140 | Customer overcharged RM 110 |
| RM 500 | up to RM 250 | RM 250 | Aligned only by coincidence |

### Impact

Under RM 300 — the majority of bookings — customers are charged **substantially more than
the contract permits** for a late cancellation. The percentage model only converges with
the contract at the top of the range.

It also breaks a disclosure obligation: clause 8.2 requires the fee to be *"disclosed on
the cancellation screen before the cancellation is confirmed"*, and clause 10.2 forbids
undisclosed charges. A percentage the customer discovers as a reduced refund is not a
disclosed fee.

### Recommended resolution

Implement the contractual model: a banded fee (RM 15–30 scaled by value) for standard
bookings, an RM 300 threshold above which a percentage up to 50% applies, and the fee
displayed on the cancellation screen before confirmation. This is a new module rather than
a tweak — recommend `server/lib/refunds/cancellationFee.js`, pure and unit-tested, called
by `eligibleRefund`.

C-01 and C-02 must be decided together: they are one policy expressed in two clauses, and
fixing either alone produces an incoherent refund.

### Paused

`policy.js`, the cancellation UI, and the chatbot cancellation flow
(`docs/11-ai-chatbots.md` §E5).

---

# C-03 · Partial refunds above RM 100 auto-approve

**Severity: High · Status: PAUSED**

### The clause

> **9.2 Partial refunds.** … Partial refunds above RM 100 require authorisation by
> ServisAku's operations team.

### The implementation

`server/lib/refunds/policy.js:112`:

```js
export function isAutoApprovable(policy) {
  return [POLICIES.CANCEL_GT_48H, POLICIES.CANCEL_4_TO_48H, POLICIES.CANCEL_LT_4H].includes(policy);
}
```

Approval turns on the **policy that produced the refund**, never on the **amount**. A 75%
refund on an RM 800 booking — RM 600 — auto-approves with no human involvement.

### Impact

A control the contract states exists does not exist. The exposure is refund fraud and
error at scale: an automated path that can disburse an unbounded amount is precisely what
the RM 100 threshold was written to prevent. Clause 9.10 anticipates coordinated refund
abuse; this is the control that would catch it.

Note this is a *control* conflict, not a customer-harm conflict — customers are not
underpaid. It is the platform that carries the risk.

### Recommended resolution

Add an amount test to `isAutoApprovable`, threshold configurable and defaulting to RM 100,
so any refund above it routes to the existing operations approval queue regardless of
policy. Low implementation cost; the queue already exists in `server/routes/refunds.js`.

### Paused

`isAutoApprovable` and anything that calls it.

---

# C-04 · Escrow is never released automatically

**Severity: High · Status: PAUSED**

### The clause

> **7.9 Escrow and holding of funds.** Escrowed funds … (b) are released to the Partner,
> net of Platform Commission and any authorised deduction, twenty-four (24) hours after
> the Customer confirms completion, or forty-eight (48) hours after completion where the
> Customer neither confirms nor raises a dispute.

### The implementation

`server/routes/escrow.js` exposes a manual `PATCH` that sets `status: 'released'` and
stamps `releasedAt`. There is no scheduled job: a search for an auto-release worker across
`server/` returns nothing. Funds stay `held` until a human acts.

### Impact

Partners are not paid on the timetable the contract commits to. The 48-hour branch is the
one that matters — it exists precisely for the common case where a customer simply does
not respond, and without it those funds sit indefinitely.

This compounds with cash commission: a partner can simultaneously owe settled commission
(enforced, with dispatch frozen at 7 days per `wallet/freeze.js`) while being owed escrowed
earnings the platform has not released. The enforcement is automated; the obligation is
not. That asymmetry is the reputational risk here, more than the float.

### Recommended resolution

Implement the release worker with both branches, idempotent per escrow row, in
`Asia/Kuala_Lumpur`. Use the existing pattern from `server/lib/payouts/schedule.js`, which
already solves the same timezone and re-run-safety problem. Dispute freezing under
7.9(c) already exists (`status: 'frozen'`) and must suppress release.

### Paused

Escrow release automation.

---

# C-05 · Commission rate is resolved live, not fixed at acceptance

**Severity: High · Status: PAUSED**

### The clause

> **7.6 Platform Commission.** … Changes to commission rates take effect on not less than
> fourteen (14) days' notice under Clause 25 and **do not apply to Bookings already
> accepted**.

### The implementation

`server/lib/payments/commission.js:44` resolves the rate from the partner's *current* tier
at the moment money is split:

```js
export function rateFor(partner) {
  const tier = partner?.partnerProfile?.tier;
  …
}
```

and `server/lib/wallet/index.js:28` calls `split(booking.price, { partner, rate })` at
credit time. Neither `Booking` nor `WalletLedgerEntry` stores a `commissionRate`. Changing
a partner's tier therefore **re-prices every accepted-but-unsettled booking**, in either
direction.

### Impact

A partner who accepts a job at 20% and is moved to the `new_partner` 25% tier before the
job settles is charged 25% on work already accepted — directly contrary to 7.6. The same
mechanism silently rewrites the commission on historical jobs whenever a tier changes,
which also makes settlement statements irreproducible after the fact.

There is no notice mechanism for the 14-day requirement either.

### Recommended resolution

Snapshot the rate at acceptance: add `commissionRate` to `Booking`, populate it when the
partner accepts, and have `split()` prefer the stored rate over `rateFor(partner)`. This
also makes settlements reproducible, which is worth having independently of the clause.

The 14-day notice mechanism is a separate, smaller piece and can follow.

### Paused

Commission tiering, and any tier migration.

---

# C-06 · Platform liability cap is not enforced

**Severity: High · Status: PAUSED**

### The clause

> **20.7 Cap on liability.** … ServisAku's total aggregate liability to a User … is
> limited to the greater of: (a) the total Fees actually received and retained by
> ServisAku from that User in respect of the Booking giving rise to the claim; and
> (b) RM 1,000; and in respect of all claims arising in any twelve (12) month period, to
> the total Fees actually received and retained … in that period, or RM 5,000, whichever
> is greater.

And **20.10(d)**: *"any goodwill payment made by ServisAku … is capped by Clause 20.7"*.

### The implementation

`server/lib/damageClaims/sla.js:25`:

```js
export const MAX_CLAIM_AMOUNT = Number(process.env.DAMAGE_MAX_CLAIM_MYR || 50000);
```

`splitLiability()` apportions an approved amount between partner and platform with no cap
on the platform's share. A claim can be approved at RM 50,000 and the platform-absorbed
portion is whatever remains after the partner's percentage — up to the full amount if
partner liability is set to 0%.

There is no per-booking cap, no rolling 12-month aggregate, and no check of fees retained.

### Impact

The platform can pay out fifty times its contractual maximum on a single claim, and the
12-month aggregate is entirely untracked. This is the single largest uncapped financial
exposure in the codebase.

Note the interaction with 20.10(c): where the partner is responsible, the contract
contemplates directing the claim to the **partner's public liability insurer**, not paying
it from the platform. `INSURANCE_THRESHOLD` (RM 1,000) already exists and flags this, but
it only sets `viaInsurance: true` — it does not prevent a platform-absorbed payment.

### Recommended resolution

Enforce the cap where compensation is *executed*, not where a claim is assessed: a claim
may legitimately be **assessed** at RM 5,000 while ServisAku's own payment is capped at
RM 1,000, with the balance routed to the partner or their insurer. Add the per-booking cap
and a rolling 12-month per-user aggregate, both configurable, and surface the cap in the
admin decision UI so the reviewer sees it before approving.

Do **not** simply lower `MAX_CLAIM_AMOUNT` — that would stop customers filing large
genuine claims, which is a different and worse outcome.

### Paused

Damage-claim compensation execution (`POST /damage-claims/:id/compensate`).

---

# C-07 · Damage reporting window: 48h in code, 24h in the contract

**Severity: Medium · Status: PAUSED**

### The clause

> **20.10** … (a) the Customer must report the damage through the Platform **within
> twenty-four (24) hours** of completion, with photographs and a description; late reports
> may be refused where late notification has prejudiced investigation.

> **28.3(c)** … within twenty-four (24) hours for property damage claims under Clause 20.10.

### The implementation

`server/lib/damageClaims/sla.js:20`:

```js
/** A claim must be filed within this window of the job completing. */
export const REPORTING_WINDOW_HOURS = 48;
```

A late claim is accepted and flagged rather than refused — which is *compatible* with
20.10(a) ("may be refused"), and is the better behaviour. The conflict is the number.

### Impact

Low customer harm: the code is **more generous** than the contract, so nobody is turned
away who should have been accepted. The problems are downstream:

- The chatbot and help centre would state 24 hours (from the T&C) while the product
  accepts 48 — or state 48 and contradict the contract.
- In a disputed claim, the platform's own published window is the one that governs, and
  the code's flag would not distinguish "late per contract" from "late per product".

### Recommended resolution

Decide which number is the policy and make both say it. Recommend **keeping 48 hours and
amending the T&C**, since the more generous window is better for customers, it is already
live, and narrowing it after launch is a material change requiring 14 days' notice under
25.2. This is the one conflict where amending the contract is the cleaner fix.

### Paused

The damage-claim window constant, and the chatbot's `c.faq.damage` answer.

---

# C-08 · Surge multiplier has no ceiling

**Severity: Medium · Status: OPEN**

### The clause

> **10.6 Surge and dynamic pricing.** … A surge multiplier of **up to 1.5x** may apply
> during peak demand windows, on gazetted public holidays and during declared special
> periods.

### The implementation

`server/lib/pricing.js:11` accepts a `surge` argument and multiplies by it with no clamp:

```js
const subtotal = Math.round((pkgPrice + addonTotal) * surge);
```

`PricingRule` (`prisma/schema.prisma:1266`) has a `type: 'surge'` with no validated bound.
A misconfigured rule can price at any multiple.

### Impact

A configuration error — not a code path — can charge a customer more than the contract
permits, with no guard rail. The multiplier is disclosed before confirmation (satisfying
10.6's disclosure limb), so the customer sees it; but a 2.5x surge is disclosed *and*
contractually impermissible.

### Recommended resolution

Clamp at the pricing engine, not in the admin form: `Math.min(surge, MAX_SURGE)` with
`MAX_SURGE = 1.5` as a named constant citing the clause. Validate on rule creation too, so
the misconfiguration is rejected at the point it is made rather than silently capped later.

---

# C-09 · Bookings are not bound to the T&C version in force

**Severity: Medium · Status: OPEN**

### The clauses

> **25.5 Bookings already confirmed.** Amendments do not apply retrospectively to a Booking
> confirmed before the effective date, which continues to be governed by the version of
> these Terms in force at confirmation.

> **33.12** … The version in force at the time of a transaction governs that transaction,
> and ServisAku's version records are conclusive in the absence of manifest error.

### The implementation

`LegalDocument` and `LegalAcceptance` exist and are properly evidentiary — they capture
user, version, timestamp, IP and user agent. But `Booking` carries **no reference to a
legal document version**. There is no way to answer "which version of the terms governed
booking SVA-4471?" other than by inferring from timestamps.

### Impact

The clause that makes version records "conclusive" cannot be satisfied per transaction.
In a dispute about a refund entitlement — exactly the scenario C-01 makes likely — the
platform cannot demonstrate which cancellation rule the customer agreed to.

### Recommended resolution

Add `termsDocumentId` (and `termsVersion` denormalised, following the existing pattern at
`schema.prisma:244` where `slug` is denormalised to survive a purge) to `Booking`,
populated at confirmation from the then-current published document. Cheap now; impossible
to reconstruct later.

---

# C-10 · Quality complaint windows and workmanship guarantee do not exist

**Severity: Medium · Status: OPEN**

### The clauses

> **28.2 Workmanship period.** For Services involving repair, installation, carpentry,
> plumbing, electrical, painting or waterproofing works, the Partner warrants workmanship
> for the period published for the category, being **not less than thirty (30) days** from
> completion.

> **28.3 Notification windows.** … (a) within **forty-eight (48) hours** of completion for
> cleaning, beauty, grooming, wellness and massage categories; (b) within **thirty (30)
> days** of completion for repair, installation and workmanship categories.

### The implementation

Neither exists. There is no category-specific complaint window anywhere in `server/`, and
no workmanship guarantee period on `Service` or `Booking`. The damage window (C-07) is the
only completion-relative window implemented, and it covers property damage rather than
service quality.

### Impact

The Service Quality Guarantee in clause 28 is a headline commitment — re-performance, or a
refund, or a credit — and there is no mechanism to accept, time-bound or route a claim
under it. A customer with a leaking repair on day 20 has no product path to the remedy the
contract gives them, and support has no rule to apply.

### Recommended resolution

Add `complaintWindowHours` and `workmanshipDays` to `Service`, defaulted per category (48h
/ 30 days per 28.3, floor of 30 days per 28.2), and a quality-claim flow that checks the
window and routes to re-performance before refund. Sizeable but self-contained; the
existing dispute machinery in `server/routes/disputes.js` covers most of the workflow.

---

# C-11 · Retention periods are not implemented

**Severity: Medium · Status: OPEN**

### The clauses

> **18.11 Retention.** … Booking and financial records are retained for **seven (7) years**.

> **17.4** … These communications are logged and retained for dispute resolution, safety
> and compliance purposes, for a **minimum of ninety (90) days**.

> **24.8 Data on termination.** … Records required for tax, accounting, regulatory,
> dispute, limitation-period or fraud-prevention purposes are retained for the applicable
> period notwithstanding Account closure.

### The implementation

No retention or purge machinery exists. More importantly, the *opposite* risk is present:
several models cascade-delete from `User`, so closing an account would destroy records the
contract and Malaysian tax law require to be kept. This was flagged as risk #6 in
`docs/10-remaining-features.md` and remains unresolved.

### Impact

Two-sided. Records that must survive account closure may not; records that should be purged
are kept indefinitely, which is its own PDPA exposure under the Retention Principle
(clause 18.2).

Account deletion (S28 in the chatbot scenarios) cannot be safely implemented until this is
resolved — which is why it is called out here rather than left to the deletion feature.

### Recommended resolution

Audit every `onDelete: Cascade` from `User` against the 7-year requirement and switch the
financial and legal ones to `SetNull` with anonymisation. Then a scheduled purge for
categories that *should* expire. Resolve the retention policy with counsel before
implementing account deletion — the clause list above is a starting point, not advice.

---

# C-12 · Booking timing constants are not enforced

**Severity: Medium · Status: OPEN**

### The clauses

> **6.3** Slot reservations are held for a limited period (**currently ten (10) minutes**)
> pending payment authorisation.
> **6.5** A Partner has a limited window (**currently ten (10) minutes**) to accept a dispatch.
> **6.14** … the Partner will wait for the published grace period (**currently fifteen (15)
> minutes**) and will attempt contact through the Platform.

### The implementation

None of the three exists as an enforced constant. `server/lib/matching.js` has no dispatch
acceptance window; there is no slot-hold expiry; there is no 15-minute grace timer before a
customer no-show can be recorded.

### Impact

The parenthetical *"currently"* in each clause is doing useful work — it signals these are
operational parameters, not fixed promises, so the drafting is defensible. But a partner
disciplined for a slow acceptance, or a customer charged a no-show fee, is being measured
against a number the system does not actually apply. The 15-minute grace is the one with
teeth: it is the customer's protection against a premature no-show charge.

### Recommended resolution

Implement all three as named, configurable constants citing their clauses. The grace period
should gate the no-show transition (see C-13) rather than being advisory.

---

# C-13 · No-show fee does not exist

**Severity: Medium · Status: OPEN**

### The clause

> **6.15(a) Customer no-show.** … A no-show fee equal to the applicable Cancellation Fee,
> or such greater amount as reflects the Partner's travel and reserved time (up to fifty
> per cent (50%) of the Booking Value for Bookings above RM 300), is payable, and the
> balance is refunded in accordance with Clause 9.

### The implementation

No no-show fee. `policy.js` recognises `partner_no_show` (full refund to the customer,
correct per 6.15(b)) but has no customer-no-show counterpart.

### Impact

Partners are not compensated for a wasted trip when a customer fails to provide access.
The contract promises them this, and the compensation shown in the chatbot partner
scenarios (P48, P49) does not currently exist. Depends on C-02, since the fee is defined
by reference to the Cancellation Fee.

### Recommended resolution

Implement alongside C-02 as the same fee module, gated behind the 15-minute grace period
from C-12 and requiring the partner's contact attempts to be logged (6.14) as evidence.

---

# C-14 · Tipping does not exist

**Severity: Low · Status: OPEN**

### The clause

> **10.12 Tips.** Tips are voluntary. Where a tipping feature is offered in-app, one
> hundred per cent (100%) of the tip is passed to the Partner without deduction of Platform
> Commission. Partners must not solicit tips or condition performance on a tip.

### The implementation

No tip concept anywhere in the schema or routes.

### Impact

None on customers — the clause is conditional (*"where a tipping feature is offered"*), so
its absence is not a breach. Recorded because if tipping is ever built, the 100%-to-partner
and no-commission rules are contractual, not product choices, and the anti-solicitation
rule needs enforcement in the partner app.

### Recommended resolution

No action required now. When built: tips bypass `commission.split()` entirely and post
directly to the partner wallet as their own ledger entry type.

---

# C-15 · Late-payment interest of 1%/month is not charged

**Severity: Low · Status: OPEN**

### The clause

> **7.12 Late payment.** Amounts not paid when due (including Business Account invoices)
> bear interest at one per cent (1%) per month or part month, calculated from the due date
> until payment in full, together with reasonable costs of recovery.

### The implementation

`server/lib/wallet/freeze.js` implements the escalation ladder for overdue partner
commission — reminders, dispatch freeze at 7 days, payout suspension at 14 — but charges no
interest. Business Account invoicing is not built.

### Impact

None adverse to any user; the platform simply does not collect something it is entitled to.
Recorded for completeness, and because charging it later on balances that accrued while the
feature did not exist would itself be a problem.

### Recommended resolution

Leave unimplemented unless commercially wanted. If implemented, accrue only from the
implementation date forward, never retrospectively.

---

# C-16 · Dormant-account deactivation does not exist

**Severity: Low · Status: OPEN**

### The clause

> **5.12 Dormancy.** ServisAku may deactivate an Account that has had no login and no
> transaction for twenty-four (24) consecutive months, after giving at least thirty (30)
> days' notice to the registered email address. Any remaining promotional credit is
> forfeited on deactivation in accordance with Clause 29.

### The implementation

None. Also entangled with C-11 — deactivation must not destroy records the 7-year rule
requires.

### Impact

None currently. The clause is permissive (*"may"*).

### Recommended resolution

Defer until C-11 is resolved, since the retention policy determines what deactivation is
allowed to delete.

---

# What is paused, and what is not

## Paused pending approval

- `server/lib/refunds/policy.js` and the cancellation flow (C-01, C-02, C-03)
- Escrow release automation (C-04)
- Commission tiering and any tier migration (C-05)
- Damage-claim compensation execution and the reporting window (C-06, C-07)
- The chatbot's Terms & Conditions knowledge source — **GATED**, ships with
  `LEGAL_SOURCE_ENABLED=false` (`docs/11-ai-chatbots.md` §C2)
- The chatbot intents that would state a conflicting figure: `c.refund.policy`,
  `c.faq.damage`, and the cancellation action card

## Proceeding — no conflict

Everything else in the chatbot programme: the tree engine and all 41 trees, locale
detection, corpus expansion, read-only tools, support-mode troubleshooting, image and voice
handling, partner routing and guidance, and the frontend widget. None of these depends on a
disputed figure, and the trees deliberately hold no policy numbers — they route to the
modules that own them, which is why they are unaffected by whichever way each decision
goes.

---

# Approval sheet

Each line needs a direction before the paused work resumes. C-01 and C-02 must be decided
together.

| # | Decision needed | Options |
|---|---|---|
| C-01 + C-02 | Which refund and cancellation-fee model is the policy? | (a) change code to match T&C · (b) amend T&C before launch · (c) hybrid — state which |
| C-01 | Reconcile historically underpaid cancellations? | (a) yes, all · (b) on request only · (c) no |
| C-03 | Enforce the RM 100 operations-authorisation threshold? | (a) yes at RM 100 · (b) yes at another figure · (c) no |
| C-04 | Build automatic escrow release on the 24h/48h timetable? | (a) yes · (b) yes with different timings + amend T&C · (c) no |
| C-05 | Snapshot commission rate at acceptance? | (a) yes · (b) no |
| C-06 | Enforce the RM 1,000 / RM 5,000 liability cap on compensation? | (a) yes as drafted · (b) yes at other figures + amend T&C · (c) no |
| C-07 | Damage reporting window — 24h or 48h? | (a) keep 48h, amend T&C *(recommended)* · (b) change code to 24h |
| C-08–C-16 | Schedule as normal backlog, or treat any as urgent? | — |

Once a line is approved, the change is implemented against **that decision**, with tests,
and this document is updated to record the resolution and the date.
