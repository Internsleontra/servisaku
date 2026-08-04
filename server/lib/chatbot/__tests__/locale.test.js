// Unit tests for locale detection — `node --test`. Pure, no DB, no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectLocale, resolveLocale, parseAcceptLanguage, t, LOCALES, isLocale,
} from '../locale.js';

test('an unsupported language is not misdetected as Malay', () => {
  // We support English and Malay only. Text in another language should fall to
  // English rather than being confidently mislabelled — retrieval will then
  // find nothing and the bot offers a human, which is the honest outcome.
  assert.equal(detectLocale('我的空调不制冷').locale, 'en');
  assert.equal(detectLocale('என் வீட்டை சுத்தம் செய்ய வேண்டும்').locale, 'en');
});

test('Malay function words detect Malay', () => {
  assert.equal(detectLocale('boleh saya tempah esok').locale, 'ms');
  assert.equal(detectLocale('bila saya dapat bayaran').locale, 'ms');
});

test('code-switched Manglish resolves to Malay', () => {
  // The single most common real input shape. "boleh tak" is unambiguous.
  const r = detectLocale('boleh tak book cleaner untuk esok pagi');
  assert.equal(r.locale, 'ms');
  assert.equal(r.confident, true);
});

test('plain English is not misread as Malay', () => {
  assert.equal(detectLocale('how much does a deep clean cost').locale, 'en');
  assert.equal(detectLocale('can I pay with a card').locale, 'en');
  assert.equal(detectLocale('my booking failed and I was charged').locale, 'en');
});

test('an ambiguous word alone does not flip a long English sentence', () => {
  // "ada" appears in the Malay list but this is plainly English.
  const r = detectLocale('the technician said there was ada problem with the unit and left');
  assert.equal(r.locale, 'en');
});

test('a short message needs only one strong Malay word', () => {
  assert.equal(detectLocale('nak tempah').locale, 'ms');
});

test('empty input returns the fallback and is never confident', () => {
  const r = detectLocale('   ', { fallback: 'ta' });
  assert.equal(r.locale, 'ta');
  assert.equal(r.confident, false);
});

test('resolveLocale — explicit choice wins over everything', () => {
  assert.equal(resolveLocale({
    explicit: 'ms', userPreferred: 'en', message: 'my aircon is broken', acceptLanguage: 'en-GB',
  }), 'ms');
});

test('resolveLocale — a confident detection beats a stale account preference', () => {
  // Someone who switches to Malay mid-conversation gets Malay back, not the
  // language they picked at signup.
  assert.equal(resolveLocale({ userPreferred: 'en', message: 'boleh saya tempah esok' }), 'ms');
});

test('resolveLocale — account preference wins when detection is unsure', () => {
  assert.equal(resolveLocale({ userPreferred: 'ms', message: 'ok' }), 'ms');
});

test('resolveLocale — falls back through header to default', () => {
  assert.equal(resolveLocale({ acceptLanguage: 'ms-MY,ms;q=0.9' }), 'ms');
  assert.equal(resolveLocale({}), 'en');
});

test('resolveLocale ignores an unsupported explicit locale', () => {
  assert.equal(resolveLocale({ explicit: 'fr', userPreferred: 'ms' }), 'ms');
  assert.equal(resolveLocale({ explicit: 'zh', userPreferred: 'ms' }), 'ms');
});

test('parseAcceptLanguage respects q-values and maps Indonesian to Malay', () => {
  assert.equal(parseAcceptLanguage('en;q=0.4,ms;q=0.9'), 'ms');
  assert.equal(parseAcceptLanguage('id-ID,id;q=0.9'), 'ms');
  // An unsupported language is not a match, so the caller falls through.
  assert.equal(parseAcceptLanguage('zh-CN,ta;q=0.8'), null);
  assert.equal(parseAcceptLanguage('fr-FR,de;q=0.8'), null);
  assert.equal(parseAcceptLanguage(''), null);
});

test('t() reads a bare string as English — existing corpus entries still work', () => {
  assert.equal(t('Refunds take 5-7 days', 'ta'), 'Refunds take 5-7 days');
});

test('t() falls back to English rather than returning nothing', () => {
  const value = { en: 'Full refund', ms: 'Bayaran balik penuh' };
  assert.equal(t(value, 'ms'), 'Bayaran balik penuh');
  // A missing Malay string must show the English answer, not an empty bubble.
  assert.equal(t({ en: 'Full refund' }, 'ms'), 'Full refund');
  assert.equal(t(null, 'en'), '');
});

test('exactly two locales are supported', () => {
  assert.deepEqual(LOCALES, ['en', 'ms']);
  for (const l of LOCALES) assert.equal(isLocale(l), true);
  for (const l of ['fr', 'zh', 'ta']) assert.equal(isLocale(l), false);
});
