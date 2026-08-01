// ─────────────────────────────────────────────────────────────────────────────
// Chatbot knowledge base.
//
// Authored in code rather than the database, for the same reason
// notifications/catalog.js is: it is reviewable in a PR and deploys atomically
// with the behaviour it describes. Admin-editable HelpArticle rows (Feature 8)
// are layered in as a second retrieval source below.
//
// Every answer the bot gives must be grounded in an entry here or in a help
// article. That is what keeps it from inventing a refund policy.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from '../../db.js';

// Facts are stated once, here, and match the code that implements them —
// refunds/policy.js, damageClaims/sla.js, wallet/freeze.js. When a rule changes,
// this file changes with it.
export const CORPUS = [
  {
    key: 'booking_how_to',
    audience: 'consumer',
    topic: 'booking',
    q: ['how do i book', 'book a service', 'make a booking', 'tempah'],
    a: `Browse the categories on the Explore page and pick the service you need. Answer a few questions about the job so we can price it accurately, choose a date and time, then confirm. You'll see the full price — including SST — before paying. A verified professional is then matched to your booking and you can track their arrival in the app.`,
  },
  {
    key: 'payment_methods',
    audience: 'consumer',
    topic: 'payment',
    q: ['how can i pay', 'payment methods', 'pay by card', 'fpx', 'duitnow', 'cash'],
    a: `You can pay online by FPX, DuitNow, credit or debit card, or an e-wallet — or choose Cash on Service and pay your professional directly when the job is done. Online payments are held securely in escrow and released to the professional only after the service is complete. For cash, your professional records the payment in the app and you get a receipt straight away.`,
  },
  {
    key: 'refund_policy',
    audience: 'consumer',
    topic: 'refund',
    q: ['refund', 'cancel my booking', 'get my money back', 'cancellation'],
    a: `How much you get back depends on the notice you give: more than 48 hours before the booking is a full refund, 4 to 48 hours is 75%, less than 4 hours is 50%, and 50% once a professional has already accepted. If your professional doesn't turn up you're refunded in full regardless of notice. Cancel from your booking screen — you'll see the exact amount before confirming, and eligible refunds are processed automatically.`,
  },
  {
    key: 'refund_timing',
    audience: 'consumer',
    topic: 'refund',
    q: ['how long does a refund take', 'when will i get my refund', 'refund not received'],
    a: `Eligible cancellation refunds are processed automatically. Others are reviewed within 3 working days. Once processed, funds usually take 3–10 working days to appear, depending on your bank or card issuer. You can track the status on the booking itself.`,
  },
  {
    key: 'sst',
    audience: 'consumer',
    topic: 'payment',
    q: ['sst', 'tax', 'service tax', 'invoice'],
    a: `Service Tax (SST) is charged on taxable services at the rate in force when you booked. Your tax invoice itemises the service amount and the SST separately and carries our SST registration number — you can view and download it from your booking at any time. If you're refunded, we issue a credit note that reverses the tax proportionally.`,
  },
  {
    key: 'damage',
    audience: 'consumer',
    topic: 'damage',
    q: ['damaged', 'broke', 'damage claim', 'compensation', 'rosak'],
    a: `File a damage claim from your booking within 48 hours of the job finishing. You'll need at least one photo of the damage, a description of what happened, and the repair or replacement cost. We acknowledge every claim within 24 hours, give the professional 72 hours to respond, and aim to complete the investigation within 7 days. If approved, compensation is arranged within 14 days.`,
  },
  {
    key: 'verification',
    audience: 'consumer',
    topic: 'trust',
    q: ['are professionals verified', 'background check', 'is it safe', 'trust'],
    a: `Every partner completes identity verification (MyKad), submits proof of their skills, and is approved by our team before accepting any booking. Partners are also verified per service — someone approved for aircon servicing cannot accept a plumbing job.`,
  },
  {
    key: 'reschedule',
    audience: 'consumer',
    topic: 'booking',
    q: ['reschedule', 'change the date', 'move my booking', 'different time'],
    a: `You can change the date or time from your booking screen while the job hasn't started yet. Both you and your professional are notified of the change. If you need to move a booking that has already started, raise a support ticket instead.`,
  },
  // ── Partner-facing ─────────────────────────────────────────────────────────
  {
    key: 'partner_payouts',
    audience: 'partner',
    topic: 'earnings',
    q: ['when do i get paid', 'payout', 'earnings', 'bayaran'],
    a: `Earnings from online bookings move into your wallet once the job is complete and escrow is released. Payouts run weekly and funds usually reach your bank within 1–3 working days. You need verified bank details on file and a balance above the minimum payout to be included in a run. Your Wallet shows available balance, pending earnings and payout history.`,
  },
  {
    key: 'partner_commission',
    audience: 'partner',
    topic: 'commission',
    q: ['commission', 'cash job', 'how much do you take', 'outstanding balance', 'komisen'],
    a: `On a cash job you collect the full fare from the customer, so the ServisAku commission becomes an amount you owe back. Record the cash in the app as soon as the job is done — the commission is added to your outstanding balance and settled on a schedule, weekly by default. Settle from your Wallet, either online or from your available balance.`,
  },
  {
    key: 'partner_frozen',
    audience: 'partner',
    topic: 'commission',
    q: ['no new jobs', 'account paused', 'not receiving jobs', 'frozen', 'overdue'],
    a: `If a commission settlement goes unpaid past its due date you'll get reminders, and after 7 days new job offers pause until it's cleared. After 14 days payouts are also held. Jobs you've already accepted are never affected. A small outstanding balance within your credit limit doesn't trigger any of this — check your Wallet for the exact amount and due date.`,
  },
  {
    key: 'partner_bank',
    audience: 'partner',
    topic: 'earnings',
    q: ['bank details', 'change my bank', 'bank not verified'],
    a: `Add or update your bank details from the Bank Details screen. Any change resets verification — our team re-checks the account name against your verified identity before the next payout run, so update well ahead of a payout rather than on the day.`,
  },
];

