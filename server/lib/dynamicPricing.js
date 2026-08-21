// ════════════════════════════════════════════════════════════════════════════
// Dynamic booking-engine pricing — pure, config-driven, framework-free.
//
// One function turns a service's Step-A question set + the customer's answers
// into an itemised price. The arithmetic is derived ENTIRELY from configuration
// (questions, options, globalConfig); there is no service-specific code here, so
// adding service #72 is a JSON/seed change with zero edits to this file.
//
// This is intentionally separate from server/lib/pricing.js (the legacy
// package/add-on engine, 20% platform fee). The dynamic engine follows the
// booking-flows.md formula: flat RM5 platform fee + configurable surcharges/SST.
//
// Pure + isomorphic: no DB, no Prisma, no Express — so it runs identically in
// unit tests, on the server, and (later) in the React/React-Native client.
//
//   serviceTotal = base(pricingType) + Σ question contributions
//   subtotal     = serviceTotal + visitFee + surcharges
//   bookingFee   = globalConfig.bookingFee (flat, CHARGED TO THE CUSTOMER)
//   tax          = sstEnabled ? (subtotal + bookingFee) × sstRate : 0
//   total        = subtotal + bookingFee + tax − promoDiscount
//
// The booking fee is NOT the partner commission. Partner commission is
// server/lib/payments/commission.js `split()` and is DEDUCTED from the partner.
// ════════════════════════════════════════════════════════════════════════════

/** Supported pricing strategies (Service.pricingType). */
export const PRICING_TYPES = Object.freeze([
  'FIXED', 'PER_UNIT', 'TIERED', 'PER_SQFT', 'PER_HOUR', 'DIAGNOSTIC',
  'BASE_PLUS_ADDONS', 'TIER_QUANTITY',
]);

/** Supported Step-A question widgets (BookingQuestion.type). */
export const QUESTION_TYPES = Object.freeze([
  'TIER_SELECT', 'SINGLE_SELECT', 'MULTI_SELECT', 'QUANTITY',
  'TIER_QUANTITY', 'AREA_INPUT', 'HOURS_INPUT', 'INFO',
]);

/** Platform-wide defaults (mirror servisaku-services-config.json → globalConfig). */
export const DEFAULT_GLOBAL_CONFIG = Object.freeze({
  // Flat fee added to the CUSTOMER's bill. Not a partner commission.
  bookingFee: 5,
  // DEPRECATED alias — servisaku-services-config.json still ships `platformFee`.
  platformFee: 5,
  afterHoursSurcharge: 30,
  urgentSurcharge: 30,
  outstationSurcharge: 25,
  sstRate: 0.08,
  sstEnabled: false,
  visitFeeWaivedIfQuoteAccepted: true,
});

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

function findOption(question, optionId) {
  return (question.options || []).find((o) => o.id === optionId);
}

// Per-unit modifiers ("+RM40/unit") multiply by the unit count. The count comes
// from the TIER_QUANTITY question(s) if present (AC units, sofa pieces, doors),
// otherwise from the plain QUANTITY question(s) (bathrooms, taps, toilets).
function perUnitBasisFor(questions, answers) {
  const tierQ = questions.filter((q) => q.type === 'TIER_QUANTITY');
  if (tierQ.length) {
    return tierQ.reduce((sum, q) => {
      const obj = answers[q.id] || {};
      return sum + Object.values(obj).reduce((s, qty) => s + num(qty), 0);
    }, 0);
  }
  return questions
    .filter((q) => q.type === 'QUANTITY')
    .reduce((sum, q) => sum + num(answers[q.id]), 0);
}

function areaValueFor(questions, answers) {
  const areaQ = questions.find((q) => q.type === 'AREA_INPUT');
  return areaQ ? num(answers[areaQ.id]) : 0;
}

/**
 * Compute the authoritative price for a dynamic-engine service.
 *
 * @param {object}   service             normalized service (slug, pricingType, basePrice,
 *                                        visitFee, sstEnabled, questions[])
 * @param {object}   answers             { [questionId]: value }
 *                                          TIER_SELECT/SINGLE_SELECT → optionId
 *                                          MULTI_SELECT → optionId[]
 *                                          QUANTITY/AREA_INPUT/HOURS_INPUT → number
 *                                          TIER_QUANTITY → { optionId: qty }
 * @param {object}  [context]            { globalConfig, afterHours, urgent, sstEnabled, promoDiscount }
 * @returns {object} full breakdown (snapshot this onto the booking at confirmation)
 */
