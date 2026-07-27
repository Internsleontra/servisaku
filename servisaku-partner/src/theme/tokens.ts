// ServisAku design tokens — the RN counterpart of the web's tokens.css.
// Single source of colour/spacing/radius for the Expo app.

export const colors = {
  brand: '#f97316',        // orange (web --brand 24 95% 53%)
  brandInk: '#9a3412',     // deep orange
  brandTint: '#fff7ed',    // light orange wash
  brandTintStrong: '#ffedd5',

  bg: '#fbfaf7',
  surface: '#ffffff',
  raised: '#f4f4f5',
  hairline: '#e5e7eb',

  ink: '#171a1c',
  inkSecondary: '#52606d',
  inkTertiary: '#9aa5b1',
  inkInverse: '#ffffff',

  success: '#059669',
  successTint: '#ecfdf5',
  danger: '#dc2626',
  dangerTint: '#fef2f2',
  warning: '#d97706',
  warningTint: '#fffbeb',
  amber: '#f59e0b',

  // gradient stops for headers (brand-ink → brand)
  gradientFrom: '#7c2d12',
  gradientTo: '#fb923c',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24 } as const;

export const font = {
  size: { xs: 11, sm: 13, base: 15, lg: 18, xl: 22, '2xl': 28, '3xl': 32 },
  weight: { medium: '500', semibold: '600', bold: '700', extrabold: '800' },
} as const;

export const shadow = {
  e1: {
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  e2: {
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 }, elevation: 5,
  },
} as const;

// Loyalty tier accents (badge bg + fg).
export const tierColors = {
  Bronze:   { bg: '#f5e9df', fg: '#8a5a2b' },
  Silver:   { bg: '#eceef0', fg: '#5b6673' },
  Gold:     { bg: '#fdf3d6', fg: '#a8791b' },
  Platinum: { bg: '#e8eef2', fg: '#3f5568' },
  Diamond:  { bg: '#e6f1fb', fg: '#1f6fb2' },
} as const;
export type TierName = keyof typeof tierColors;

// Motion tokens (durations in ms).
export const motion = {
  micro: 150,
  standard: 250,
  modal: 400,
} as const;

// Minimum accessible touch target.
export const HIT = 44;
