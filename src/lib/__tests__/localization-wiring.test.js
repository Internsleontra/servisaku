// Client-side localization wiring.
//
// There is no JSX test harness in this repo and LanguageContext reads
// `import.meta.env`, so the component wiring cannot be mounted under
// `node --test`. Two kinds of check are therefore mixed here, and labelled:
//
//   BEHAVIOURAL — runs the real thing (the DUAL scanner, the neutral list)
//   WIRING      — asserts the source connects A to B
//
// The wiring assertions are weak on their own; they exist because each one
// pins a connection that was actually missing and shipped. The live browser
// and HTTP checks are what prove behaviour end to end.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── BEHAVIOURAL: the DUAL-field guard ───────────────────────────────────── */
describe('DUAL-field guard [behavioural]', () => {
  const run = () => {
    try {
      return { code: 0, out: execFileSync('node', [join(ROOT, 'scripts/check-dual-fields.js')], { cwd: ROOT, encoding: 'utf8' }) };
    } catch (e) {
      return { code: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  };

  test('passes on the current tree', () => {
    const { code, out } = run();
    assert.equal(code, 0, out);
    assert.match(out, /PASS — every DUAL field read goes through tField/);
  });

  test('catches a raw question.label and a raw category.name', () => {
    // The two defects the guard exists to prevent, injected into real files and
    // reverted afterwards — the guard is worthless if it cannot fail.
    const targets = [
      ['src/components/booking/QuestionRenderer.jsx', "{tField(question, 'label')}", '{question.label}'],
      ['src/components/CategoryTiles.jsx', "{tField(c, 'name')}", '{c.name}'],
    ];
    const backups = targets.map(([p]) => [p, read(p)]);
    try {
      for (const [p, good, bad] of targets) {
        writeFileSync(join(ROOT, p), read(p).replace(good, bad), 'utf8');
      }
      const { code, out } = run();
      assert.equal(code, 1, 'guard did not fail on injected defects');
      assert.match(out, /question\.label/);
      assert.match(out, /c\.name/);
    } finally {
      for (const [p, original] of backups) writeFileSync(join(ROOT, p), original, 'utf8');
    }
    assert.equal(run().code, 0, 'tree not restored after the injection test');
  });

  test('an exemption marker above the read suppresses the report', () => {
    // Behavioural: inject a raw read that IS exempted and confirm the guard
    // stays green, so the escape hatch is proven to work rather than assumed.
    const target = 'src/components/CategoryTiles.jsx';
    const original = read(target);
    try {
      writeFileSync(join(ROOT, target), original.replace(
        "              {tField(c, 'name')}",
        '              {/* dual-field-exempt: proving the escape hatch */}\n              {c.name}',
      ), 'utf8');
      const { code, out } = run();
      assert.equal(code, 0, `exempted read was still reported:\n${out}`);
    } finally {
      writeFileSync(join(ROOT, target), original, 'utf8');
    }
  });

  test('the exemption does not leak to an unrelated read further down', () => {
    const target = 'src/components/CategoryTiles.jsx';
    const original = read(target);
    try {
      // Marker, then enough distance that the next raw read is not covered.
      writeFileSync(join(ROOT, target), original.replace(
        "              {tField(c, 'name')}",
        '              {/* dual-field-exempt: only covers what is near it */}\n'
        + '              {/* filler */}\n              {/* filler */}\n'
        + '              {/* filler */}\n              {/* filler */}\n'
        + "              {c.name}",
      ), 'utf8');
      const { code } = run();
      assert.equal(code, 1, 'a distant marker must not exempt this read');
    } finally {
      writeFileSync(join(ROOT, target), original, 'utf8');
    }
  });
});

/* ── BEHAVIOURAL: neutral-list narrowing ─────────────────────────────────── */
describe('neutral declarations [behavioural]', () => {
  const neutral = JSON.parse(read('prisma/data/localization-neutral.json')).neutral;

  test('the four over-broad entries are gone', () => {
    for (const s of ['32" and below', 'BLDC / with remote', 'Below 1000 sqft', 'Below 1500 sqft']) {
      assert.ok(!neutral.includes(s), `${s} is still declared neutral`);
    }
  });

  test('no remaining entry carries English prose', () => {
    // A neutral value is a unit, a grade or an identifier — not a sentence.
    const PROSE = new Set(['and', 'or', 'with', 'without', 'below', 'above', 'per', 'each',
      'only', 'more', 'less', 'than', 'the', 'for', 'included', 'excluded']);
    const offenders = neutral.filter((s) => String(s).toLowerCase()
      .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
      .some((w) => PROSE.has(w)));
    assert.deepEqual(offenders, []);
  });

  test('the seed config now translates the descriptive half and keeps the identifier', () => {
    const cfg = read('prisma/data/servisaku-services-config.json');
    const expected = {
      '32" dan ke bawah': '32"',
      'BLDC / dengan alat kawalan jauh': 'BLDC',
      'Bawah 1000 sqft': '1000 sqft',
      'Bawah 1500 sqft': '1500 sqft',
    };
    for (const [malay, identifier] of Object.entries(expected)) {
      assert.ok(cfg.includes(JSON.stringify(malay).slice(1, -1)), `missing Malay: ${malay}`);
      assert.ok(malay.includes(identifier), `identifier ${identifier} must survive translation`);
    }
  });
});

/* ── WIRING: language defaults per build target ──────────────────────────── */
describe('language defaults [wiring]', () => {
  const ctx = read('src/lib/LanguageContext.jsx');

  test('partner is pinned to English at compile time', () => {
    assert.match(ctx, /VITE_APP === 'partner'/);
    assert.match(ctx, /SUPPORTED_LANGS = IS_PARTNER \? \['en'\] : \['ms', 'en'\]/);
    assert.match(ctx, /DEFAULT_LANG = IS_PARTNER \? 'en' : 'ms'/);
  });

  test("partner's supported set excludes ms, so a stored preference is coerced away", () => {
    // Defaulting alone would not be enough: consumer and partner share an
    // origin in dev, and a stored 'ms' would revive Malay partner chrome.
    const supported = ctx.match(/SUPPORTED_LANGS = IS_PARTNER \? (\[[^\]]*\])/)[1];
    assert.equal(supported, "['en']");
    assert.match(ctx, /normalise\(value\)|SUPPORTED_LANGS\.includes\(value\)/);
  });

  test('the API client asks for English on the partner build', () => {
    const api = read('src/api/apiClient.js');
    assert.match(api, /VITE_APP === 'partner'.*return 'en-US/s);
  });
});

/* ── WIRING: chatbot greeting locale ─────────────────────────────────────── */
describe('chatbot greeting locale [wiring]', () => {
  test('the widget passes the active language into the hook', () => {
    const widget = read('src/components/chatbot/ChatbotWidget.jsx');
    assert.match(widget, /const \{ t, lang \} = useTranslation\(\)/);
    assert.match(widget, /useChatbot\(\{ role, mode, locale: lang \}\)/);
  });

  test('the hook follows a language change after mount', () => {
    // The reducer seeds locale once; without this the conversation stays in
    // whatever language it started in.
    const hook = read('src/hooks/useChatbot.js');
    assert.match(hook, /dispatch\(\{ type: 'LOCALE_CHANGED', locale \}\)/);
    assert.match(hook, /\}, \[locale\]\)/);
  });

  test('it reuses the existing language context rather than a second mechanism', () => {
    // Comments stripped first: this is a claim about the code, and the comment
    // above the fix legitimately names Accept-Language while explaining it.
    const widget = read('src/components/chatbot/ChatbotWidget.jsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/localStorage|navigator\.language|Accept-Language/.test(widget),
      'chatbot must not read the language independently');
  });
});

/* ── WIRING: booking wizard renders through tField ───────────────────────── */
describe('booking wizard label rendering [wiring]', () => {
  test('question labels go through tField', () => {
    const qr = read('src/components/booking/QuestionRenderer.jsx');
    assert.match(qr, /tField\(question, 'label'\)/);
    assert.ok(!/\{question\.label\}/.test(qr), 'a raw question.label remains');
  });

  test('every option widget goes through tField', () => {
    for (const w of ['SingleSelect', 'MultiSelect', 'TierSelect', 'TierQuantitySelector']) {
      const src = read(`src/components/booking/widgets/${w}.jsx`);
      assert.match(src, /tField\(o, 'label'\)/, `${w} still renders a raw option label`);
    }
  });

  test('category names go through tField wherever they are displayed', () => {
    for (const f of ['src/components/CategoryTiles.jsx', 'src/pages/Explore.jsx',
      'src/pages/Catalog.jsx', 'src/pages/CatalogCategory.jsx', 'src/pages/Home.jsx']) {
      assert.match(read(f), /tField\([^,]+, 'name'\)/, `${f} does not resolve a name through tField`);
    }
  });
});