/* ── Line-item labels ────────────────────────────────────────────────────────
   The engine stays pure: Malay travels with the data (labelMy/nameMy, supplied
   by toEngineService) and the seven engine-owned labels live in this map. Only
   the STRINGS are localized — every number below is computed identically for
   both languages. */
const ENGINE_LABELS = {
  en: {
    base: 'Base price',
    visitFee: 'Visit / call-out fee',
    afterHours: 'After-hours surcharge',
    urgent: 'Urgent (same-day) surcharge',
    bookingFee: 'Booking fee',
    sst: (pct) => `SST (${pct}%)`,
    promo: 'Promo discount',
  },
  ms: {
    base: 'Harga asas',
    visitFee: 'Yuran lawatan / panggilan keluar',
    afterHours: 'Caj tambahan luar waktu',
    urgent: 'Caj tambahan segera (hari sama)',
    bookingFee: 'Yuran tempahan',
    sst: (pct) => `SST (${pct}%)`,
    promo: 'Diskaun promosi',
  },
};

/* Customer-visible validation copy. The field name inside each message is the
   LOCALIZED question label, so a Malay error never says "Home size" — it says
   "Saiz rumah". Codes stay English and stable; only the sentence is localized. */
const VALIDATION_MESSAGES = {
  en: {
    required: (label) => `${label} is required`,
    invalid_option: (label, value) => `${label}: invalid option "${value}"`,
    invalid_tier: (label, value) => `${label}: invalid tier "${value}"`,
    not_a_number: (label) => `${label}: must be a number`,
    below_min: (label, min) => `${label}: minimum is ${min}`,
    above_max: (label, max) => `${label}: maximum is ${max}`,
  },
  ms: {
    required: (label) => `${label} diperlukan`,
    invalid_option: (label, value) => `${label}: pilihan "${value}" tidak sah`,
    invalid_tier: (label, value) => `${label}: tahap "${value}" tidak sah`,
    not_a_number: (label) => `${label}: mesti berupa nombor`,
    below_min: (label, min) => `${label}: minimum ialah ${min}`,
    above_max: (label, max) => `${label}: maksimum ialah ${max}`,
  },
};

/** Pick the localized label for a question/option/service, falling back to
 *  English when the Malay column is empty. Never returns undefined. */
const pick = (node, locale) => (
  locale === 'ms' && node?.labelMy ? node.labelMy : (node?.label ?? '')
);

