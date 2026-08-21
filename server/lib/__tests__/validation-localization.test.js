// validateAnswers — every customer-facing message, in both languages.
//
// These assert exact wording, not "a message exists": a test that only checks
// truthiness passes just as happily against an English string returned under
// ?locale=ms, which is the bug this file exists to prevent.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateAnswers } from '../dynamicPricing.js';
import { localizedError } from '../errors.js';

/* One service covering every validated question type. */
const service = {
  slug: 'test', name: 'Test', pricingType: 'TIERED', basePrice: 0,
  questions: [
    {
      id: 'size', label: 'Home size', labelMy: 'Saiz rumah',
      type: 'TIER_SELECT', required: true,
      options: [{ id: '3br', label: '3BR', labelMy: '3BR', priceModifier: 210 }],
    },
    {
      id: 'tasks', label: 'Task type', labelMy: 'Jenis tugasan',
      type: 'MULTI_SELECT', required: false,
      options: [{ id: 'assembly', label: 'Assembly', labelMy: 'Pemasangan', priceModifier: 20 }],
    },
    {
      id: 'units', label: 'Units by HP', labelMy: 'Unit mengikut HP',
      type: 'TIER_QUANTITY', required: false,
      options: [{ id: '1hp', label: '1.0 HP', labelMy: '1.0 HP', unitPrice: 60 }],
    },
    {
      id: 'hours', label: 'Hours needed', labelMy: 'Jam diperlukan',
      type: 'HOURS_INPUT', required: false, config: { min: 1, max: 8 },
    },
  ],
};

const run = (answers, locale) => validateAnswers(service, answers, { locale });
const only = (answers, locale, code) =>
  run(answers, locale).details.find((d) => d.code === code);

describe('required', () => {
  test('English wording', () => {
    const r = run({}, 'en');
    assert.ok(r.errors.includes('Home size is required'), r.errors.join(' | '));
  });
  test('Malay wording, with the Malay field name', () => {
    const r = run({}, 'ms');
    assert.ok(r.errors.includes('Saiz rumah diperlukan'), r.errors.join(' | '));
    assert.ok(!r.errors.some((e) => e.includes('Home size')), 'English field name leaked');
    assert.ok(!r.errors.some((e) => e.includes('is required')), 'English phrasing leaked');
  });
  test('code and field identity are stable across locales', () => {
    for (const locale of ['en', 'ms']) {
      const d = only({}, locale, 'required');
      assert.equal(d.code, 'required');
      assert.equal(d.questionId, 'size');
    }
    assert.equal(only({}, 'en', 'required').label, 'Home size');
    assert.equal(only({}, 'ms', 'required').label, 'Saiz rumah');
  });
});

describe('invalid option — single and multi select', () => {
  test('single: English then Malay', () => {
    assert.ok(run({ size: 'bogus' }, 'en').errors.includes('Home size: invalid option "bogus"'));
    assert.ok(run({ size: 'bogus' }, 'ms').errors.includes('Saiz rumah: pilihan "bogus" tidak sah'));
  });
  test('multi: English then Malay', () => {
    const a = { size: '3br', tasks: ['nope'] };
    assert.ok(run(a, 'en').errors.includes('Task type: invalid option "nope"'));
    assert.ok(run(a, 'ms').errors.includes('Jenis tugasan: pilihan "nope" tidak sah'));
  });
  test('the offending value is preserved verbatim in both languages', () => {
    for (const locale of ['en', 'ms']) {
      assert.equal(only({ size: 'bogus' }, locale, 'invalid_option').value, 'bogus');
    }
  });
});

describe('invalid tier', () => {
  const a = { size: '3br', units: { nope: 2 } };
  test('English', () => {
    assert.ok(run(a, 'en').errors.includes('Units by HP: invalid tier "nope"'));
  });
  test('Malay', () => {
    assert.ok(run(a, 'ms').errors.includes('Unit mengikut HP: tahap "nope" tidak sah'));
  });
});

