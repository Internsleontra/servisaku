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
import { renderTemplate } from '../emailTemplates/index.js';

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
    // Both languages are produced from the same catalog entry and the same
    // render data, so they can never describe different facts. Malay is stored
    // now because the data needed to interpolate it exists only at this moment
    // — see the migration note on why read-time re-rendering is unsafe.
    const renderedMs = renderEvent(params.event, { ...data, role: recipient.role }, 'ms');
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
        titleMy: renderedMs.title,
        bodyMy: renderedMs.message,
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

    await deliver(row, recipient, rendered, channels, requested, pref?.language || 'en');
    return mapOut(row);
  } catch (err) {
    console.error('[notifications] notify failed:', err?.message || err);
    return null;
  }
}

// Record one delivery attempt per channel. Never throws — a tracking failure
// must not break the notification it is tracking.
async function trackDelivery(notificationId, userId, channel, data) {
  return prisma.notificationDelivery.create({
    data: { notificationId, userId, channel, ...data },
  }).catch((err) => {
    console.error('[notifications] delivery tracking failed:', err?.message || err);
    return null;
  });
}

async function markDelivery(id, data) {
  if (!id) return;
  await prisma.notificationDelivery.update({ where: { id }, data }).catch(() => {});
}

/**
 * Record channels the preference layer dropped, and why.
 *
 * Knowing a notification was NOT sent — and whether that was quiet hours, an
 * opt-out, or a missing address — is most of production notification debugging.
 * Without this, an unreceived message is indistinguishable from a bug.
 */
async function trackSkipped(row, recipient, requested, allowed) {
  const dropped = requested.filter((c) => !allowed.includes(c));
  for (const channel of dropped) {
    await trackDelivery(row.id, recipient.id, channel, { status: 'skipped', skipReason: 'preference_off' });
  }
}

// Perform real-time emit + external channel fan-out for a ready notification.
async function deliver(row, recipient, rendered, channels, requested = channels, locale = 'en') {
  // Real-time: push the new item and refresh the badge across the user's devices.
  emitNotification(recipient.id, mapOut(row));
  emitUnreadCount(recipient.id, await unreadCount(recipient.id));

  await trackSkipped(row, recipient, requested, channels);

  if (channels.includes('in_app')) {
    await trackDelivery(row.id, recipient.id, 'in_app', {
      status: 'delivered', provider: 'socket', sentAt: new Date(), deliveredAt: new Date(),
    });
  }

  if (channels.includes('email')) {
    if (!recipient.email) {
      await trackDelivery(row.id, recipient.id, 'email', { status: 'skipped', skipReason: 'no_address' });
    } else if (!rendered.emailSubject) {
      await trackDelivery(row.id, recipient.id, 'email', { status: 'skipped', skipReason: 'no_template' });
    } else {
      const tracked = await trackDelivery(row.id, recipient.id, 'email', { status: 'queued', provider: 'smtp' });
      enqueue(async () => {
        try {
          // Per-event template when one exists; the generic layout is the
          // fallback, so an event without a bespoke template still sends.
          const built = renderTemplate(rendered, row.metadata || {}, { locale });
          const result = await sendMail({
            to: recipient.email,
            subject: built.subject,
            html: built.html,
            text: built.text,
          });
          await markDelivery(tracked?.id, {
            status: result.delivered ? 'sent' : 'skipped',
            skipReason: result.delivered ? null : 'provider_not_configured',
            sentAt: new Date(),
            attempts: { increment: 1 },
          });
        } catch (err) {
          await markDelivery(tracked?.id, { status: 'failed', error: String(err.message).slice(0, 500), attempts: { increment: 1 } });
          throw err; // let the queue retry
        }
      }, { label: `email:${rendered.event}` });
    }
  }

  if (channels.includes('sms')) {
    if (!recipient.phone) {
      await trackDelivery(row.id, recipient.id, 'sms', { status: 'skipped', skipReason: 'no_address' });
    } else if (!rendered.smsBody) {
      await trackDelivery(row.id, recipient.id, 'sms', { status: 'skipped', skipReason: 'no_template' });
    } else {
      const tracked = await trackDelivery(row.id, recipient.id, 'sms', { status: 'queued', provider: 'twilio' });
      enqueue(async () => {
        try {
          const result = await sendSms({ to: recipient.phone, body: rendered.smsBody });
          await markDelivery(tracked?.id, {
            status: result.delivered ? 'sent' : 'skipped',
            skipReason: result.delivered ? null : 'provider_not_configured',
            sentAt: new Date(), attempts: { increment: 1 },
          });
        } catch (err) {
          await markDelivery(tracked?.id, { status: 'failed', error: String(err.message).slice(0, 500), attempts: { increment: 1 } });
          throw err;
        }
      }, { label: `sms:${rendered.event}` });
    }
  }

  if (channels.includes('push')) {
    const tracked = await trackDelivery(row.id, recipient.id, 'push', { status: 'queued', provider: 'fcm' });
    enqueue(async () => {
      const tokens = await prisma.pushToken.findMany({ where: { userId: recipient.id } });
      if (!tokens.length) {
        await markDelivery(tracked?.id, { status: 'skipped', skipReason: 'no_token' });
        return;
      }
      try {
        const result = await sendPush({
          tokens: tokens.map((t) => ({ token: t.token, platform: t.platform, provider: t.provider })),
          title: rendered.title,
          body: rendered.message,
          data: { notificationId: row.id, actionUrl: rendered.actionUrl || '', category: rendered.category },
        });
        // A token the provider rejects is dead — delete it rather than retrying
        // it forever on every future notification.
        for (const dead of result.invalidTokens || []) {
          await prisma.pushToken.deleteMany({ where: { token: dead } }).catch(() => {});
        }
        await markDelivery(tracked?.id, {
          status: result.delivered ? 'sent' : 'skipped',
          skipReason: result.delivered ? null : (result.reason || 'provider_not_configured'),
          sentAt: new Date(), attempts: { increment: 1 },
        });
      } catch (err) {
        await markDelivery(tracked?.id, { status: 'failed', error: String(err.message).slice(0, 500), attempts: { increment: 1 } });
        throw err;
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
/**
 * Canonical snake_case output.
 *
 * `locale` selects which stored rendering `title`/`body` carry. English is the
 * default, so a client that passes nothing sees exactly what it saw before this
 * existed. Rows created before the Malay columns have titleMy = NULL and fall
 * back to English rather than rendering blank — they cannot be reconstructed
 * (see the migration note), and a half-filled sentence would be worse than the
 * original English.
 *
 * `title_en` / `title_my` are exposed alongside so a client can hold both
 * without a second request.
 */
export function mapOut(n, { locale = 'en' } = {}) {
  const useMs = locale === 'ms' && n.titleMy;
  return {
    id: n.id,
    user_id: n.userId,
    role: n.role,
    title: useMs ? n.titleMy : n.title,
    body: useMs ? (n.bodyMy ?? n.body) : n.body,
    title_en: n.title,
    body_en: n.body,
    title_my: n.titleMy ?? null,
    body_my: n.bodyMy ?? null,
    message: useMs ? (n.bodyMy ?? n.body) : n.body, // legacy alias
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
