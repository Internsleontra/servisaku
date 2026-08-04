// ─────────────────────────────────────────────────────────────────────────────
// Rating analysis — turning a partner's own reviews into something actionable.
//
// TWO BOUNDARIES, both deliberate:
//
//   • Own rows only. A partner sees themes from reviews written about them, and
//     nothing about the people who wrote them. No reviewer name, no per-review
//     attribution beyond what they already see in the app.
//
//   • Themes, not verdicts. The output is "five of your seven low reviews
//     mention lateness" — a count the partner can check — not "you are
//     unreliable". A judgement they did not ask for is how a useful tool becomes
//     one they stop opening.
//
// A partner who thinks a review is unfair is NOT handled here. That goes to the
// `rating_dispute` tree and on to moderation (T&C 14.3), because whether a
// review stays up is not a thing the assistant gets to decide.
//
// Pure — no DB, no model. Themes are keyword-matched, which is crude but
// inspectable: a partner can see why a review was counted, and so can we.
// ─────────────────────────────────────────────────────────────────────────────

/** The rating at or below which a review is treated as a complaint. */
export const LOW_RATING = 3;

/** Reviews weighted toward the recent, matching how the displayed score works. */
export const RECENT_WINDOW = 30;

/**
 * Complaint themes.
 *
 * Keywords are lowercase and matched on word boundaries. Malay terms are
 * included because Malaysian reviews are routinely written in both languages,
 * often in the same sentence.
 */
export const THEMES = {
  punctuality: {
    label: { en: 'arriving late', ms: 'tiba lewat' },
    keywords: ['late', 'lateness', 'delay', 'delayed', 'waited', 'waiting', 'no show', 'never came', 'hours late', 'lambat', 'lewat', 'tunggu'],
    advice: {
      en: 'Update your status the moment you know you are running behind — customers rate the surprise, not the delay.',
      ms: 'Kemas kini status sebaik anda tahu anda lewat — pelanggan menilai kejutan itu, bukan kelewatan.',
    },
  },
  communication: {
    label: { en: 'communication', ms: 'komunikasi' },
    keywords: ['rude', 'did not explain', 'no explanation', 'unclear', 'never replied', 'no response', 'ignored', 'attitude', 'biadab', 'tak jelas', 'tak balas'],
    advice: {
      en: 'Say what you found and what you did before you leave — most "no explanation" reviews follow a job that went fine.',
      ms: 'Terangkan apa yang ditemui dan dilakukan sebelum beredar — kebanyakan aduan "tiada penjelasan" datang selepas kerja yang sebenarnya elok.',
    },
  },
  thoroughness: {
    label: { en: 'thoroughness', ms: 'ketelitian' },
    keywords: ['rushed', 'incomplete', 'missed', 'not thorough', 'half done', 'still dirty', 'left dirty', 'sloppy', 'tergesa', 'tak siap', 'tak bersih'],
    advice: {
      en: 'Walk the job with the customer before you pack up — it catches the miss while you can still fix it in two minutes.',
      ms: 'Periksa kerja bersama pelanggan sebelum berkemas — ia menangkap kesilapan semasa ia masih boleh dibaiki.',
    },
  },
  cleanliness: {
    label: { en: 'leaving mess', ms: 'meninggalkan sampah' },
    keywords: ['mess', 'messy', 'left rubbish', 'left waste', 'stains', 'dirty floor', 'water everywhere', 'debris', 'kotor', 'sampah'],
    advice: {
      en: 'Sheet the area before you start and take your waste with you — this is the easiest theme to eliminate entirely.',
      ms: 'Alas kawasan sebelum mula dan bawa sampah anda — ini tema paling mudah untuk dihapuskan sepenuhnya.',
    },
  },
  pricing: {
    label: { en: 'price clarity', ms: 'kejelasan harga' },
    keywords: ['overcharged', 'charged more', 'extra charge', 'unexpected cost', 'expensive', 'price changed', 'mahal', 'caj lebih'],
    advice: {
      en: 'Quote additional work in the app and get approval before doing it — an approved price is never a surprise.',
      ms: 'Berikan sebut harga kerja tambahan dalam aplikasi dan dapatkan kelulusan sebelum membuatnya.',
    },
  },
  workmanship: {
    label: { en: 'the work not lasting', ms: 'kerja tidak tahan lama' },
    keywords: ['broke again', 'came back', 'still leaking', 'not fixed', 'same problem', 'stopped working', 'rosak semula', 'tak baik'],
    advice: {
      en: 'Test under load with the customer watching before you close the job — a fault that returns costs a revisit and the rating.',
      ms: 'Uji di bawah beban di hadapan pelanggan sebelum menutup kerja.',
    },
  },
};