const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'my', 'i', 'to', 'do', 'how', 'can', 'what', 'when', 'and', 'for', 'of', 'in', 'it', 'me', 'you']);

const tokenize = (s) => String(s || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/)
  .filter((w) => w.length > 1 && !STOPWORDS.has(w));

/**
 * Score an entry against a query. Deliberately simple keyword overlap — with a
 * corpus this size, an embedding index would be more machinery than signal, and
 * a wrong retrieval here is more damaging than a slightly worse ranking.
 */
function score(entry, queryTokens) {
  const haystack = tokenize([...entry.q, entry.a, entry.topic].join(' '));
  const set = new Set(haystack);
  let hits = 0;
  for (const t of queryTokens) if (set.has(t)) hits += 1;
  // Phrase matches in the question list are worth more than incidental
  // overlap with the answer body.
  const phraseBonus = entry.q.some((p) => String(p).length > 4
    && queryTokens.join(' ').includes(p)) ? 3 : 0;
  return hits + phraseBonus;
}

/**
 * Retrieve the most relevant entries for a query.
 *
 * @param {string} query
 * @param {object} [opts] { audience, limit }
 * @returns {Promise<Array<{ key, topic, a, source, score }>>}
 */
export async function retrieve(query, { audience = 'consumer', limit = 4 } = {}) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored = CORPUS
    .filter((e) => e.audience === audience || e.audience === 'all')
    .map((e) => ({ key: e.key, topic: e.topic, a: e.a, source: 'corpus', score: score(e, tokens) }))
    .filter((e) => e.score > 0);

  // Published help articles are a second source, so admin-authored content
  // reaches the bot without a deploy.
  try {
    const articles = await prisma.helpArticle.findMany({
      where: {
        isPublished: true,
        OR: [{ audience }, { audience: 'all' }],
      },
      take: 50,
    });
    for (const a of articles) {
      const entry = { q: [a.title], a: a.bodyMd, topic: a.slug };
      const s = score(entry, tokens);
      if (s > 0) scored.push({ key: a.slug, topic: a.slug, a: a.bodyMd.slice(0, 1500), source: 'help_article', score: s });
    }
  } catch {
    // A help-centre outage must not take the bot down — the code corpus stands alone.
  }

  return scored.sort((x, y) => y.score - x.score).slice(0, limit);
}

/** The FAQ list served publicly and used to seed the Help page. */
export function publicFaqs(audience = 'consumer') {
  return CORPUS
    .filter((e) => e.audience === audience || e.audience === 'all')
    .map((e) => ({ key: e.key, topic: e.topic, question: e.q[0], answer: e.a }));
}
