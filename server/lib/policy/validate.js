// ─────────────────────────────────────────────────────────────────────────────
// Policy value validation.
//
// Enforced in BOTH directions, deliberately:
//   • on write  — a proposed value that fails is rejected before it can be approved
//   • on read   — a value written to the database out of band still fails here and
//                 the resolver falls back
//
// Validating only on write assumes the API is the sole path to the table. It is
// not: a migration, a psql session or a restored backup can all put a value there.
// The read-side check is what makes `pricing.max_surge_multiplier = 15` (conflict
// C-08) unreachable rather than merely discouraged.
//
// Pure — no DB, no clock — so every boundary is unit testable.
// ─────────────────────────────────────────────────────────────────────────────
import { getKeyDef, TYPES } from './catalog.js';

/** A validation outcome. `value` is the coerced value when ok. */
const ok = (value) => ({ ok: true, value, error: null });
const fail = (code, message) => ({ ok: false, value: null, error: { code, message } });

const isInt = (n) => Number.isInteger(n);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * Validate a value against its key definition.
 *
 * @param {string} key
 * @param {*} value
 * @returns {{ ok: boolean, value: *, error: { code, message }|null }}
 */
export function validateValue(key, value) {
  const def = getKeyDef(key);
  if (!def) return fail('unknown_policy_key', `"${key}" is not declared in the policy catalogue`);

  // null is legitimate and meaningful: "this rule is not implemented". It is how
  // the catalogue records a gap that a clause expects to be filled, and the
  // conflict engine reads it. It is not a validation failure.
  if (value === null || value === undefined) return ok(null);

  const b = def.bounds || {};

  switch (def.type) {
    case TYPES.INTEGER: {
      if (!isInt(value)) return fail('policy_value_type_mismatch', `${key} must be an integer`);
      return checkRange(key, value, b);
    }
    case TYPES.DECIMAL: {
      if (!isNum(value)) return fail('policy_value_type_mismatch', `${key} must be a number`);
      return checkRange(key, value, b);
    }
    case TYPES.PERCENT: {
      if (!isNum(value)) return fail('policy_value_type_mismatch', `${key} must be a number`);
      // A percent is 0–100. Catching 0.75 here is the point: a rate written into
      // a percent key silently under-refunds by two orders of magnitude.
      return checkRange(key, value, { min: b.min ?? 0, max: b.max ?? 100 });
    }
    case TYPES.RATE: {
      if (!isNum(value)) return fail('policy_value_type_mismatch', `${key} must be a number`);
      // And the mirror: 20 in a rate key would charge 2000% commission.
      return checkRange(key, value, { min: b.min ?? 0, max: b.max ?? 1 });
    }
    case TYPES.MONEY: {
      if (!isNum(value)) return fail('policy_value_type_mismatch', `${key} must be a number`);
      if (Math.round(value * 100) !== value * 100) {
        return fail('policy_value_precision', `${key} must be a whole number of sen`);
      }
      return checkRange(key, value, { min: b.min ?? 0, max: b.max });
    }
    case TYPES.BOOLEAN: {
      if (typeof value !== 'boolean') return fail('policy_value_type_mismatch', `${key} must be a boolean`);
      return ok(value);
    }
    case TYPES.ENUM: {
      const values = b.values || [];
      if (!values.includes(value)) {
        return fail('policy_value_out_of_bounds', `${key} must be one of: ${values.join(', ')}`);
      }
      return ok(value);
    }
    case TYPES.LIST: {
      if (!Array.isArray(value)) return fail('policy_value_type_mismatch', `${key} must be a list`);
      for (const item of value) {
        if (b.itemType === 'integer' && !isInt(item)) {
          return fail('policy_value_type_mismatch', `${key} items must be integers`);
        }
        const r = checkRange(key, item, b);
        if (!r.ok) return r;
      }
      return ok(value);
    }
    case TYPES.JSON: {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return fail('policy_value_type_mismatch', `${key} must be an object`);
      }
      return ok(value);
    }
    default:
      return fail('unknown_policy_type', `${key} has unsupported type "${def.type}"`);
  }
}

function checkRange(key, value, bounds = {}) {
  if (bounds.min != null && value < bounds.min) {
    return fail('policy_value_out_of_bounds', `${key} must be at least ${bounds.min}`);
  }
  if (bounds.max != null && value > bounds.max) {
    return fail('policy_value_out_of_bounds', `${key} must be at most ${bounds.max}`);
  }
  return ok(value);
}

/**
 * Validate the catalogue itself. Run in CI: a malformed key definition is a
 * deploy-time error, never a runtime surprise in a pricing path.
 *
 * @param {Array} keys
 * @returns {string[]} problems; empty means valid
 */
export function validateCatalog(keys) {
  const problems = [];
  const seen = new Set();

  for (const def of keys) {
    const at = def.key || '(unnamed)';
    if (!def.key) problems.push('a key has no id');
    else if (seen.has(def.key)) problems.push(`duplicate key "${def.key}"`);
    seen.add(def.key);

    if (!def.domain) problems.push(`${at}: no domain`);
    if (!def.description) problems.push(`${at}: no description`);
    if (!def.owner) problems.push(`${at}: no owner`);
    if (!def.scope) problems.push(`${at}: no scope`);
    if (!Object.values(TYPES).includes(def.type)) problems.push(`${at}: bad type "${def.type}"`);
    if (!Array.isArray(def.audience)) problems.push(`${at}: audience must be an array`);

    // The key's own declared fallback must satisfy its own declared bounds,
    // or the fallback path fails exactly when the Registry is already down.
    if (def.fallback !== null && def.fallback !== undefined) {
      const r = validateValue(def.key, def.fallback);
      if (!r.ok) problems.push(`${at}: fallback fails its own bounds — ${r.error.message}`);
    }

    // Same for the clause expectation: a mistyped expectation would generate a
    // permanent false conflict that nobody can close.
    if (def.clauseExpectation !== null && def.clauseExpectation !== undefined) {
      const r = validateValue(def.key, def.clauseExpectation);
      if (!r.ok) problems.push(`${at}: clauseExpectation fails its own bounds — ${r.error.message}`);
      if (!def.clause) problems.push(`${at}: has a clauseExpectation but names no clause`);
    }

    if (def.type === TYPES.ENUM && !(def.bounds?.values?.length > 0)) {
      problems.push(`${at}: enum with no permitted values`);
    }
  }

  return problems;
}
