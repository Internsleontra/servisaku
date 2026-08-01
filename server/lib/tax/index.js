// ─────────────────────────────────────────────────────────────────────────────
// Malaysian SST (service tax).
//
// Before this module the rate was a literal in two places with two different
// answers: 0.08 in server/lib/dynamicPricing.js and 0.06 in
// src/lib/paymentEngine.js — and the front-end 6% was what customers actually
// saw at checkout. The rate is now data, read from TaxConfig, with the code
// default only as a fallback for a deployment that has not seeded one yet.
//
// Two distinct taxable supplies, deliberately kept separate:
//   SST_SERVICE     ServisAku → customer, on the service fee
//   SST_COMMISSION  ServisAku → partner, on the commission (itself a service)
//
// Rate history matters: a booking priced under a 6% regime must invoice at 6%
// forever. `activeConfig(code, at)` resolves the rate that was in force at a
// given instant, and invoices read the snapshot rather than recomputing.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from '../../db.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Malaysian service tax rose from 6% to 8% for most taxable services on
// 2024-03-01. Used only when no TaxConfig row covers the requested instant.
export const FALLBACK_RATE = 0.08;
export const TAX_CODES = Object.freeze({ SERVICE: 'SST_SERVICE', COMMISSION: 'SST_COMMISSION' });

// Small in-process cache: this is read on every price quote and changes rarely.
// Keyed by code; invalidated whenever a config is written.
const cache = new Map();
export function clearTaxCache() { cache.clear(); }

/**
 * The tax configuration in force for `code` at instant `at`.
 * Returns null when nothing is configured — callers fall back to FALLBACK_RATE.
 */
export async function activeConfig(code = TAX_CODES.SERVICE, at = new Date()) {
  const cacheKey = `${code}:${at.getFullYear()}-${at.getMonth()}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const config = await prisma.taxConfig.findFirst({
    where: {
      code,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });
  cache.set(cacheKey, config);
  return config;
}

/** The rate in force, falling back to FALLBACK_RATE when unconfigured. */
export async function activeRate(code = TAX_CODES.SERVICE, at = new Date()) {
  const config = await activeConfig(code, at);
  return config?.rate ?? FALLBACK_RATE;
}

/**
 * Whether a given service is taxable. Service.sstEnabled is the per-service
 * switch that already exists; TaxConfig.appliesTo can narrow further by
 * category/service slug (null = every taxable supply).
 */
export function isServiceTaxable(service, config) {
  if (!service?.sstEnabled) return false;
  const appliesTo = config?.appliesTo;
  if (!Array.isArray(appliesTo) || appliesTo.length === 0) return true;
  return appliesTo.includes(service.slug) || appliesTo.includes(service.categoryId);
}

/**
 * Compute SST on a base amount.
 *
 * Exclusive (the default, and what the pricing engine does): tax is added on
 * top — tax = base × rate.
 * Inclusive: the base already contains the tax — tax = base × rate / (1 + rate).
 * Getting this backwards over- or under-charges by the rate itself, so the mode
 * is explicit rather than inferred.
 *
 * @returns {{ base, rate, tax, total, inclusive }} all MYR, 2dp
 */
export function calcSst(base, rate, { inclusive = false } = {}) {
  const b = round2(base);
  const r = Number(rate) || 0;
  if (b <= 0 || r <= 0) return { base: b, rate: r, tax: 0, total: b, inclusive };

  const tax = inclusive ? round2((b * r) / (1 + r)) : round2(b * r);
  const total = inclusive ? b : round2(b + tax);
  return { base: b, rate: r, tax, total, inclusive };
}

/**
 * The public tax surface for a price quote — what GET /api/tax/config and the
 * pricing endpoints return so the client never hardcodes a rate again.
 */
export async function taxSummary(code = TAX_CODES.SERVICE, at = new Date()) {
  const config = await activeConfig(code, at);
  return {
    code,
    rate: config?.rate ?? FALLBACK_RATE,
    rate_percent: Number(((config?.rate ?? FALLBACK_RATE) * 100).toFixed(2)),
    inclusive: config?.isInclusive ?? false,
    registration_no: config?.registrationNo ?? process.env.SST_REGISTRATION_NO ?? null,
    configured: Boolean(config),
    effective_from: config?.effectiveFrom ?? null,
  };
}

/**
 * Overlay the live SST rate onto a booking-engine global config.
 *
 * server/lib/dynamicPricing.js is deliberately pure — no DB, no Prisma, so it
 * runs identically in unit tests, on the server and in the client. Rather than
 * breaking that by importing Prisma there, the rate is injected by its callers
 * through globalConfig. Falls through unchanged when nothing is configured, so
 * the engine's own default still applies.
 */
export async function withLiveSstRate(globalConfig, at = new Date()) {
  const config = await activeConfig(TAX_CODES.SERVICE, at);
  if (!config) return globalConfig;
  return { ...globalConfig, sstRate: config.rate };
}

/**
 * Supersede the active configuration for a code by closing the current row and
 * opening a new one. Never mutates a historical rate — that would silently
 * rewrite what past invoices should have charged.
 */
export async function supersede(code, { rate, registrationNo, appliesTo, isInclusive, effectiveFrom, notes }) {
  const from = effectiveFrom ? new Date(effectiveFrom) : new Date();
  const result = await prisma.$transaction(async (tx) => {
    await tx.taxConfig.updateMany({
      where: { code, effectiveTo: null },
      data: { effectiveTo: from, isActive: false },
    });
    return tx.taxConfig.create({
      data: {
        code,
        rate,
        registrationNo: registrationNo ?? null,
        appliesTo: appliesTo ?? undefined,
        isInclusive: isInclusive ?? false,
        isActive: true,
        effectiveFrom: from,
        notes: notes ?? null,
      },
    });
  });
  clearTaxCache();
  return result;
}

export { round2 };
