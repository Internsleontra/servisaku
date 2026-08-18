// Paid-but-unassigned expiry worker.
//
// Same interval pattern as escrow/schedule.js and payouts/schedule.js. Runs
// hourly: the window is 72 hours, so hourly resolution is ample and keeps the
// query cheap.
//
// This one initiates refunds rather than paying partners, and for Billplz the
// money still needs an operator to act in their dashboard — the tick logs how
// many rows landed in that queue so the number is visible rather than buried.
import { runExpirySweep, isExpiryEnabled, EXPIRY_FLAG } from './expiry.js';

let timer = null;

export function startUnassignedExpiryWorker({ intervalMs = 60 * 60_000, runOnStart = false } = {}) {
  if (timer) return timer;

  // Say so once at boot. A money worker that is silently parked is worse than
  // one that is loudly parked — an operator reading the log must be able to
  // tell the difference between "off" and "broken".
  if (!isExpiryEnabled()) {
    console.log(
      `[expiry] worker DISABLED — ${EXPIRY_FLAG} is not "true". `
      + 'It will report what is due but will not refund, void escrow or cancel anything.',
    );
  }

  const tick = async () => {
    try {
      const result = await runExpirySweep();
      if (!result.enabled) {
        if (result.checked > 0) {
          console.log(
            `[expiry] DISABLED — ${result.checked} booking(s) would be refunded `
            + `(RM${result.wouldExpire.reduce((s, w) => s + w.amount, 0)}). No changes made.`,
          );
        }
        return;
      }
      if (result.expired > 0) {
        console.log(`[expiry] refunded ${result.expired} unassigned booking(s) · RM${result.totalAmount}`);
        if (result.needingManualAction > 0) {
          console.log(`[expiry] ${result.needingManualAction} awaiting a manual gateway refund (Billplz has no refund API)`);
        }
      }
      if (result.failed.length) {
        console.error(`[expiry] ${result.failed.length} expiry action(s) failed this tick`);
      }
    } catch (err) {
      console.error('[expiry] worker tick failed:', err?.message || err);
    }
  };

  // Not on boot — a deploy should not be what triggers a batch of refunds.
  if (runOnStart) tick();

  timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

export function stopUnassignedExpiryWorker() {
  if (timer) { clearInterval(timer); timer = null; }
}
