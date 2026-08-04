// ─────────────────────────────────────────────────────────────────────────────
// Image understanding — closed-set symptom classification.
//
// THE DESIGN RULE (docs/11 §F4): the classifier returns one of a fixed list of
// symptom ids, or `unknown`. It cannot return free text, so it cannot name a
// service that does not exist — the same structural guarantee the decision trees
// give, applied to a photograph.
//
// A recognised symptom does not answer the customer directly. It enters the
// matching diagnostic tree AT THE BRANCH THE IMAGE ALREADY RESOLVED, so someone
// who has just photographed water pooling under their aircon is not then asked
// whether water is dripping.
//
// `unknown` is a first-class outcome, not a failure. An unrecognised image asks
// a clarifying question rather than guessing — the guess is what would put a
// wrong RM 350 termite treatment in front of someone with a damp patch.
//
// Inert without a provider, mirroring provider.js: no key means every image
// classifies as `unknown` and the flow still works, just with a question instead
// of a head start.
// ─────────────────────────────────────────────────────────────────────────────
import { getTree } from './trees/index.js';

/**
 * The closed set. Adding a symptom means adding a route below and, usually, a
 * tree branch — which is the point: the taxonomy cannot grow by accident.
 */
export const SYMPTOMS = [
  'ac_water_leak', 'ac_dirty_filter', 'ac_ice_buildup',
  'pipe_leak', 'tap_drip', 'blocked_drain', 'clogged_toilet', 'water_stain_ceiling',
  'wall_crack_hairline', 'wall_crack_structural', 'mould_growth', 'paint_peeling',
  'grout_damage', 'broken_tile', 'roof_leak',
  'socket_burn', 'exposed_wiring', 'tripped_breaker',
  'pest_termite', 'pest_cockroach', 'pest_rodent', 'pest_bedbug',
  'stain_fabric', 'stain_carpet',
  'broken_hinge', 'door_misalignment', 'furniture_flatpack',
  'appliance_error_code',
  'unknown',
];

const SYMPTOM_SET = new Set(SYMPTOMS);
export const isSymptom = (s) => SYMPTOM_SET.has(s);

/**
 * Where a recognised symptom lands.
 *
 * `answers` are branch keys replayed against the tree in order — the questions
 * the photograph has already answered. `safety: true` bypasses the tree
 * entirely: nobody works through a questionnaire about a burning socket.
 */
export const SYMPTOM_ROUTES = {
  ac_water_leak: { treeId: 'ac_leaking', answers: ['indoor'] },
  ac_dirty_filter: { treeId: 'ac_not_cooling', answers: ['no', 'no', 'yes', 'gradual'] },
  ac_ice_buildup: { treeId: 'ac_not_cooling', answers: ['no', 'no', 'yes', 'sudden'] },

  pipe_leak: { treeId: 'plumbing_leak', answers: ['no'] },
  tap_drip: { treeId: 'plumbing_leak', answers: ['no', 'in_use'] },
  blocked_drain: { treeId: 'plumbing_blockage', answers: ['sink'] },
  clogged_toilet: { treeId: 'plumbing_blockage', answers: ['toilet'] },
  water_stain_ceiling: { treeId: 'wall_damage', answers: ['damp'] },
  roof_leak: { treeId: 'wall_damage', answers: ['damp'] },

  wall_crack_hairline: { treeId: 'wall_damage', answers: ['crack', 'hairline'] },
  wall_crack_structural: { treeId: 'wall_damage', answers: ['crack', 'wide'] },
  mould_growth: { treeId: 'wall_damage', answers: ['mould'] },
  paint_peeling: { treeId: 'wall_damage', answers: ['paint'] },
  grout_damage: { treeId: 'cleaning_scope', answers: ['deep'] },
  broken_tile: { treeId: 'wall_damage', answers: ['crack', 'hairline'] },

  // Electrical damage is a safety matter first and a booking second.
  socket_burn: { treeId: null, safety: true, emergency: 'electrical' },
  exposed_wiring: { treeId: null, safety: true, emergency: 'electrical' },
  tripped_breaker: { treeId: 'power_trip', answers: [] },

  pest_termite: { treeId: 'pest_identify', answers: ['termite'] },
  pest_cockroach: { treeId: 'pest_identify', answers: ['cockroach'] },
  pest_rodent: { treeId: 'pest_identify', answers: ['rodent'] },
  pest_bedbug: { treeId: 'pest_identify', answers: ['bedbug'] },

  stain_fabric: { treeId: 'cleaning_scope', answers: ['deep'] },
  stain_carpet: { treeId: 'cleaning_scope', answers: ['deep'] },

  broken_hinge: { treeId: 'furniture_assembly', answers: ['one'] },
  door_misalignment: { treeId: 'furniture_assembly', answers: ['one'] },
  furniture_flatpack: { treeId: 'furniture_assembly', answers: ['one'] },

  appliance_error_code: { treeId: 'appliance_fault', answers: ['other'] },
};

