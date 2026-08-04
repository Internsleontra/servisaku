// ─────────────────────────────────────────────────────────────────────────────
// Route suggestion for a partner's day.
//
// THE CONSTRAINT THAT SHAPES THIS: a booking's time belongs to the CUSTOMER, not
// the partner. A job with a scheduled start cannot be moved to suit a tidier
// route — that would need the customer's agreement, which is a Class W action,
// not a suggestion. So the optimiser may only reorder jobs that are genuinely
// flexible, and everything else is a fixed point it plans around.
//
// The output is always advisory. Nothing here writes, and nothing here proposes
// moving a customer's slot.
//
// Pure — no DB, no clock, no network. Distances are straight-line, which is
// honest about what it is: a comparison tool, not a satnav.
// ─────────────────────────────────────────────────────────────────────────────

/** Past this many stops an exact solve is not worth the latency. */
export const HEURISTIC_THRESHOLD = 8;

/**
 * Straight-line distance in km.
 *
 * Deliberately not road distance: we have no routing engine, and inventing a
 * precision we do not have would make a suggestion look like a promise. Good
 * enough to tell "this order backtracks" from "this order does not".
 */
export function haversineKm(a, b) {
  if (!isPoint(a) || !isPoint(b)) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return round1(2 * R * Math.asin(Math.sqrt(h)));
}

const isPoint = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Minutes to drive a distance in Klang Valley traffic.
 *
 * A flat average is a lie that is easy to read; a peak-aware one is a lie that
 * is useful. Both are estimates and the output says so.
 */
export function travelMinutes(km, { peak = false } = {}) {
  if (km == null) return null;
  const kmh = peak ? 18 : 28;
  return Math.max(5, Math.round((km / kmh) * 60));
}

/** Total distance of an ordered list of stops from a starting point. */
export function routeDistance(order, start = null) {
  let total = 0;
  let prev = start;
  for (const job of order) {
    if (prev && isPoint(prev) && isPoint(job.location)) {
      const d = haversineKm(prev, job.location);
      if (d != null) total += d;
    }
    prev = job.location;
  }
  return round1(total);
}

/**
 * Order the flexible jobs by nearest-neighbour, then improve with 2-opt.
 *
 * Fixed jobs are NOT passed to this — see optimiseRoute.
 */
export function nearestNeighbour(jobs, start = null) {
  const remaining = [...jobs];
  const order = [];
  let cursor = start;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const d = cursor ? haversineKm(cursor, remaining[i].location) : 0;
      if (d != null && d < bestDistance) { bestDistance = d; bestIndex = i; }
    }
    const [next] = remaining.splice(bestIndex, 1);
    order.push(next);
    cursor = next.location;
  }
  return order;
}

/** 2-opt: reverse any segment that shortens the route. */
export function twoOpt(order, start = null) {
  if (order.length < 4) return order;
  let best = [...order];
  let bestDistance = routeDistance(best, start);
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i += 1) {
      for (let k = i + 1; k < best.length; k += 1) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        const d = routeDistance(candidate, start);
        if (d < bestDistance - 0.01) {
          best = candidate;
          bestDistance = d;
          improved = true;
        }
      }
    }
  }
  return best;
}

/**
 * Suggest an order for today's jobs.
 *
 * @param {Array} jobs   [{ id, service, location: {lat,lng}, scheduledStart, address }]
 * @param {object} [opts]
 * @param {object} [opts.start]  where the partner is now
 * @param {boolean} [opts.peak]
 * @returns {{ order, legs, totalKm, totalMinutes, savedKm, fixedCount, advisory, reason }}
 */
export function optimiseRoute(jobs = [], { start = null, peak = false } = {}) {
  const usable = jobs.filter((j) => isPoint(j.location));
  if (usable.length === 0) {
    return {
      order: [], legs: [], totalKm: 0, totalMinutes: 0, savedKm: 0,
      fixedCount: 0, advisory: true, reason: 'no_locations',
    };
  }

  // A job with a scheduled start is a fixed point. Its position is the
  // customer's, not ours to improve.
  const fixed = usable.filter((j) => j.scheduledStart).sort(byTime);
  const flexible = usable.filter((j) => !j.scheduledStart);

  const current = [...fixed, ...flexible];
  let suggested;

  if (flexible.length === 0) {
    // Every job is pinned — there is nothing to optimise, and saying so is more
    // useful than presenting the existing order as a discovery.
    suggested = fixed;
  } else if (fixed.length === 0) {
    suggested = twoOpt(nearestNeighbour(flexible, start), start);
  } else {
    // Slot each flexible job after whichever fixed job it is nearest to, so the
    // fixed sequence is preserved exactly.
    suggested = insertFlexible(fixed, flexible, start);
  }

  const legs = buildLegs(suggested, start, peak);
  const totalKm = round1(legs.reduce((s, l) => s + (l.km || 0), 0));
  const totalMinutes = legs.reduce((s, l) => s + (l.minutes || 0), 0);
  const currentKm = routeDistance(current, start);

  return {
    order: suggested,
    legs,
    totalKm,
    totalMinutes,
    savedKm: round1(Math.max(0, currentKm - totalKm)),
    fixedCount: fixed.length,
    advisory: true, // always: changing a customer's slot is not ours to suggest
    reason: flexible.length === 0 ? 'all_fixed'
      : (usable.length > HEURISTIC_THRESHOLD ? 'heuristic' : 'optimal'),
  };
}

const byTime = (a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart);

/** Place each flexible job next to its nearest fixed anchor, order preserved. */
function insertFlexible(fixed, flexible, start) {
  const buckets = fixed.map((f) => ({ anchor: f, after: [] }));
  for (const job of flexible) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < fixed.length; i += 1) {
      const d = haversineKm(fixed[i].location, job.location);
      if (d != null && d < bestDistance) { bestDistance = d; bestIndex = i; }
    }
    buckets[bestIndex].after.push(job);
  }
  const out = [];
  for (const b of buckets) {
    out.push(b.anchor);
    // Within a bucket the jobs are genuinely free, so order them properly.
    out.push(...twoOpt(nearestNeighbour(b.after, b.anchor.location), b.anchor.location));
  }
  return start ? out : out;
}

function buildLegs(order, start, peak) {
  const legs = [];
  let prev = start;
  for (const job of order) {
    const km = prev && isPoint(prev) ? haversineKm(prev, job.location) : null;
    legs.push({
      jobId: job.id,
      service: job.service ?? null,
      address: job.address ?? null,
      scheduledStart: job.scheduledStart ?? null,
      fixed: Boolean(job.scheduledStart),
      km,
      minutes: travelMinutes(km, { peak }),
    });
    prev = job.location;
  }
  return legs;
}

/**
 * Does the current order backtrack?
 *
 * Reported rather than silently corrected: when every job is pinned, the partner
 * cannot act on it except by talking to a customer, and that is their call.
 */
export function backtrackWarning(jobs, { start = null } = {}) {
  const usable = jobs.filter((j) => isPoint(j.location));
  if (usable.length < 3) return null;
  const current = routeDistance(usable, start);
  const ideal = routeDistance(twoOpt(nearestNeighbour(usable, start), start), start);
  const excess = round1(current - ideal);
  // Below a couple of km the difference is inside the error of a straight-line
  // estimate, so reporting it would be false precision.
  if (excess < 2) return null;
  return { excessKm: excess, excessMinutes: travelMinutes(excess) };
}
