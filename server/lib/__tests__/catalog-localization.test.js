// Catalogue localization — the Malay columns must carry real Malay, and the
// serializers must expose it without disturbing the English contract.
//
// The bug these guard against is specific: the seed used to write
// `nameMy: cat.name`, so every Malay column was populated and every Malay value
// was English. A "field is not null" assertion passes happily against that, so
// every check here compares Malay AGAINST English rather than against null.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { mapCategory, mapServiceSummary } from '../catalog.js';

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(
  readFileSync(join(here, '../../../prisma/data/servisaku-services-config.json'), 'utf8'),
);

const categories = config.categories;
const services = categories.flatMap((c) => c.services);

describe('catalogue config carries genuine Malay', () => {
  test('all 12 categories have a nameMy', () => {
    assert.equal(categories.length, 12);
    const missing = categories.filter((c) => !c.nameMy || !String(c.nameMy).trim());
    assert.deepEqual(missing.map((c) => c.slug), []);
  });

  test('no category nameMy is a copy of the English name', () => {
    const copied = categories.filter((c) => c.nameMy === c.name);
    assert.deepEqual(copied.map((c) => c.slug), [], 'these are English in a Malay column');
  });

  test('all 71 services have a nameMy', () => {
    assert.equal(services.length, 71);
    const missing = services.filter((s) => !s.nameMy || !String(s.nameMy).trim());
    assert.deepEqual(missing.map((s) => s.slug), []);
  });

  test('no service nameMy is a copy of the English name', () => {
    const copied = services.filter((s) => s.nameMy === s.name);
    assert.deepEqual(copied.map((s) => s.slug), []);
  });

  test('Malay differs by more than punctuation or case', () => {
    const norm = (v) => String(v).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const shallow = [...categories, ...services].filter((r) => norm(r.nameMy) === norm(r.name));
    assert.deepEqual(shallow.map((r) => r.slug), []);
  });
});

describe('English side is untouched', () => {
  test('every category still has its English name and slug', () => {
    for (const c of categories) {
      assert.ok(c.slug, 'slug present');
      assert.ok(c.name && c.name.trim(), `English name present for ${c.slug}`);
    }
  });

  test('every service keeps slug, pricingType and its question set', () => {
    for (const s of services) {
      assert.ok(s.slug, 'slug present');
      assert.ok(s.name && s.name.trim(), `English name present for ${s.slug}`);
      assert.ok(s.pricingType, `pricingType present for ${s.slug}`);
      assert.ok(Array.isArray(s.questions) || s.questions === undefined);
    }
  });

  test('slugs are unique — localization did not disturb identity', () => {
    const cs = categories.map((c) => c.slug);
    const ss = services.map((s) => s.slug);
    assert.equal(new Set(cs).size, cs.length);
    assert.equal(new Set(ss).size, ss.length);
  });
});

describe('serializers expose Malay in the existing snake_case contract', () => {
  const catRow = {
    id: 'c1', slug: 'cleaning', name: 'Cleaning Services', nameMy: 'Perkhidmatan Pembersihan',
    iconKey: 'Sparkles', accent: 'emerald', priceFrom: 30, sortOrder: 0,
  };
  const svcRow = {
    id: 's1', slug: 'deep-cleaning', categoryId: 'c1',
    name: 'Deep Cleaning', nameMy: 'Pembersihan Mendalam',
    description: 'A thorough clean', descriptionMy: '',
    basePrice: 100, pricingModel: 'flat', pricingType: 'FIXED',
  };

  test('mapCategory returns both name and name_my', () => {
    const out = mapCategory(catRow);
    assert.equal(out.name, 'Cleaning Services');
    assert.equal(out.name_my, 'Perkhidmatan Pembersihan');
    assert.equal(out.slug, 'cleaning', 'slug unchanged');
  });

  test('mapServiceSummary returns both name and name_my', () => {
    const out = mapServiceSummary(svcRow);
    assert.equal(out.name, 'Deep Cleaning');
    assert.equal(out.name_my, 'Pembersihan Mendalam');
    assert.equal(out.slug, 'deep-cleaning');
  });

  test('English clients keep working — `name` is never replaced', () => {
    // Malay is additive. A client that only reads `name` must be unaffected.
    assert.equal(mapCategory(catRow).name, catRow.name);
    assert.equal(mapServiceSummary(svcRow).name, svcRow.name);
  });
});
