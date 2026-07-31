// Shared fixture teardown for the smoke scripts.
//
// Written as one place because getting it wrong is silent: `notify()` creates
// Notification and NotificationPreference rows for whoever it touches, and those
// relations have no onDelete cascade — so deleting a test user fails with a
// foreign-key error. An earlier version swallowed that error with `.catch(() => {})`
// and quietly leaked every partner it created into the dev database.
//
// Deletion order matters: children before parents, and notifications before the
// user that owns them.
import { prisma } from '../server/db.js';

/**
 * Remove smoke-test fixtures.
 *
 * @param {object[]} users     user rows to delete
 * @param {object|object[]} [bookings] booking row(s) belonging to them
 * @returns {Promise<{ deleted: number, warnings: string[] }>}
 */
export async function cleanup(users = [], bookings = []) {
  const userIds = users.filter(Boolean).map((u) => u.id);
  const bookingList = (Array.isArray(bookings) ? bookings : [bookings]).filter(Boolean);
  const warnings = [];
  if (userIds.length === 0) return { deleted: 0, warnings };

  // notify() is deliberately fire-and-forget (a notification must never block a
  // payment), and the queue runs work on setImmediate. Deleting the users out
  // from under an in-flight write produces a confusing foreign-key error on
  // Notification. Give those writes a moment to land first — they are then
  // deleted below along with everything else.
  await new Promise((resolve) => { setTimeout(resolve, 500); });

  // Pick up any booking attached to these users, not just the ones passed in —
  // a test that fails midway may have created more than it tracked.
  const related = await prisma.booking.findMany({
    where: { OR: [{ consumerId: { in: userIds } }, { partnerId: { in: userIds } }] },
    select: { id: true },
  });
  const bookingIds = [...new Set([...bookingList.map((b) => b.id), ...related.map((b) => b.id)])];

  if (bookingIds.length) {
    await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.escrowLedger.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.refundRequest.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.chatMessage.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.bookingItem.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
  }

  await prisma.walletLedgerEntry.deleteMany({ where: { partnerId: { in: userIds } } });
  await prisma.commissionSettlement.deleteMany({ where: { partnerId: { in: userIds } } });
  await prisma.partnerWallet.deleteMany({ where: { partnerId: { in: userIds } } });
  await prisma.payoutRecord.deleteMany({ where: { partnerId: { in: userIds } } });

  // The rows that used to block the delete.
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.pushToken.deleteMany({ where: { userId: { in: userIds } } });

  const { count } = await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  // Report rather than swallow — a partial cleanup must be visible, not silent.
  if (count !== userIds.length) {
    warnings.push(`cleanup removed ${count}/${userIds.length} fixture users — check for leftover related rows`);
  }
  return { deleted: count, warnings };
}

/** Run cleanup and print any warning. Used by the smoke scripts' finally blocks. */
export async function cleanupAndReport(users, bookings) {
  try {
    const { warnings } = await cleanup(users, bookings);
    for (const w of warnings) console.warn(`⚠️  ${w}`);
  } catch (err) {
    console.warn(`⚠️  fixture cleanup failed: ${err?.message || err}`);
  }
}
