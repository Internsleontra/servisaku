// Quote localization — labels follow the locale, arithmetic does not.
//
// The invariant that matters commercially: a Malay quote and an English quote
// for the same answers must be the SAME PRICE. Every money assertion below is
// a strict equality between the two locales, not a spot-check of one.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { computePrice } from '../dynamicPricing.js';
import { localeOf, isLocale } from '../locale.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(join(here, p), 'utf8'));
const config = read('../../../prisma/data/servisaku-services-config.json');
const NEUTRAL = new Set(read('../../../prisma/data/localization-neutral.json').neutral);

const questions = config.categories
  .flatMap((c) => c.services)
  .flatMap((s) => s.questions || []);
const options = questions.flatMap((q) => q.options || []);

/* A service exercising base, option, surcharges, booking fee and SST at once. */
const service = {
  slug: 'test', name: 'Full House Cleaning', nameMy: 'Pembersihan Seluruh Rumah',
  pricingType: 'TIERED', basePrice: 0, visitFee: 0, sstEnabled: true,
  questions: [{
    id: 'size', label: 'Home size', labelMy: 'Saiz rumah',
    type: 'TIER_SELECT', required: true,
    options: [{ id: '3br', label: '3BR', labelMy: '3BR', priceModifier: 210 }],
  }],
};
const answers = { size: '3br' };
const ctx = { urgent: true, afterHours: true, promoDiscount: 10 };

describe('catalogue data carries Malay for every question and option', () => {
  test('all 167 question labels have a labelMy', () => {
    assert.equal(questions.length, 167);
    const missing = questions.filter((q) => !q.labelMy || !String(q.labelMy).trim());
    assert.deepEqual(missing.map((q) => q.id), []);
  });

  test('all 399 option labels have a labelMy', () => {
    assert.equal(options.length, 399);
    const missing = options.filter((o) => !o.labelMy || !String(o.labelMy).trim());
    assert.deepEqual(missing.map((o) => o.id), []);
  });

  test('every English==Malay label is declared neutral, not accidental', () => {
    const undeclared = [...questions, ...options]
      .filter((n) => n.labelMy === n.label && !NEUTRAL.has(n.label));
    assert.deepEqual(undeclared.map((n) => n.label), [],
      'these are untranslated, not intentionally language-neutral');
  });

  test('question ids and option ids are untouched by localization', () => {
    for (const q of questions) assert.ok(q.id, 'question id present');
    for (const o of options) assert.ok(o.id, 'option id present');
  });
});

describe('engine labels follow the locale', () => {
  test('English is the default when no locale is given', () => {
    const p = computePrice(service, answers, ctx);
    const labels = p.breakdown.map((l) => l.label);
    assert.ok(labels.includes('Booking fee'));
    assert.ok(labels.includes('After-hours surcharge'));
  });

  test('ms returns Malay for engine-owned and data-driven labels', () => {
    const p = computePrice(service, answers, { ...ctx, locale: 'ms' });
    const labels = p.breakdown.map((l) => l.label);
    assert.ok(labels.includes('Yuran tempahan'), 'booking fee in Malay');
    assert.ok(labels.includes('Caj tambahan luar waktu'), 'after-hours in Malay');
    assert.ok(labels.includes('Caj tambahan segera (hari sama)'), 'urgent in Malay');
    assert.ok(labels.includes('Diskaun promosi'), 'promo in Malay');
    assert.ok(labels.includes('Saiz rumah'), 'question label in Malay');
  });

  test('an unknown locale falls back to English rather than blank', () => {
    for (const bad of ['zz', 'id', '', null, undefined, 'MS']) {
      const p = computePrice(service, answers, { ...ctx, locale: bad });
      assert.ok(p.breakdown.map((l) => l.label).includes('Booking fee'),
        `locale ${JSON.stringify(bad)} should fall back to English`);
    }
  });

  test('no label is ever empty or undefined in either locale', () => {
    for (const locale of ['en', 'ms']) {
      const p = computePrice(service, answers, { ...ctx, locale });
      for (const line of p.breakdown) {
        assert.ok(line.label, `empty label in ${locale}`);
        assert.ok(!/undefined|null|\[object/.test(String(line.label)), `broken label in ${locale}`);
      }
    }
  });
});

describe('prices are identical across locales', () => {
  const en = computePrice(service, answers, { ...ctx, locale: 'en' });
  const ms = computePrice(service, answers, { ...ctx, locale: 'ms' });

  test('total, subtotal, tax and fees match exactly', () => {
    assert.equal(ms.total, en.total);
    assert.equal(ms.subtotal, en.subtotal);
    assert.equal(ms.tax, en.tax);
    assert.equal(ms.platformFee, en.platformFee);
    assert.equal(ms.serviceTotal, en.serviceTotal);
    assert.equal(ms.promoDiscount, en.promoDiscount);
  });

  test('the breakdown has the same shape and the same amounts', () => {
    assert.equal(ms.breakdown.length, en.breakdown.length);
    for (let i = 0; i < en.breakdown.length; i += 1) {
      assert.equal(ms.breakdown[i].amount, en.breakdown[i].amount, `amount differs at line ${i}`);
      assert.equal(ms.breakdown[i].type, en.breakdown[i].type, `type differs at line ${i}`);
    }
  });

  test('only the label text differs', () => {
    const stripped = (p) => p.breakdown.map(({ label, optionLabel, ...rest }) => rest);
    assert.deepEqual(stripped(ms), stripped(en));
  });
});

describe('locale resolution', () => {
  test('explicit query parameter wins', () => {
    assert.equal(localeOf({ query: { locale: 'ms' }, headers: {} }), 'ms');
    assert.equal(localeOf({ query: { locale: 'en' }, headers: {} }), 'en');
  });

  test('Accept-Language is used when no parameter is given', () => {
    assert.equal(localeOf({ query: {}, headers: { 'accept-language': 'ms-MY,ms;q=0.9' } }), 'ms');
    assert.equal(localeOf({ query: {}, headers: { 'accept-language': 'en-GB,en;q=0.9' } }), 'en');
  });

  test('missing or unsupported locale falls back to English', () => {
    assert.equal(localeOf({ query: {}, headers: {} }), 'en');
    assert.equal(localeOf({ query: { locale: 'zz' }, headers: {} }), 'en');
    assert.equal(localeOf({}), 'en');
    assert.equal(localeOf(undefined), 'en');
  });

  test('isLocale is re-exported rather than reimplemented', () => {
    assert.equal(isLocale('ms'), true);
    assert.equal(isLocale('en'), true);
    assert.equal(isLocale('zz'), false);
  });
});
