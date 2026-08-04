// Unit tests for image classification and voice transcription — `node --test`.
// Providers are injected, so no key and no network are needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SYMPTOMS, SYMPTOM_ROUTES, isSymptom, routeFor, normalise,
  classifyImage, setVisionProvider, isVisionReady,
} from '../vision.js';
import {
  detectAudio, validateAudio, transcribe, setTranscriptionProvider, clean,
  MAX_BYTES,
} from '../audio.js';
import { getTree, enter, advance } from '../trees/index.js';

// ── The closed set ───────────────────────────────────────────────────────────

test('the symptom set is closed and includes an explicit unknown', () => {
  assert.ok(SYMPTOMS.includes('unknown'));
  assert.equal(new Set(SYMPTOMS).size, SYMPTOMS.length);
  assert.ok(SYMPTOMS.length >= 25);
});

test('anything off-list normalises to unknown', () => {
  // This is the guarantee: the classifier CANNOT name a service that does not
  // exist, because it cannot return anything outside the list.
  assert.equal(normalise({ symptom: 'aircon-repair-premium' }).symptom, 'unknown');
  assert.equal(normalise({ symptom: '' }).symptom, 'unknown');
  assert.equal(normalise({}).symptom, 'unknown');
  assert.equal(normalise({ symptom: 'DROP TABLE bookings' }).symptom, 'unknown');
  assert.equal(normalise({ symptom: 'PEST_TERMITE' }).symptom, 'pest_termite', 'case is normalised');
});

test('unknown is never reported as confident', () => {
  assert.equal(normalise({ symptom: 'unknown' }).confident, false);
  assert.equal(normalise({ symptom: 'pipe_leak' }).confident, true);
});

test('every non-unknown symptom has a route', () => {
  for (const s of SYMPTOMS) {
    if (s === 'unknown') continue;
    assert.ok(SYMPTOM_ROUTES[s], `${s} has no route`);
  }
});

test('every route names a real tree, or is a safety route', () => {
  for (const [symptom, route] of Object.entries(SYMPTOM_ROUTES)) {
    if (route.safety) {
      assert.equal(route.treeId, null, `${symptom} is safety but also names a tree`);
      assert.ok(route.emergency, `${symptom} is safety with no emergency category`);
      continue;
    }
    assert.ok(getTree(route.treeId), `${symptom} routes to unknown tree "${route.treeId}"`);
  }
});

test('every route replays a valid path through its tree', () => {
  // The whole point of routing is to SKIP questions the photo already answered.
  // A stale answer key would silently drop the customer at the wrong leaf.
  for (const [symptom, route] of Object.entries(SYMPTOM_ROUTES)) {
    if (route.safety || !route.answers?.length) continue;
    const tree = getTree(route.treeId);
    let state = enter(tree);
    for (const answer of route.answers) {
      const node = tree.nodes[state.node];
      assert.ok(
        Object.keys(node.answers).includes(answer),
        `${symptom}: "${answer}" is not a branch of ${route.treeId}.${state.node}`,
      );
      const step = advance(tree, state, answer);
      if (step.done) break;
      state = step.state;
    }
  }
});

test('electrical damage routes to safety, not to a questionnaire', () => {
  // Nobody works through a checklist about a burning socket.
  for (const s of ['socket_burn', 'exposed_wiring']) {
    assert.equal(SYMPTOM_ROUTES[s].safety, true);
    assert.equal(routeFor(s).emergency, 'electrical');
  }
});

test('routeFor refuses unknown and unrecognised symptoms', () => {
  assert.equal(routeFor('unknown'), null);
  assert.equal(routeFor('not_a_symptom'), null);
  assert.equal(routeFor(undefined), null);
  assert.equal(routeFor('pest_termite').treeId, 'pest_identify');
});

test('isSymptom is exact', () => {
  assert.equal(isSymptom('pipe_leak'), true);
  assert.equal(isSymptom('pipe'), false);
});

// ── Classification ───────────────────────────────────────────────────────────

