// ─────────────────────────────────────────────────────────────────────────────
// Partner assistant features, exposed as Class R tools.
//
// These are READS and DRAFTS. Nothing here mutates:
//   • route suggestion is advisory — a customer's slot is not ours to move
//   • an inventory prompt is a reminder the partner confirms or dismisses
//   • rating analysis reports the partner's own reviews back to them
//   • a message is a draft the partner edits and sends themselves
//
// The modules below are pure; this file is the thin layer that fetches the rows
// and applies the caller's identity. Same scoping rule as tools/read.js: every
// query is by `user.id`, never by an identifier from the conversation.
// ─────────────────────────────────────────────────────────────────────────────
import { optimiseRoute, backtrackWarning } from './routing.js';
import { checkPartner } from './inventory.js';
import { analyseReviews, summaryText } from './ratings.js';
import { draftMessage, situationOptions } from './replies.js';

export * from './routing.js';
export * from './inventory.js';
export * from './ratings.js';
export * from './replies.js';

const startOfDayMY = (now = new Date()) => {
  const my = new Date(now.getTime() + 8 * 3600_000);
  my.setUTCHours(0, 0, 0, 0);
  return new Date(my.getTime() - 8 * 3600_000);
};

/**
 * Suggest an order for today's jobs.
 *
 * Returns `reason: 'no_locations'` until bookings carry coordinates — see the
 * note on Booking.lat in schema.prisma. That is a visible, honest gap rather
 * than a route invented from an address string.
 */
export async function routeToday(db, user, { now = new Date(), peak = false } = {}) {
  const from = startOfDayMY(now);
  const to = new Date(from.getTime() + 86400_000);

  const [bookings, position] = await Promise.all([
    db.booking.findMany({
      where: {
        partnerId: user.id,
        date: { gte: from, lt: to },
        status: { in: ['accepted', 'en_route', 'arrived', 'started', 'assigned'] },
      },
      orderBy: { date: 'asc' },
      select: {
        id: true, serviceType: true, address: true, date: true, scheduledStart: true,
        lat: true, lng: true,
      },
    }),
    db.partnerLocation.findUnique({
      where: { partnerId: user.id },
      select: { lat: true, lng: true },
    }).catch(() => null),
  ]);

  const jobs = bookings.map((b) => ({
    id: b.id,
    service: b.serviceType,
    address: b.address,
    scheduledStart: b.scheduledStart || b.date,
    location: (Number.isFinite(b.lat) && Number.isFinite(b.lng)) ? { lat: b.lat, lng: b.lng } : null,
  }));

  const start = (position && Number.isFinite(position.lat) && Number.isFinite(position.lng))
    ? { lat: position.lat, lng: position.lng }
    : null;

  const result = optimiseRoute(jobs, { start, peak });
  return {
    data: { ...result, jobCount: jobs.length, backtrack: backtrackWarning(jobs, { start }) },
    ownedIds: jobs.map((j) => j.id),
  };
}

/** Consumables due a restock prompt. */
export async function inventoryCheck(db, user, { now = new Date(), locale = 'en' } = {}) {
  const result = await checkPartner(db, user.id, { now, locale });
  return { data: result, ownedIds: [] };
}

/** Themes across the partner's own reviews, with concrete advice. */
export async function ratingAnalysis(db, user, { locale = 'en', limit = 100 } = {}) {
  const reviews = await db.review.findMany({
    // Reviews of THIS partner's bookings. Never anyone else's, and the
    // reviewer's identity is not selected at all.
    where: { booking: { partnerId: user.id } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { rating: true, comment: true, createdAt: true },
  });
  const analysis = analyseReviews(reviews, { locale });
  return { data: { ...analysis, summary: summaryText(analysis, locale) }, ownedIds: [] };
}

/**
 * Draft a customer message.
 *
 * Needs no database access, but sits here so the assistant reaches it through
 * the same registry as everything else. The customer's locale comes from the
 * booking, not the partner's setting.
 */
export async function draftCustomerMessage(db, user, { situation, bookingId, ...params } = {}) {
  let customerLocale = params.customerLocale;
  let name = params.name;

  if (bookingId) {
    // Scoped by the partner's own id: a booking that is not theirs simply does
    // not resolve, so the draft falls back to a neutral greeting.
    const booking = await db.booking.findFirst({
      where: { id: bookingId, partnerId: user.id },
      select: { consumer: { select: { fullName: true, preferredLocale: true } } },
    }).catch(() => null);
    if (booking?.consumer) {
      customerLocale = customerLocale || booking.consumer.preferredLocale;
      name = name || booking.consumer.fullName?.split(' ')[0];
    }
  }

  const result = draftMessage(situation, { ...params, name, customerLocale });
  return { data: result, ownedIds: [] };
}

/** The situations offered as quick replies. */
export function messageOptions(locale = 'en') {
  return situationOptions(locale);
}
