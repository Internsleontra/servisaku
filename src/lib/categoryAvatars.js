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

// Soft pastel tile background per seeded accent.
export const CATEGORY_TINT = {
  pink: 'bg-pink-50', slate: 'bg-raised', emerald: 'bg-emerald-50', lime: 'bg-lime-50',
  sky: 'bg-sky-50', orange: 'bg-orange-50', amber: 'bg-amber-50', blue: 'bg-blue-50',
  stone: 'bg-raised', violet: 'bg-violet-50', teal: 'bg-teal-50', red: 'bg-red-50',
};

export const avatarFor = (slug) => CATEGORY_AVATAR[slug] || null;
export const tintFor = (accent) => CATEGORY_TINT[accent] || 'bg-brand-tint';