export const THEME_IDS = Object.keys(THEMES);

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Which themes does one review mention? A review can raise more than one. */
export function themesIn(text) {
  const t = norm(text);
  if (!t) return [];
  return THEME_IDS.filter((id) => THEMES[id].keywords.some((k) => t.includes(norm(k))));
}

/**
 * Analyse a partner's reviews.
 *
 * @param {Array} reviews  [{ rating, comment, createdAt }] — the partner's own
 * @param {object} [opts]  { locale, topN }
 * @returns {{ total, average, lowCount, themes, unthemed, advice, trend }}
 */
export function analyseReviews(reviews = [], { locale = 'en', topN = 2 } = {}) {
  const rated = reviews.filter((r) => Number.isFinite(r.rating));
  const total = rated.length;

  if (total === 0) {
    return { total: 0, average: null, lowCount: 0, themes: [], unthemed: 0, advice: [], trend: null };
  }

  const average = round1(rated.reduce((s, r) => s + r.rating, 0) / total);
  const low = rated.filter((r) => r.rating <= LOW_RATING);

  const counts = new Map();
  let unthemed = 0;
  for (const r of low) {
    const found = themesIn(r.comment);
    if (found.length === 0) { unthemed += 1; continue; }
    for (const id of found) counts.set(id, (counts.get(id) || 0) + 1);
  }

  const themes = [...counts.entries()]
    .map(([id, count]) => ({
      id, count, label: THEMES[id].label[locale] || THEMES[id].label.en,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    total,
    average,
    lowCount: low.length,
    themes,
    unthemed,
    advice: themes.slice(0, topN).map((t) => THEMES[t.id].advice[locale] || THEMES[t.id].advice.en),
    trend: trendOf(rated),
  };
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Recent versus older average.
 *
 * The displayed rating weights recent jobs, so it recovers faster than it falls
 * — which is the single most reassuring true thing to tell a partner whose score
 * just dropped.
 */
export function trendOf(reviews) {
  const sorted = [...reviews]
    .filter((r) => r.createdAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (sorted.length < 6) return null;

  const half = Math.min(RECENT_WINDOW, Math.floor(sorted.length / 2));
  const recent = sorted.slice(0, half);
  const older = sorted.slice(half);
  const avg = (list) => round1(list.reduce((s, r) => s + r.rating, 0) / list.length);

  const recentAvg = avg(recent);
  const olderAvg = avg(older);
  const delta = round1(recentAvg - olderAvg);

  return {
    recent: recentAvg,
    older: olderAvg,
    delta,
    direction: delta > 0.1 ? 'improving' : (delta < -0.1 ? 'declining' : 'steady'),
  };
}

/**
 * The message shown to the partner.
 *
 * Counts first, advice second, and never a verdict on them as a professional.
 */
export function summaryText(analysis, locale = 'en') {
  if (!analysis || analysis.total === 0) {
    return locale === 'ms'
      ? 'Anda belum mempunyai ulasan lagi — ia akan mula muncul selepas beberapa kerja pertama anda.'
      : 'You do not have any reviews yet — they start appearing after your first few jobs.';
  }

  const lines = [];
  lines.push(locale === 'ms'
    ? `Anda pada ${analysis.average} daripada ${analysis.total} ulasan.`
    : `You are at ${analysis.average} across ${analysis.total} reviews.`);

  if (analysis.themes.length > 0) {
    const [first] = analysis.themes;
    lines.push(locale === 'ms'
      ? `Daripada ${analysis.lowCount} ulasan rendah, ${first.count} menyebut ${first.label}.`
      : `Of your ${analysis.lowCount} low reviews, ${first.count} mention ${first.label}.`);
    lines.push(analysis.advice[0]);
  } else if (analysis.lowCount > 0) {
    lines.push(locale === 'ms'
      ? 'Ulasan rendah anda tidak menunjukkan corak yang jelas.'
      : 'Your low reviews do not show a clear pattern.');
  }

  if (analysis.trend?.direction === 'declining') {
    lines.push(locale === 'ms'
      ? 'Penilaian memberatkan kerja terkini, jadi ia pulih lebih cepat daripada jatuh.'
      : 'Ratings weight recent jobs, so this recovers faster than it fell.');
  }

  return lines.filter(Boolean).join(' ');
}
