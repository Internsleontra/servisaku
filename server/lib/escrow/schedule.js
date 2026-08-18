// Escrow release worker — runs the 7.9(b) timers on an interval.
//
// Mirrors the interval pattern of payouts/schedule.js and notifications/queue.js.
// Unlike the payout worker, which deliberately stops at `draft` so a bug cannot
// disburse, this one does move money: the contract commits to releasing without
// human action, so stopping short would reproduce the very gap C-04 describes.
//
// The safety comes from the sweep instead — every release is idempotent, timers
// are checked per row, and disputes/freezes suppress. Hourly is frequent enough
// for 24h/48h thresholds while keeping the query cost trivial.
import { runReleaseSweep } from './release.js';

let timer = null;

export function startEscrowReleaseWorker({ intervalMs = 60 * 60_000, runOnStart = false } = {}) {
  if (timer) return timer;

  const tick = async () => {
    try {
      const result = await runReleaseSweep();
      if (result.released > 0) {
        console.log(`[escrow] released ${result.released} of ${result.checked} due · RM${result.totalAmount}`);
      }
      if (result.failed.length) {
        console.error(`[escrow] ${result.failed.length} release(s) failed this tick`);
      }
    } catch (err) {
      console.error('[escrow] release worker tick failed:', err?.message || err);
    }
  };

  // Off by default at boot: a deploy should not be the thing that triggers a
  // batch of payouts. The first tick lands one interval in.
  if (runOnStart) tick();

  timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

export function stopEscrowReleaseWorker() {
  if (timer) { clearInterval(timer); timer = null; }
}
