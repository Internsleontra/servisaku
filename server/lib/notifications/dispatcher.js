// ─────────────────────────────────────────────────────────────────────────────
// Notification dispatcher — the one entry point the rest of the server calls to
// notify a user. It:
//   1. resolves the recipient (id, email, phone, role)
//   2. renders the event from the catalog
//   3. loads the recipient's preferences and gates the channel list
//   4. persists a single canonical in-app Notification row
//   5. emits it in real-time (Socket.IO) + an updated unread badge count
//   6. fans email / SMS / push out off the request path via the queue
//
// notify() never throws to its caller — a notification failure must never break
// the booking/payment flow that triggered it.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from '../../db.js';
import { renderEvent, shortRef } from './catalog.js';
import { resolveChannels, DEFAULT_PREFERENCES } from './preferences.js';
import { emitNotification, emitUnreadCount } from './realtime.js';
import { enqueue } from './queue.js';
import { sendMail } from '../mailer.js';
import { sendSms } from '../sms.js';
import { sendPush } from './push.js';

export { shortRef };

// ─── Preferences ─────────────────────────────────────────────────────────────
export async function getOrCreatePreference(userId) {
  const existing = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (existing) return existing;
  try {
    return await prisma.notificationPreference.create({ data: { userId } });
  } catch {
    // Lost a create race — read the row the other writer made.
    return (await prisma.notificationPreference.findUnique({ where: { userId } })) || { userId, ...DEFAULT_PREFERENCES };
  }
}

async function resolveRecipient({ userId, recipientEmail, role }) {
  let user = null;
  if (userId) user = await prisma.user.findUnique({ where: { id: userId } });
  else if (recipientEmail) user = await prisma.user.findUnique({ where: { email: recipientEmail } });
  if (!user) return null;
  return { id: user.id, email: user.email, phone: user.phone, role: role || user.role || 'consumer' };
}

async function unreadCount(userId) {
  return prisma.notification.count({ where: { userId, isRead: false, isArchived: false } });
}