test('without a provider every image is unknown, and the flow still works', async () => {
  setVisionProvider(null);
  const before = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    assert.equal(isVisionReady(), false);
    const r = await classifyImage(Buffer.from('not really an image'));
    assert.equal(r.symptom, 'unknown');
    assert.equal(r.confident, false);
  } finally {
    if (before !== undefined) process.env.ANTHROPIC_API_KEY = before;
  }
});

test('an injected provider is normalised through the closed set', async () => {
  setVisionProvider(async () => ({ symptom: 'ac_water_leak', model: 'test' }));
  try {
    const r = await classifyImage(Buffer.from('x'));
    assert.equal(r.symptom, 'ac_water_leak');
    assert.equal(r.confident, true);
    assert.equal(r.model, 'test');
  } finally { setVisionProvider(null); }
});

test('a provider returning free text cannot introduce a new symptom', async () => {
  setVisionProvider(async () => ({ symptom: 'looks like a burst pipe under the sink, book a plumber' }));
  try {
    assert.equal((await classifyImage(Buffer.from('x'))).symptom, 'unknown');
  } finally { setVisionProvider(null); }
});

test('a photo containing a person is flagged and not classified', async () => {
  setVisionProvider(async () => ({ symptom: 'unknown', containsPerson: true }));
  try {
    const r = await classifyImage(Buffer.from('x'));
    assert.equal(r.containsPerson, true);
    assert.equal(r.symptom, 'unknown');
  } finally { setVisionProvider(null); }
});

// ── Audio ────────────────────────────────────────────────────────────────────

const oggBuf = () => Buffer.concat([Buffer.from('OggS'), Buffer.alloc(20)]);
const wavBuf = () => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(8)]);

test('audio is identified by magic bytes, not by what the client claims', () => {
  assert.equal(detectAudio(oggBuf()).mime, 'audio/ogg');
  assert.equal(detectAudio(wavBuf()).mime, 'audio/wav');
  assert.equal(detectAudio(Buffer.from('%PDF-1.7 not audio at all')), null);
  assert.equal(detectAudio(Buffer.alloc(4)), null);
});

test('oversized and empty audio is rejected before anything is spent on it', () => {
  assert.equal(validateAudio(Buffer.alloc(0)).error.code, 'empty_audio');
  const huge = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(MAX_BYTES + 1)]);
  assert.equal(validateAudio(huge).error.code, 'audio_too_large');
  assert.equal(validateAudio(Buffer.from('%PDF-1.7 nope!!')).error.code, 'unsupported_audio');
  assert.equal(validateAudio(oggBuf()).ok, true);
});

test('without a provider transcription reports unavailable rather than throwing', async () => {
  setTranscriptionProvider(null);
  const before = process.env.SPEECH_API_KEY;
  delete process.env.SPEECH_API_KEY;
  try {
    const r = await transcribe(oggBuf());
    assert.equal(r.available, false);
    assert.equal(r.error.code, 'transcription_unavailable');
    assert.match(r.error.message, /type your message/);
  } finally {
    if (before !== undefined) process.env.SPEECH_API_KEY = before;
  }
});

test('an injected transcriber returns cleaned, editable text', async () => {
  setTranscriptionProvider(async () => ({ text: '  my aircon is leaking water ,  ' }));
  try {
    const r = await transcribe(oggBuf(), { locale: 'en' });
    assert.equal(r.available, true);
    assert.equal(r.text, 'my aircon is leaking water');
  } finally { setTranscriptionProvider(null); }
});

test('a validation failure is reported without calling the provider', async () => {
  let called = false;
  setTranscriptionProvider(async () => { called = true; return { text: 'x' }; });
  try {
    const r = await transcribe(Buffer.from('%PDF-1.7 nope!!'));
    assert.equal(r.error.code, 'unsupported_audio');
    assert.equal(called, false);
  } finally { setTranscriptionProvider(null); }
});

test('clean() tidies recogniser artefacts and caps length', () => {
  assert.equal(clean('  hello   there  '), 'hello there');
  assert.equal(clean('..., um yes'), 'um yes');
  assert.equal(clean(''), null);
  assert.equal(clean(null), null);
  assert.equal(clean('x'.repeat(5000)).length, 2000);
});
