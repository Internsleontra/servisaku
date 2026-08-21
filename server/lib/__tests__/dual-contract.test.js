// DUAL response contract — the server half.
//
// The booking wizard shipped English question labels because mapQuestion()
// emitted `label` without `label_my`, so the client had nothing to pick. These
// tests pin the contract: English preserved, Malay added, everything else
// untouched.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { mapQuestion, mapCategory, mapServiceSummary } from '../catalog.js';

/* A Prisma-shaped record, close enough to the real include to be meaningful. */
const dbQuestion = {
  key: 'units',
  label: 'AC units by HP',
  labelMy: 'Unit penyaman udara mengikut HP',
  type: 'TIER_QUANTITY',
  required: true,
  sortOrder: 1,
  config: { min: 1 },
  options: [
    { key: '1hp', label: '1.0 HP', labelMy: '1.0 HP', priceModifier: 0, unitPrice: 89, priceModifierPerSqft: null, isDefault: true, sortOrder: 1 },
    { key: 'wall', label: 'Wall-mounted', labelMy: 'Lekap dinding', priceModifier: 0, unitPrice: null, priceModifierPerSqft: null, isDefault: false, sortOrder: 2 },
  ],
};

describe('mapQuestion exposes Malay alongside English', () => {
  const out = mapQuestion(dbQuestion);

  test('question carries both label and label_my', () => {
    assert.equal(out.label, 'AC units by HP');
    assert.equal(out.label_my, 'Unit penyaman udara mengikut HP');
  });

  test('options carry both label and label_my', () => {
    assert.equal(out.options[0].label, '1.0 HP');
    assert.equal(out.options[0].label_my, '1.0 HP'); // neutral value, same both ways
    assert.equal(out.options[1].label, 'Wall-mounted');
    assert.equal(out.options[1].label_my, 'Lekap dinding');
  });

  test('the Malay field is additive — nothing existing is renamed or dropped', () => {
    // Field-for-field against the pre-change contract.
    assert.deepEqual(
      Object.keys(out).filter((k) => k !== 'label_my').sort(),
      ['config', 'id', 'label', 'options', 'required', 'sort_order', 'type'],
    );
    assert.deepEqual(
      Object.keys(out.options[0]).filter((k) => k !== 'label_my').sort(),
      ['id', 'is_default', 'label', 'price_modifier', 'price_modifier_per_sqft', 'sort_order', 'unit_price'],
    );
  });

  test('ids, types, ordering and pricing are untouched', () => {
    assert.equal(out.id, 'units');           // answer key, never localized
    assert.equal(out.type, 'TIER_QUANTITY'); // enum, never localized
    assert.equal(out.required, true);
    assert.equal(out.sort_order, 1);
    assert.deepEqual(out.config, { min: 1 });
    assert.deepEqual(out.options.map((o) => o.id), ['1hp', 'wall']);
    assert.deepEqual(out.options.map((o) => o.sort_order), [1, 2]);
    assert.equal(out.options[0].unit_price, 89);
  });

  test('a missing Malay column yields undefined, never the English text', () => {
    // Silently echoing English would make the field look translated to any
    // check that only asks whether it is populated.
    const bare = mapQuestion({ ...dbQuestion, labelMy: null, options: [] });
    assert.equal(bare.label, 'AC units by HP');
    assert.equal(bare.label_my, null);
  });
});

describe('the DUAL convention is consistent across the catalogue', () => {
  test('categories and services already used it; questions now match', () => {
    const cat = mapCategory({ id: 'c1', slug: 'cleaning', name: 'Cleaning Services', nameMy: 'Perkhidmatan Pembersihan' });
    assert.equal(cat.name, 'Cleaning Services');
    assert.equal(cat.name_my, 'Perkhidmatan Pembersihan');

    const svc = mapServiceSummary({
      id: 's1', slug: 'ac-servicing', categoryId: 'c1', category: { slug: 'ac' },
      name: 'AC Servicing', nameMy: 'Servis Penyaman Udara',
      description: 'Clean and gas top-up', descriptionMy: 'Cuci dan tambah gas',
    });
    assert.equal(svc.name_my, 'Servis Penyaman Udara');
    assert.equal(svc.description_my, 'Cuci dan tambah gas');

    // Same suffix everywhere, so one client-side rule (tField) covers all of it.
    assert.ok('label_my' in mapQuestion(dbQuestion));
    assert.ok('name_my' in cat);
    assert.ok('name_my' in svc);
  });
});