// ─── Email presentation ──────────────────────────────────────────────────────
function buildEmailHtml({ title, message, actionUrl, ctaLabel }) {
  const appUrl = (process.env.APP_WEB_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
  const cta = actionUrl
    ? `<a href="${appUrl}${actionUrl.startsWith('/') ? actionUrl : `/${actionUrl}`}"
         style="display:inline-block;background:#F97316;color:#fff;text-decoration:none;
                padding:12px 28px;border-radius:16px;font-weight:600;font-size:14px;margin-top:20px;">
         ${ctaLabel || 'Open ServisAku'}</a>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#F8F9FA;font-family:Inter,Segoe UI,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:32px 16px;">
      <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 8px 40px rgba(0,0,0,0.06);">
        <div style="font-size:20px;font-weight:800;color:#F97316;margin-bottom:24px;">ServisAku</div>
        <h1 style="font-size:20px;font-weight:700;color:#111;margin:0 0 12px;">${title}</h1>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0;">${message}</p>
        ${cta}
      </div>
      <p style="text-align:center;color:#9aa0a6;font-size:12px;margin-top:20px;">
        You received this because of activity on your ServisAku account.
      </p>
    </div></body></html>`;
}

// ─── Core ────────────────────────────────────────────────────────────────────
/**
 * Notify a user of an event.
 *
 * @param {object} params
 * @param {string} [params.userId]         recipient user id (preferred)
 * @param {string} [params.recipientEmail] recipient email (alternative to userId)
 * @param {string} params.event            catalog event key
 * @param {object} [params.data]           template data (serviceName, amount, otp, …)
 * @param {string[]} [params.channels]     override the catalog's default channels
 * @param {string} [params.bookingId]
 * @param {string} [params.paymentId]
 * @param {Date}   [params.scheduledAt]    deliver at a future time instead of now
 * @returns {Promise<object|null>} the persisted notification (snake_case) or null
 */
export async function notify(params) {
  try {
    const recipient = await resolveRecipient(params);
    if (!recipient) return null;

    const data = {
      ...params.data,
      bookingId: params.bookingId ?? params.data?.bookingId,
      ref: params.data?.ref
        || (params.bookingId ? shortRef('BK', params.bookingId) : undefined)
        || (params.paymentId ? shortRef('PAY', params.paymentId) : undefined),
    };

    const rendered = renderEvent(params.event, { ...data, role: recipient.role });
    const pref = await getOrCreatePreference(recipient.id);
    const requested = params.channels || rendered.channels;
    const channels = resolveChannels(pref, requested, {
      category: rendered.category, priority: rendered.priority,
    });
    if (channels.length === 0) return null; // fully opted out

    const scheduled = params.scheduledAt && params.scheduledAt > new Date();
    const usesInApp = channels.includes('in_app');

    // One canonical row per event. `channel` records the primary surface.
    const row = await prisma.notification.create({
      data: {
        userId: recipient.id,
        role: recipient.role,
        title: rendered.title,
        body: rendered.message,
        type: legacyType(rendered.category),
        category: rendered.category,
        priority: rendered.priority,
        icon: rendered.icon,
        actionUrl: rendered.actionUrl,
        link: rendered.actionUrl, // legacy alias
        bookingId: params.bookingId ?? null,
        paymentId: params.paymentId ?? null,
        metadata: buildMetadata(rendered, data, channels),
        channel: usesInApp ? 'in_app' : channels[0],
        isRead: false,
        deliveryStatus: scheduled ? 'queued' : 'sent',
        scheduledAt: scheduled ? params.scheduledAt : null,
        sentAt: scheduled ? null : new Date(),
      },
    });

    if (scheduled) return mapOut(row); // the poller will release + deliver it

    await deliver(row, recipient, rendered, channels);
    return mapOut(row);
  } catch (err) {
    console.error('[notifications] notify failed:', err?.message || err);
    return null;
  }
}

// Perform real-time emit + external channel fan-out for a ready notification.
async function deliver(row, recipient, rendered, channels) {
  // Real-time: push the new item and refresh the badge across the user's devices.
  emitNotification(recipient.id, mapOut(row));
  emitUnreadCount(recipient.id, await unreadCount(recipient.id));

  if (channels.includes('email') && recipient.email && rendered.emailSubject) {
    enqueue(() => sendMail({
      to: recipient.email,
      subject: rendered.emailSubject,
      html: buildEmailHtml(rendered),
      text: `${rendered.title}\n\n${rendered.message}`,
    }), { label: `email:${rendered.event}` });
  }

  if (channels.includes('sms') && recipient.phone && rendered.smsBody) {
    enqueue(() => sendSms({ to: recipient.phone, body: rendered.smsBody }), { label: `sms:${rendered.event}` });
  }

  if (channels.includes('push')) {
    enqueue(async () => {
      const tokens = await prisma.pushToken.findMany({ where: { userId: recipient.id } });
      if (tokens.length) {
        await sendPush({
          tokens: tokens.map((t) => ({ token: t.token, platform: t.platform, provider: t.provider })),
          title: rendered.title,
          body: rendered.message,
          data: { notificationId: row.id, actionUrl: rendered.actionUrl || '', category: rendered.category },
        });
      }
    }, { label: `push:${rendered.event}` });
  }
}

// Release a scheduled notification when it comes due (called by the poller).
export async function releaseScheduled(row) {
  const recipient = await resolveRecipient({ userId: row.userId });
  if (!recipient) return;
  const rendered = renderEvent(inferEvent(row), {
    ...(row.metadata || {}), role: row.role,
  });
  // Re-render title/message from the stored values (metadata may lack fields);
  // fall back to the persisted copy so the user always sees consistent text.
  rendered.title = row.title; rendered.message = row.body;
  rendered.actionUrl = row.actionUrl; rendered.category = row.category; rendered.priority = row.priority;
  const updated = await prisma.notification.update({
    where: { id: row.id },
    data: { deliveryStatus: 'sent', sentAt: new Date(), scheduledAt: null },
  });
  const channels = (row.metadata?.channels) || ['in_app'];
  await deliver(updated, recipient, rendered, channels);
}

// ─── Convenience wrappers used by lifecycle hooks ────────────────────────────
/** Notify the consumer side of a booking. */
export const notifyConsumer = (booking, event, data = {}, extra = {}) =>
  notify({ userId: booking.consumerId, event, bookingId: booking.id, data: bookingData(booking, data), ...extra });

/** Notify the assigned partner of a booking (no-op if unassigned). */
export const notifyPartner = (booking, event, data = {}, extra = {}) =>
  booking.partnerId
    ? notify({ userId: booking.partnerId, event, bookingId: booking.id, data: bookingData(booking, data), ...extra })
    : Promise.resolve(null);

function bookingData(booking, extra) {
  return {
    serviceName: booking.serviceType || booking.serviceName,
    date: fmtDate(booking.date),
    timeSlot: booking.timeSlot,
    partnerName: booking.partner?.fullName,
    customerName: booking.consumer?.fullName,
    ...extra,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return undefined;
  try { return new Date(d).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' }); }
  catch { return undefined; }
}

function legacyType(category) {
  if (category === 'payments' || category === 'wallet') return 'payment';
  if (category === 'bookings' || category === 'jobs') return 'booking_update';
  if (category === 'promotions') return 'promo';
  if (category === 'support') return 'chat';
  if (category === 'reviews') return 'reminder';
  return 'system';
}

function buildMetadata(rendered, data, channels) {
  const meta = { event: rendered.event, channels, ctaLabel: rendered.ctaLabel };
  if (data.serviceName) meta.serviceName = data.serviceName;
  if (data.ref) meta.ref = data.ref;
  if (data.amount) meta.amount = data.amount;
  if (data.partnerName) meta.partnerName = data.partnerName;
  if (data.customerName) meta.customerName = data.customerName;
  return meta;
}

function inferEvent(row) {
  return row.metadata?.event || 'system';
}

// Canonical snake_case output shared by dispatcher + routes.
export function mapOut(n) {
  return {
    id: n.id,
    user_id: n.userId,
    role: n.role,
    title: n.title,
    body: n.body,
    message: n.body, // legacy alias
    type: n.type,
    category: n.category,
    priority: n.priority,
    icon: n.icon,
    image: n.image,
    action_url: n.actionUrl,
    link: n.actionUrl, // legacy alias
    cta_label: n.metadata?.ctaLabel || null,
    booking_id: n.bookingId,
    payment_id: n.paymentId,
    metadata: n.metadata || null,
    channel: n.channel,
    is_read: n.isRead,
    is_archived: n.isArchived,
    delivery_status: n.deliveryStatus,
    scheduled_at: n.scheduledAt,
    sent_at: n.sentAt,
    created_date: n.createdAt, // legacy alias the web UI reads
    created_at: n.createdAt,
    updated_at: n.updatedAt,
  };
}
