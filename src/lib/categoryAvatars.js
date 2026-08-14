// Category avatar artwork (Urban-Company-style tiles) + soft tile tints.
// Images live in public/img/categories/<slug>.webp, keyed by category slug.

export const CATEGORY_AVATAR = {
  'beauty-wellness-women': '/img/categories/beauty-wellness-women.webp',
  'mens-grooming-massage': '/img/categories/mens-grooming-massage.webp',
  cleaning: '/img/categories/cleaning.webp',
  'pest-control': '/img/categories/pest-control.webp',
  'ac-services': '/img/categories/ac-services.webp',
  'appliance-repair': '/img/categories/appliance-repair.webp',
  electrician: '/img/categories/electrician.webp',
  plumbing: '/img/categories/plumbing.webp',
  carpenter: '/img/categories/carpenter.webp',
  'painting-renovation': '/img/categories/painting-renovation.webp',
  'handyman-installation': '/img/categories/handyman-installation.webp',
  'instant-help': '/img/categories/instant-help.webp',
};

// Tile background.
//
// The design system uses ONE treatment for every category tile — the soft brand
// gradient (--grad-brand-soft) — not a pastel per category. A rainbow of
// decorative pastels is exactly what the blue system replaces, and orange in
// particular is now reserved for Instant Help, warnings and emergencies.
//
// Instant Help is the single sanctioned exception: it is category 12, and the
// system gives it the orange gradient so it reads as a separate lane.
//
// The per-accent map is kept only so seeded `accent` values still resolve;
// every entry now points at the same brand-soft tile.
const BRAND_SOFT = 'bg-grad-brand-soft';

export const CATEGORY_TINT = {
  pink: BRAND_SOFT, slate: BRAND_SOFT, emerald: BRAND_SOFT, lime: BRAND_SOFT,
  sky: BRAND_SOFT, orange: BRAND_SOFT, amber: BRAND_SOFT, blue: BRAND_SOFT,
  stone: BRAND_SOFT, violet: BRAND_SOFT, teal: BRAND_SOFT, red: BRAND_SOFT,
};

export const avatarFor = (slug) => CATEGORY_AVATAR[slug] || null;

export const tintFor = (accent, slug) =>
  slug === 'instant-help' ? 'bg-grad-instant' : (CATEGORY_TINT[accent] || BRAND_SOFT);
