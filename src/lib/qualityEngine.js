// FixMate Quality Engine — scoring, badges, automated triggers
import { servisaku } from '@/api/servisakuClient';

// ─── Badge Thresholds ──────────────────────────────────────────────────────
export const BADGE_TIERS = {
  gold:   { min: 4.7, label: 'Gold',   emoji: '🥇', color: 'text-amber-500',  bg: 'bg-amber-50  border-amber-200' },
  silver: { min: 4.3, label: 'Silver', emoji: '🥈', color: 'text-slate-500',  bg: 'bg-raised  border-hairline' },
  bronze: { min: 3.8, label: 'Bronze', emoji: '🥉', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  none:   { min: 0,   label: null,     emoji: '',   color: '',                bg: '' },
};

export function getBadge(avgRating) {
  if (avgRating >= 4.7) return BADGE_TIERS.gold;
  if (avgRating >= 4.3) return BADGE_TIERS.silver;
  if (avgRating >= 3.8) return BADGE_TIERS.bronze;
  return BADGE_TIERS.none;
}

// ─── Weighted Rating (last 50 reviews count 2×) ────────────────────────────
export function calcWeightedRating(reviews) {
  if (!reviews.length) return 0;
  const sorted = [...reviews].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  let sumW = 0, sum = 0;
  sorted.forEach((r, i) => {
    const w = i < 50 ? 2 : 1;
    sum += r.rating * w;
    sumW += w;
  });
  return sumW ? +(sum / sumW).toFixed(2) : 0;
}

// ─── Reliability % ────────────────────────────────────────────────────────
export function calcReliability(completedJobs, totalJobs, cancellations, disputes) {
  if (!totalJobs) return 100;
  const penaltyRate = (cancellations * 2 + disputes * 3) / totalJobs;
  return Math.max(0, Math.round((1 - penaltyRate) * 100));
}

// ─── Consumer Trust Score ─────────────────────────────────────────────────
export function calcConsumerTrust(partnerReviews) {
  if (!partnerReviews.length) return 100;
  const avg = partnerReviews.reduce((s, r) => s + r.rating, 0) / partnerReviews.length;
  const noShows = partnerReviews.filter(r => r.tags?.includes('No Show')).length;
  return Math.max(0, Math.round(avg * 20 - noShows * 10));
}

// ─── Auto Quality Ticket ──────────────────────────────────────────────────
export async function checkAndCreateTicket(review, existingTickets) {
  const { partner_email, partner_name, rating, booking_id, id: review_id } = review;

  if (rating < 3) {
    const recent = existingTickets.filter(t =>
      t.partner_email === partner_email &&
      t.trigger_type === 'low_rating' &&
      new Date(t.created_date) > new Date(Date.now() - 30 * 86400000)
    );
    const severity = recent.length >= 3 ? 'critical' : recent.length >= 1 ? 'high' : 'medium';
    await servisaku.entities.QualityTicket.create({
      partner_email, partner_name: partner_name || '',
      trigger_type: 'low_rating', booking_id, review_id,
      severity,
      description: `${rating}★ review received. ${recent.length} similar tickets in last 30 days.`,
    });
    // Send warning notification
    await servisaku.entities.Notification.create({
      user_email: partner_email,
      title: severity === 'critical' ? '⚠️ Urgent: Quality Review Required' : 'Quality Alert',
      body: `You received a ${rating}-star review. Our quality team will follow up.`,
      type: 'system', channel: 'in_app',
    });
  }
}

// ─── Tag Frequency Analysis ───────────────────────────────────────────────
export function analyzeTagFrequency(reviews) {
  const freq = {};
  reviews.forEach(r => r.tags?.forEach(tag => { freq[tag] = (freq[tag] || 0) + 1; }));
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
}

// ─── Rating Distribution ──────────────────────────────────────────────────
export function getRatingDistribution(reviews) {
  const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach(r => { const s = Math.round(r.rating); dist[s] = (dist[s] || 0) + 1; });
  return dist;
}

// ─── Fraud Detection Heuristics ───────────────────────────────────────────
export function detectSuspiciousReviews(reviews) {
  const flags = [];
  // Multiple reviews from same consumer for same partner in short window
  const byConsumer = {};
  reviews.forEach(r => {
    const key = `${r.consumer_email}_${r.partner_email}`;
    byConsumer[key] = (byConsumer[key] || []);
    byConsumer[key].push(r);
  });
  Object.entries(byConsumer).forEach(([key, rs]) => {
    if (rs.length > 2) flags.push({ type: 'duplicate_consumer', ids: rs.map(r => r.id), note: 'Same consumer reviewed same partner 3+ times' });
  });
  // Sudden rating spike (avg drops/rises >1 star in 7 days)
  const sorted = [...reviews].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
  if (sorted.length >= 10) {
    const recent7 = sorted.filter(r => new Date(r.created_date) > new Date(Date.now() - 7 * 86400000));
    const older = sorted.filter(r => new Date(r.created_date) <= new Date(Date.now() - 7 * 86400000));
    if (recent7.length >= 3 && older.length >= 3) {
      const recentAvg = recent7.reduce((s, r) => s + r.rating, 0) / recent7.length;
      const olderAvg = older.reduce((s, r) => s + r.rating, 0) / older.length;
      if (Math.abs(recentAvg - olderAvg) > 1.5) {
        flags.push({ type: 'rating_spike', note: `Avg changed from ${olderAvg.toFixed(1)} to ${recentAvg.toFixed(1)} in 7 days` });
      }
    }
  }
  return flags;
}

export const CONSUMER_REVIEW_TAGS = [
  'Professional', 'On Time', 'Friendly', 'High Quality', 'Clean Work', 'Good Communication',
];
export const PARTNER_REVIEW_TAGS = [
  'Responsive', 'Respectful', 'Easy Access', 'Difficult Customer', 'No Show',
];
export const NEGATIVE_TAGS = ['Difficult Customer', 'No Show'];