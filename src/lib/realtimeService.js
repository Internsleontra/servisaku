// FixMate Realtime Service — Base44 entity subscriptions + Geolocation
import { servisaku } from '@/api/servisakuClient';

// ─── Presence ──────────────────────────────────────────────────────────────
let heartbeatTimer = null;

export async function goOnline(user) {
  const existing = await servisaku.entities.PartnerLocation.filter({ partner_email: user.email });
  if (existing.length > 0) {
    await servisaku.entities.PartnerLocation.update(existing[0].id, {
      is_online: true, last_seen: new Date().toISOString(),
      partner_name: user.full_name,
    });
  } else {
    await servisaku.entities.PartnerLocation.create({
      partner_email: user.email, partner_name: user.full_name,
      is_online: true, is_on_job: false, last_seen: new Date().toISOString(),
    });
  }
  startHeartbeat(user.email);
}

export async function goOffline(email) {
  stopHeartbeat();
  const existing = await servisaku.entities.PartnerLocation.filter({ partner_email: email });
  if (existing.length > 0) {
    await servisaku.entities.PartnerLocation.update(existing[0].id, {
      is_online: false, last_seen: new Date().toISOString(),
    });
  }
}

function startHeartbeat(email) {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    const existing = await servisaku.entities.PartnerLocation.filter({ partner_email: email });
    if (existing.length > 0) {
      await servisaku.entities.PartnerLocation.update(existing[0].id, {
        last_seen: new Date().toISOString(),
      });
    }
  }, 30000);
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

// ─── GPS Tracking ──────────────────────────────────────────────────────────
let geoWatchId = null;
let locationRecordId = null;

export function startGPSTracking(email, bookingId, onUpdate) {
  if (!navigator.geolocation) return;

  const pushLocation = async (pos) => {
    const { latitude, longitude, heading, speed, accuracy } = pos.coords;
    const payload = {
      partner_email: email, booking_id: bookingId,
      latitude, longitude,
      heading: heading || 0,
      speed: speed ? Math.round(speed * 3.6) : 0,
      accuracy: Math.round(accuracy || 0),
      is_online: true, is_on_job: !!bookingId,
      last_seen: new Date().toISOString(),
    };
    if (locationRecordId) {
      await servisaku.entities.PartnerLocation.update(locationRecordId, payload);
    } else {
      const existing = await servisaku.entities.PartnerLocation.filter({ partner_email: email });
      if (existing.length > 0) {
        locationRecordId = existing[0].id;
        await servisaku.entities.PartnerLocation.update(locationRecordId, payload);
      } else {
        const created = await servisaku.entities.PartnerLocation.create(payload);
        locationRecordId = created.id;
      }
    }
    onUpdate?.({ latitude, longitude, heading, speed });
  };

  geoWatchId = navigator.geolocation.watchPosition(pushLocation, null, {
    enableHighAccuracy: true, maximumAge: 15000, timeout: 20000,
  });
}

export function stopGPSTracking() {
  if (geoWatchId !== null) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
  }
}

// ─── ETA Calculation ───────────────────────────────────────────────────────
export function calcETA(partnerLat, partnerLng, destLat, destLng, speedKmh = 30) {
  const R = 6371;
  const dLat = (destLat - partnerLat) * Math.PI / 180;
  const dLng = (destLng - partnerLng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(partnerLat * Math.PI / 180) * Math.cos(destLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(1, Math.round((dist / speedKmh) * 60));
}

// ─── System Message ────────────────────────────────────────────────────────
export async function sendSystemMessage(bookingId, text) {
  await servisaku.entities.ChatMessage.create({
    booking_id: bookingId,
    sender_email: 'system@servisaku.my',
    sender_name: 'ServisAku',
    sender_role: 'admin',
    message: text,
    message_type: 'system',
  });
}

// ─── Booking Status Change + Notification ─────────────────────────────────
export async function changeBookingStatus(bookingId, newStatus, extra = {}) {
  await servisaku.entities.Booking.update(bookingId, { status: newStatus, ...extra });
}

// ─── KL Bounding Box (for demo GPS simulation) ─────────────────────────────
export const KL_CENTER = { lat: 3.1390, lng: 101.6869 };

export function simulateMovement(baseLat, baseLng, step = 0) {
  const jitter = 0.002;
  return {
    lat: baseLat + Math.sin(step * 0.5) * jitter + (Math.random() - 0.5) * 0.0005,
    lng: baseLng + Math.cos(step * 0.5) * jitter + (Math.random() - 0.5) * 0.0005,
  };
}