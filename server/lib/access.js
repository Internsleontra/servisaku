// Shared authorization helpers. Ownership rules:
//   consumer → records tied to their own bookings/account
//   partner  → records tied to bookings assigned to them
//   admin/super_admin → everything
import { prisma } from '../db.js';

export const ADMIN_ROLES = ['admin', 'super_admin'];

export const isAdmin = (user) => ADMIN_ROLES.includes(user?.role);

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export async function findUserByEmail(email) {
  if (!email) return null;
  return prisma.user.findUnique({ where: { email } });
}

export async function getBookingOr404(id) {
  // `payments` is included because the completion payment guard follows the
  // money, not just the intention: a booking whose `paymentMethod` says online
  // can still have been settled in cash, and vice versa. Additive — callers that
  // ignore it are unaffected. See lib/bookings/status.js#isCashBooking.
  const booking = await prisma.booking.findUnique({ where: { id }, include: { payments: true } });
  if (!booking) throw new ApiError(404, 'Booking not found');
  return booking;
}

export function isBookingParticipant(user, booking) {
  return isAdmin(user) || booking.consumerId === user.id || booking.partnerId === user.id;
}

export function assertBookingParticipant(user, booking) {
  if (!isBookingParticipant(user, booking)) throw new ApiError(403, 'Forbidden');
}

// Prisma where-fragment limiting a booking-joined query to the caller's bookings.
export function bookingScope(user) {
  if (isAdmin(user)) return {};
  return { booking: { OR: [{ consumerId: user.id }, { partnerId: user.id }] } };
}

// Resolve a set of user ids → { id: email } map for snake_case API output.
export async function emailsByIds(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, email: true },
  });
  return Object.fromEntries(users.map((u) => [u.id, u.email]));
}
