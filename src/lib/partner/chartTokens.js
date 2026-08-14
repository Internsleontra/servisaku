/**
 * Chart colours derived from design-system tokens.
 *
 * Recharts paints SVG attributes and cannot take Tailwind classes, so chart
 * colour has to be a literal string. Previously the partner charts hardcoded
 * their own: `PartnerAnalytics` declared `const BRAND = 'hsl(24 95% 53%)'` —
 * ORANGE, a pre-rebrand leftover — and the tracks/labels used Tailwind default
 * greys (#e5e7eb, #9ca3af, #171a1c) instead of the navy-tinted neutrals.
 *
 * These read the real tokens off :root at call time, so charts follow the same
 * source of truth as everything else. Orange stays reserved for Instant Help
 * and warnings and is deliberately NOT exported as a chart colour.
 *
 * Tokens are bare sRGB channels ("0 0 238"), so they are wrapped in rgb().
 */

/** Fallbacks match tokens.css light mode; used during SSR and before paint. */
const FALLBACK = {
  '--brand': '0 0 238',
  '--surface-raised': '241 243 250',
  '--ink-secondary': '90 100 130',
  '--ink-primary': '2 2 43',
  '--hairline': '228 230 240',
  '--success': '16 158 87',
};

function token(name, alpha) {
  let raw = '';
  if (typeof window !== 'undefined' && typeof getComputedStyle === 'function') {
    raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  const channels = raw || FALLBACK[name] || '0 0 0';
  return alpha == null ? `rgb(${channels})` : `rgb(${channels} / ${alpha})`;
}

/**
 * Chart palette. Call inside render so a theme change is picked up rather than
 * frozen at module-eval time.
 */
export function chartColors() {
  return {
    /** The highlighted / current series bar. */
    brand: token('--brand'),
    /** Non-highlighted bars — the "track" tone. */
    track: token('--surface-raised'),
    /** Axis tick labels. */
    axis: token('--ink-secondary'),
    /** Tooltip body text. */
    tooltipInk: token('--ink-primary'),
    /** Grid / separator lines. */
    grid: token('--hairline'),
    /** Positive deltas only — never as a generic accent. */
    positive: token('--success'),
  };
}

/** Shared Recharts tooltip style, matching card elevation and radius tokens. */
export function chartTooltipStyle() {
  const c = chartColors();
  return {
    borderRadius: 14, // --radius-field
    border: 'none',
    boxShadow: '0 2px 4px rgba(4,4,74,0.04), 0 8px 20px rgba(4,4,74,0.08)', // e2
    fontSize: 12,
    color: c.tooltipInk,
  };
}
