// ─────────────────────────────────────────────────────────────────────────────
// Consumable restock reminders.
//
// WHAT THIS IS NOT: a stock count. The platform cannot know what is in someone's
// van, and a system that implied otherwise would produce confidently wrong
// numbers that a partner would stop trusting after the first bad one.
//
// What it is: a count of jobs completed since the partner last said "restocked",
// against a per-item threshold derived from how fast that item is typically used.
// The prompt says "you have done 12 aircon jobs since your last restock" — a fact
// — and lets the partner draw the conclusion.
//
// The consumption model is pure and testable; only the counter touches the DB.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Consumables per category, with the number of jobs one restock typically
 * covers. Authored rather than inferred: we have no consumption data, and
 * pretending to derive these from usage would be inventing a number.
 */
export const CONSUMABLES = {
  aircon: [
    { item: 'coil cleaner', jobsPerRestock: 12 },
    { item: 'drain flush solution', jobsPerRestock: 15 },
    { item: 'filter brushes', jobsPerRestock: 30 },
  ],
  plumbing: [
    { item: 'washers and O-rings', jobsPerRestock: 20 },
    { item: 'PTFE tape', jobsPerRestock: 25 },
    { item: 'silicone sealant', jobsPerRestock: 15 },
  ],
  cleaning: [
    { item: 'detergent', jobsPerRestock: 10 },
    { item: 'microfibre cloths', jobsPerRestock: 20 },
    { item: 'floor cleaner', jobsPerRestock: 12 },
  ],
  pest: [
    { item: 'registered pesticide', jobsPerRestock: 8 },
    { item: 'bait stations', jobsPerRestock: 10 },
  ],
  electrical: [
    { item: 'connectors and terminals', jobsPerRestock: 25 },
    { item: 'insulation tape', jobsPerRestock: 30 },
  ],
  painting: [
    { item: 'masking tape', jobsPerRestock: 8 },
    { item: 'roller sleeves', jobsPerRestock: 10 },
    { item: 'filler', jobsPerRestock: 12 },
  ],
};

export const CATEGORIES = Object.keys(CONSUMABLES);

/** The default items a partner in a category should be tracked against. */
export function itemsFor(category) {
  return CONSUMABLES[category] || [];
}

/**
 * Which consumables are due a reminder?
 *
 * @param {Array} rows  PartnerConsumable rows
 * @param {object} [opts] { now }
 * @returns {Array<{ category, item, jobsSinceRestock, threshold, overBy }>}
 */
export function dueForRestock(rows = [], { now = new Date() } = {}) {
  return rows
    .filter((r) => {
      // A dismissal is respected until it expires — nagging is how a useful
      // prompt becomes one that gets ignored on sight.
      if (r.dismissedUntil && new Date(r.dismissedUntil) > now) return false;
      return r.jobsSinceRestock >= r.threshold;
    })
    .map((r) => ({
      category: r.category,
      item: r.item,
      jobsSinceRestock: r.jobsSinceRestock,
      threshold: r.threshold,
      overBy: r.jobsSinceRestock - r.threshold,
    }))
    .sort((a, b) => b.overBy - a.overBy);
}

/**
 * The reminder message. States the count and lets the partner conclude.
 *
 * Grouped by category rather than listed per item: "coil cleaner, drain flush
 * and filter brushes are all low" after 12 aircon jobs is three ways of saying
 * the same thing.
 */
export function reminderText(due, locale = 'en') {
  if (!due.length) return null;
  const byCategory = new Map();
  for (const d of due) {
    if (!byCategory.has(d.category)) byCategory.set(d.category, { jobs: d.jobsSinceRestock, items: [] });
    byCategory.get(d.category).items.push(d.item);
  }

  const parts = [...byCategory.entries()].map(([category, { jobs, items }]) => (locale === 'ms'
    ? `${jobs} kerja ${category} sejak stok terakhir — ${listMs(items)} mungkin rendah.`
    : `${jobs} ${category} jobs since your last restock — ${listEn(items)} may be running low.`));

  return parts.join(' ');
}

const listEn = (a) => (a.length === 1 ? a[0] : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const listMs = (a) => (a.length === 1 ? a[0] : `${a.slice(0, -1).join(', ')} dan ${a[a.length - 1]}`);

/** Days a dismissal holds for, so a "not now" is not forever. */
export const DISMISS_DAYS = 7;

export const dismissUntil = (now = new Date()) => new Date(now.getTime() + DISMISS_DAYS * 86400_000);

// ─── Database-facing ─────────────────────────────────────────────────────────

/**
 * Seed a partner's tracked consumables for a category. Idempotent — a partner
 * who adds a category twice does not get duplicate rows.
 */
export async function ensureTracked(db, partnerId, category) {
  const items = itemsFor(category);
  if (items.length === 0) return 0;
  await db.partnerConsumable.createMany({
    data: items.map((i) => ({
      partnerId, category, item: i.item, threshold: i.jobsPerRestock,
    })),
    skipDuplicates: true,
  });
  return items.length;
}

/**
 * Increment the counter for a completed job.
 *
 * Called on completion rather than on acceptance: a job that was accepted and
 * then cancelled consumed nothing.
 */
export async function recordJob(db, partnerId, category) {
  if (!CONSUMABLES[category]) return 0;
  const { count } = await db.partnerConsumable.updateMany({
    where: { partnerId, category },
    data: { jobsSinceRestock: { increment: 1 } },
  });
  return count;
}

/** The partner has restocked: reset the counters and clear any dismissal. */
export async function markRestocked(db, partnerId, { category, item, now = new Date() } = {}) {
  const where = { partnerId };
  if (category) where.category = category;
  if (item) where.item = item;
  const { count } = await db.partnerConsumable.updateMany({
    where,
    data: { jobsSinceRestock: 0, lastRestockedAt: now, dismissedUntil: null },
  });
  return count;
}

/** "Not now" — hold the reminder without resetting the count. */
export async function dismiss(db, partnerId, { category, now = new Date() } = {}) {
  const where = { partnerId };
  if (category) where.category = category;
  const { count } = await db.partnerConsumable.updateMany({
    where, data: { dismissedUntil: dismissUntil(now) },
  });
  return count;
}

/** Everything due for this partner, ready to render. */
export async function checkPartner(db, partnerId, { now = new Date(), locale = 'en' } = {}) {
  const rows = await db.partnerConsumable.findMany({ where: { partnerId } });
  const due = dueForRestock(rows, { now });
  return { due, text: reminderText(due, locale) };
}
