// ─────────────────────────────────────────────────────────────────────────────
// Cash "provider".
//
// There is no gateway here — the partner collects physical money at the door.
// It exists so server/routes/payments.js can treat every method uniformly
// instead of special-casing cash with an `if` at each call site.
//
// The consequential part of a cash booking is not the payment record but what
// follows it: because the partner holds the full fare, ServisAku's commission
// becomes a debt they owe. That is handled by server/lib/wallet/, not here.
// ─────────────────────────────────────────────────────────────────────────────

export const provider = {
  name: 'cash',

  // Always available — it needs no credentials.
  isReady: () => true,

  supportsMethod: (method) => method === 'cash',

  // Cash is never "checked out". A cash payment row is written directly by
  // POST /api/payments/cash/collect once the partner confirms collection.
  createCheckout() {
    throw new Error('Cash payments are recorded at collection, not through checkout');
  },

  // Nothing to poll — the record is authoritative the moment it is written.
  async fetchStatus() {
    return { paid: true, status: 'paid', raw: null };
  },

  verifyWebhook() {
    return { valid: false, reason: 'cash has no webhooks' };
  },

  // A cash refund is physical: the partner hands money back. The financial
  // consequence is a commission credit, handled by the refund flow.
  createRefund() {
    throw new Error('Cash refunds are settled off-gateway via a commission credit');
  },
};