export function computePrice(service, answers = {}, context = {}) {
  if (!service || !PRICING_TYPES.includes(service.pricingType)) {
    throw new Error(`computePrice: unknown pricingType "${service?.pricingType}"`);
  }
  const cfg = { ...DEFAULT_GLOBAL_CONFIG, ...(context.globalConfig || {}) };
  // Unknown/absent locale falls back to English — existing clients are unaffected.
  const locale = context.locale === 'ms' ? 'ms' : 'en';
  const L = ENGINE_LABELS[locale];
  const questions = service.questions || [];
  const perUnitBasis = perUnitBasisFor(questions, answers);
  const area = areaValueFor(questions, answers);
  const lines = [];

  // Base. DIAGNOSTIC's "base" is the call-out, billed as the visit fee — so its
  // serviceTotal starts at 0 (the on-site quote is appended later, see API).
  let serviceTotal = service.pricingType === 'DIAGNOSTIC' ? 0 : num(service.basePrice);
  if (serviceTotal !== 0) {
    lines.push({ questionId: null, label: (locale === 'ms' && service.nameMy) || service.name || L.base, type: 'BASE', amount: round2(serviceTotal) });
  }

  for (const q of questions) {
    const answer = answers[q.id];
    const qcfg = q.config || {};

    switch (q.type) {
      case 'INFO':
        break;

      case 'TIER_SELECT':
      case 'SINGLE_SELECT': {
        if (answer == null || answer === '') break;
        const opt = findOption(q, answer);
        if (!opt) break;
        let amount;
        if (qcfg.perSqft) amount = num(opt.priceModifierPerSqft) * area;
        else if (qcfg.perUnit) amount = num(opt.priceModifier) * perUnitBasis;
        else amount = num(opt.priceModifier);
        amount = round2(amount);
        serviceTotal += amount;
        lines.push({
          questionId: q.id, label: pick(q, locale), type: q.type, optionId: opt.id, optionLabel: pick(opt, locale),
          ...(qcfg.perSqft ? { perSqft: num(opt.priceModifierPerSqft), area } : {}),
          ...(qcfg.perUnit ? { perUnit: num(opt.priceModifier), units: perUnitBasis } : {}),
          amount,
        });
        break;
      }

      case 'MULTI_SELECT': {
        const selected = Array.isArray(answer) ? answer : (answer ? [answer] : []);
        for (const id of selected) {
          const opt = findOption(q, id);
          if (!opt) continue;
          let amount;
          if (qcfg.perSqft) amount = num(opt.priceModifierPerSqft) * area;
          else if (qcfg.perUnit) amount = num(opt.priceModifier) * perUnitBasis;
          else amount = num(opt.priceModifier);
          amount = round2(amount);
          serviceTotal += amount;
          lines.push({ questionId: q.id, label: pick(q, locale), type: q.type, optionId: opt.id, optionLabel: pick(opt, locale), amount });
        }
        break;
      }

      case 'QUANTITY': {
        const qty = num(answer);
        if (qty <= 0) break;
        const unit = num(qcfg.pricePerUnit);
        const amount = round2(unit * qty);
        if (amount === 0 && unit === 0) break; // e.g. diagnostic "units affected" (pricePerUnit 0)
        serviceTotal += amount;
        lines.push({ questionId: q.id, label: pick(q, locale), type: q.type, qty, unitPrice: unit, amount });
        break;
      }

      case 'TIER_QUANTITY': {
        const obj = (answer && typeof answer === 'object') ? answer : {};
        for (const opt of q.options || []) {
          const qty = num(obj[opt.id]);
          if (qty <= 0) continue;
          const unit = num(opt.unitPrice);
          const amount = round2(unit * qty);
          serviceTotal += amount;
          lines.push({ questionId: q.id, label: `${pick(q, locale)} — ${pick(opt, locale)}`, type: q.type, optionId: opt.id, qty, unitPrice: unit, amount });
        }
        break;
      }

      case 'AREA_INPUT': {
        const rate = num(qcfg.ratePerSqft, num(service.rate));
        const amount = round2(rate * area);
        serviceTotal += amount;
        lines.push({ questionId: q.id, label: pick(q, locale), type: q.type, area, ratePerSqft: rate, amount });
        break;
      }

      case 'HOURS_INPUT': {
        const minH = num(qcfg.min, service.minQty || 1);
        const hours = Math.max(num(answer), minH);
        const rate = num(qcfg.ratePerHour, num(service.rate));
        const amount = round2(rate * hours);
        serviceTotal += amount;
        lines.push({ questionId: q.id, label: pick(q, locale), type: q.type, hours, ratePerHour: rate, amount });
        break;
      }

      default:
        throw new Error(`computePrice: unsupported question type "${q.type}"`);
    }
  }

  serviceTotal = round2(serviceTotal);
  const visitFee = round2(service.visitFee);

  const afterHours = context.afterHours ? num(cfg.afterHoursSurcharge) : 0;
  const urgent = context.urgent ? num(cfg.urgentSurcharge) : 0;
  const surchargeTotal = round2(afterHours + urgent);

  const subtotal = round2(serviceTotal + visitFee + surchargeTotal);
  // CUSTOMER-FACING booking fee — added to what the customer pays. This is NOT
  // ServisAku's commission on the partner; that is computed by
  // server/lib/payments/commission.js `split()` and is deducted from the
  // partner's earnings. The two were previously both called "platform fee",
  // and the booking fee was written into EscrowLedger as if it were the
  // commission — recording a RM5 cut on a RM285 job instead of RM57.
  const bookingFee = num(cfg.bookingFee ?? cfg.platformFee);

  const sstEnabled = context.sstEnabled ?? service.sstEnabled ?? cfg.sstEnabled ?? false;
  const tax = sstEnabled ? round2((subtotal + bookingFee) * num(cfg.sstRate)) : 0;

  const promoDiscount = round2(context.promoDiscount);
  const total = round2(subtotal + bookingFee + tax - promoDiscount);

  // Fee/surcharge lines complete the breakdown shown on Step F.
  const breakdown = [...lines];
  if (visitFee) breakdown.push({ questionId: null, label: L.visitFee, type: 'VISIT_FEE', amount: visitFee });
  if (afterHours) breakdown.push({ questionId: null, label: L.afterHours, type: 'SURCHARGE', amount: afterHours });
  if (urgent) breakdown.push({ questionId: null, label: L.urgent, type: 'SURCHARGE', amount: urgent });
  breakdown.push({ questionId: null, label: L.bookingFee, type: 'BOOKING_FEE', amount: bookingFee });
  if (tax) breakdown.push({ questionId: null, label: L.sst((num(cfg.sstRate) * 100).toFixed(0)), type: 'TAX', amount: tax });
  if (promoDiscount) breakdown.push({ questionId: null, label: L.promo, type: 'DISCOUNT', amount: -promoDiscount });

  return {
    currency: cfg.currency || 'MYR',
    pricingType: service.pricingType,
    serviceTotal,
    visitFee,
    surcharges: { afterHours, urgent, total: surchargeTotal },
    subtotal,
    bookingFee,
    // DEPRECATED alias. Bookings created before this rename carry `platformFee`
    // in their persisted priceBreakdown snapshot, and tax/invoice.js reads that
    // snapshot back for historical invoices — so the key has to keep existing.
    // Read `bookingFee` in new code; never use either as a partner commission.
    platformFee: bookingFee,
    sstEnabled: !!sstEnabled,
    tax,
    promoDiscount,
    total,
    lines,
    breakdown,
  };
}

