# Escrow attribution — product decision note

**Status: OPEN — recommendation only, nothing implemented.**
Raised 13 Aug 2026 during the partner financial remediation.

---

## The gap

`pending` means *the partner's share of money ServisAku has actually received and
is holding*. It is written by `creditEscrowHold`, which has exactly one caller —
`markPaidAndEscrow` in `server/routes/payments.js`, fired the moment a payment
settles.

That function returns early when the booking has no partner:

```js
if (netPayout <= 0 || !booking.partnerId) return Promise.resolve(null);
```

Correctly so — there is nobody to owe the money to. But **nothing fires later
when a partner is finally assigned**, so the hold is never created. The money
stays in escrow, attributed to no one, and never appears in any partner's
pending balance.

Any booking paid *before* assignment loses its hold permanently.

### Observed in development data

| Booking | Payout | Payment status | Partner |
| --- | --- | --- | --- |
| `…c0kbb4` | RM 48 | `escrowed` | none |
| `…q3zjoj` | RM 68 | `escrowed` | none |

RM 116 of received money with no partner-side record. Left uncredited
deliberately — see the reconciliation note below.

---

## Recommended future behaviour

```
payment received
  → escrow row stays `held`, unattributed        (no ledger entry — no partner yet)
  → partner assigned
  → create the partner-specific escrow_hold      (idempotent, keyed on bookingId)
```

Attribution follows assignment, not payment. The escrow row is already the
system of record for what is owed; the ledger entry is only the partner-side
view of it, so it should be written the moment a partner exists to hold it.

Two properties this must have:

- **Idempotent.** Key it `escrow_hold:<bookingId>`, the key `creditEscrowHold`
  already uses, so the payment path and the assignment path cannot double-credit
  the same booking.
- **Symmetric on unassignment.** If a partner is removed or replaced before
  release, the hold must be reversed and re-attributed. Otherwise reassignment
  silently duplicates the liability.

### Not recommended

Crediting at payment time to a placeholder or platform-held account. It creates a
balance nobody owns, and every downstream figure (`available`, `withdrawable`,
enforcement thresholds) would have to special-case it.

---

## Related live-code defect

`creditEscrowHold` is fire-and-forget:

```js
creditEscrowHold(booking, { partner: booking.partner }).catch((err) =>
  console.error('[payments] escrow hold ledger entry failed:', err?.message || err));
```

A transient failure loses the entry silently while the payment still succeeds.
There is no retry and no reconciliation sweep. One booking in development
(`…n8xp`, RM 68) is funded with a partner assigned and still has no hold — the
signature of exactly this failure.

Recommended: make the hold part of the payment transaction, or record the
failure somewhere a sweep can find it. Logging alone means the only way to
discover a lost entry is the financial audit.

---

## Reconciliation status

Neither defect was fixed during the remediation, by decision. The development
wallet was reconciled only as far as the approved correction allowed:

```
pending  RM 780
       − RM 744   synthetic opening_pending aggregate (reversed by adjustment)
       = RM 36
```

`scripts/audit-financial.mjs` reports both gaps on every run:

- `pending balance not backed by funded held escrow` — the RM 68 lost entry
- `funded escrow with no partner assigned` — the RM 116 above

They stay visible until the lifecycle above is decided and implemented.

---

## Decisions needed

1. Confirm attribution-on-assignment as the intended lifecycle.
2. Decide whether reassignment before release reverses and re-attributes.
3. Decide how the RM 116 already in this state is settled once the flow exists —
   backfilled on next assignment, or corrected explicitly.