describe('numeric validation', () => {
  test('not a number', () => {
    assert.ok(run({ size: '3br', hours: 'abc' }, 'en').errors.includes('Hours needed: must be a number'));
    assert.ok(run({ size: '3br', hours: 'abc' }, 'ms').errors.includes('Jam diperlukan: mesti berupa nombor'));
  });
  test('below minimum keeps the numeral', () => {
    assert.ok(run({ size: '3br', hours: 0.5 }, 'en').errors.includes('Hours needed: minimum is 1'));
    assert.ok(run({ size: '3br', hours: 0.5 }, 'ms').errors.includes('Jam diperlukan: minimum ialah 1'));
  });
  test('above maximum keeps the numeral', () => {
    assert.ok(run({ size: '3br', hours: 99 }, 'en').errors.includes('Hours needed: maximum is 8'));
    assert.ok(run({ size: '3br', hours: 99 }, 'ms').errors.includes('Jam diperlukan: maksimum ialah 8'));
  });
});

describe('message hygiene across every failure mode', () => {
  const CASES = [
    {}, { size: 'bogus' }, { size: '3br', tasks: ['nope'] },
    { size: '3br', units: { nope: 1 } }, { size: '3br', hours: 'abc' },
    { size: '3br', hours: 0.1 }, { size: '3br', hours: 1000 },
  ];

  test('no message is empty, undefined or a broken placeholder', () => {
    for (const locale of ['en', 'ms']) {
      for (const answers of CASES) {
        for (const e of run(answers, locale).errors) {
          assert.ok(e && e.trim(), `empty message in ${locale}`);
          assert.ok(!/undefined|null|\[object |\bNaN\b/.test(e), `broken message in ${locale}: ${e}`);
        }
      }
    }
  });

  test('no English phrasing survives under ms', () => {
    const ENGLISH = [' is required', 'invalid option', 'invalid tier', 'must be a number', 'minimum is', 'maximum is'];
    for (const answers of CASES) {
      for (const e of run(answers, 'ms').errors) {
        for (const phrase of ENGLISH) {
          assert.ok(!e.includes(phrase), `English leaked under ms: "${e}"`);
        }
      }
    }
  });

  test('English and Malay report the same codes in the same order', () => {
    for (const answers of CASES) {
      const en = run(answers, 'en').details.map((d) => `${d.code}:${d.questionId}`);
      const ms = run(answers, 'ms').details.map((d) => `${d.code}:${d.questionId}`);
      assert.deepEqual(ms, en, 'error identity must not depend on language');
    }
  });

  test('valid answers pass in both languages', () => {
    for (const locale of ['en', 'ms']) {
      const r = run({ size: '3br' }, locale);
      assert.equal(r.ok, true);
      assert.deepEqual(r.errors, []);
      assert.deepEqual(r.details, []);
    }
  });
});

describe('locale fallback', () => {
  test('missing or unknown locale yields English', () => {
    for (const locale of [undefined, null, '', 'zz', 'MS', 'id']) {
      const r = validateAnswers(service, {}, { locale });
      assert.ok(r.errors.includes('Home size is required'), `locale ${JSON.stringify(locale)}`);
    }
  });

  test('called with no options object at all still works', () => {
    const r = validateAnswers(service, {});
    assert.ok(r.errors.includes('Home size is required'));
  });
});

describe('localized not-found errors', () => {
  test('service not found in both languages, with a stable code', () => {
    const en = localizedError(404, 'service_not_found', 'en', 'nope');
    const ms = localizedError(404, 'service_not_found', 'ms', 'nope');
    assert.equal(en.message, 'Service not found: nope');
    assert.equal(ms.message, 'Perkhidmatan tidak dijumpai: nope');
    assert.equal(en.status, 404);
    assert.equal(ms.details[0].code, 'service_not_found');
  });

  test('category not found in both languages', () => {
    assert.equal(localizedError(404, 'category_not_found', 'en', 'x').message, 'Category not found: x');
    assert.equal(localizedError(404, 'category_not_found', 'ms', 'x').message, 'Kategori tidak dijumpai: x');
  });

  test('unknown locale falls back to English', () => {
    assert.equal(localizedError(404, 'service_not_found', 'zz', 'x').message, 'Service not found: x');
  });
});