/**
 * Validate answers against a service's questions. Returns { ok, errors[] }.
 * Enforces required presence and option membership; safe to run before compute.
 */
/**
 * Validate a set of answers against a service's question schema.
 *
 * Returns `errors` (localized, customer-facing sentences — the existing
 * contract, joined with "; " by the routes) alongside `details`, a stable
 * machine-readable list of { code, questionId, label, value } so a client does
 * not have to parse prose to know what failed. Unknown locales fall back to
 * English.
 */
export function validateAnswers(service, answers = {}, { locale } = {}) {
  const lang = locale === 'ms' ? 'ms' : 'en';
  const M = VALIDATION_MESSAGES[lang];
  const errors = [];
  const details = [];
  const fail = (code, q, value, arg) => {
    const label = pick(q, lang);
    errors.push(M[code](label, arg !== undefined ? arg : value));
    details.push({ code, questionId: q.id, label, ...(value !== undefined ? { value } : {}) });
  };
  for (const q of service.questions || []) {
    const a = answers[q.id];
    const present = q.type === 'TIER_QUANTITY'
      ? a && typeof a === 'object' && Object.values(a).some((v) => num(v) > 0)
      : q.type === 'MULTI_SELECT'
        ? Array.isArray(a) && a.length > 0
        : a !== undefined && a !== null && a !== '';

    if (q.required && !present) { fail('required', q); continue; }
    if (!present) continue;

    if (q.type === 'TIER_SELECT' || q.type === 'SINGLE_SELECT') {
      if (!findOption(q, a)) fail('invalid_option', q, a);
    }
    if (q.type === 'MULTI_SELECT') {
      for (const id of a) if (!findOption(q, id)) fail('invalid_option', q, id);
    }
    if (q.type === 'TIER_QUANTITY') {
      for (const id of Object.keys(a)) if (num(a[id]) > 0 && !findOption(q, id)) fail('invalid_tier', q, id);
    }
    if ((q.type === 'QUANTITY' || q.type === 'AREA_INPUT' || q.type === 'HOURS_INPUT')) {
      const v = num(a, NaN);
      if (Number.isNaN(v)) fail('not_a_number', q);
      else {
        const { min, max } = q.config || {};
        if (min != null && v < min) fail('below_min', q, undefined, min);
        if (max != null && v > max) fail('above_max', q, undefined, max);
      }
    }
  }
  return { ok: errors.length === 0, errors, details };
}
