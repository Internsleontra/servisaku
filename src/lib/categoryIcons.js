import {
  Scissors, UserRound, SprayCan, Bug, AirVent, WashingMachine,
  Zap, Wrench, Hammer, PaintRoller, Drill, House,
} from 'lucide-react';

/**
 * Category → Lucide glyph. FIXED by the design system (readme.md § Iconography):
 * "Category glyph mapping is fixed" — do not improvise a glyph for a new slug,
 * add it to the design system first.
 *
 * Keyed by the seeded category slug from prisma/data/servisaku-services-config.json.
 */
export const CATEGORY_ICON = {
  'beauty-wellness-women': Scissors,
  'mens-grooming-massage': UserRound,
  cleaning: SprayCan,
  'pest-control': Bug,
  'ac-services': AirVent,
  'appliance-repair': WashingMachine,
  electrician: Zap,
  plumbing: Wrench,
  carpenter: Hammer,
  'painting-renovation': PaintRoller,
  'handyman-installation': Drill,
  'instant-help': Zap,
};

export const iconFor = (slug) => CATEGORY_ICON[slug] || House;