/** The route for a symptom, or null when it is unknown or unmapped. */
export function routeFor(symptom) {
  if (!isSymptom(symptom) || symptom === 'unknown') return null;
  const route = SYMPTOM_ROUTES[symptom];
  if (!route) return null;
  // A route naming a tree that no longer exists must degrade, not crash a turn.
  if (route.treeId && !getTree(route.treeId)) return null;
  return route;
}

// ─── Provider ────────────────────────────────────────────────────────────────

let override = null;

/** Swap the classifier (tests, or a different vendor). */
export function setVisionProvider(fn) { override = fn; }

export const isVisionReady = () => Boolean(override || process.env.ANTHROPIC_API_KEY);

const MODEL = process.env.CHATBOT_VISION_MODEL || 'claude-opus-5';

/**
 * The classification prompt. Deliberately terse and closed: the model is asked
 * to SELECT, never to describe. A prompt that invites a description invites an
 * invented service along with it.
 */
const SYSTEM = `You classify photographs of household problems for a Malaysian home-services marketplace.

Reply with EXACTLY ONE id from this list and nothing else — no punctuation, no explanation:

${SYMPTOMS.join('\n')}

Rules:
- If the image does not clearly show one of these, reply "unknown".
- If the image shows a person, or a document, or anything unrelated to a household problem, reply "unknown".
- Never invent an id that is not on the list.
- Prefer "unknown" over a guess. A wrong id sends someone the wrong tradesperson.`;

/**
 * Classify an image.
 *
 * @param {Buffer} buffer
 * @param {object} [opts]
 * @param {string} [opts.mime]
 * @returns {Promise<{ symptom, confident, containsPerson, model }>}
 */
export async function classifyImage(buffer, { mime = 'image/jpeg' } = {}) {
  if (override) return normalise(await override({ buffer, mime }));
  if (!isVisionReady()) {
    // No key: the flow still works, it just asks a question instead of getting
    // a head start.
    return { symptom: 'unknown', confident: false, containsPerson: false, model: null };
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16, // an id, and nothing else
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mime, data: buffer.toString('base64') } },
        { type: 'text', text: 'Classify this image.' },
      ],
    }],
  });

  if (response.stop_reason === 'refusal') {
    return { symptom: 'unknown', confident: false, containsPerson: true, model: response.model };
  }

  const text = (response.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
    .toLowerCase();

  return normalise({ symptom: text, model: response.model });
}

/**
 * Coerce a provider reply into the closed set.
 *
 * Anything off-list becomes `unknown`. This is the guarantee, not a nicety: it
 * is what makes "the classifier cannot name a service that does not exist" true
 * of the code rather than of the prompt.
 */
export function normalise(result = {}) {
  const raw = String(result.symptom || '').trim().toLowerCase();
  const symptom = isSymptom(raw) ? raw : 'unknown';
  return {
    symptom,
    confident: symptom !== 'unknown',
    containsPerson: Boolean(result.containsPerson),
    model: result.model ?? null,
  };
}
