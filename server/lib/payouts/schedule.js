// Payout worker — generates the draft batch when a period closes.
//
// It stops at `draft` on purpose. Approval and processing stay human actions:
// a bug here should at worst produce a batch nobody approves, never an
// unintended disbursement.
//
// Mirrors the interval pattern of notifications/queue.js and wallet/settlement.js.
import { generateBatch } from './batch.js';

let timer = null;

export function startPayoutWorker({ intervalMs = 60 * 60_000 } = {}) {
  if (timer) return timer;
  const tick = async () => {
    try {
      // Idempotent per period via the unique batch reference, so running hourly
      // (and across restarts, and on more than one instance) is safe.
      const weekly = await generateBatch('weekly');
      if (weekly.created) {
        console.log(`[payouts] drafted ${weekly.batch.reference}: ${weekly.batch.partnerCount} partner(s), RM${weekly.batch.totalNet}`);
      }
      const monthly = await generateBatch('monthly');
      if (monthly.created) {
        console.log(`[payouts] drafted ${monthly.batch.reference}: ${monthly.batch.partnerCount} partner(s), RM${monthly.batch.totalNet}`);
      }
    } catch (err) {
      console.error('[payouts] worker tick failed:', err?.message || err);
    }
  };
  timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

export function stopPayoutWorker() {
  if (timer) { clearInterval(timer); timer = null; }
}
