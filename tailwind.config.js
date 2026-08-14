// tailwind.config.js
import animate from 'tailwindcss-animate';

const r = (v) => `${v / 16}rem`; // px → rem

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1.25rem', md: '1.5rem', lg: '2rem' },
      screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1200px', '2xl': '1320px' },
    },
    extend: {
      colors: {
        // Surface system — token-bound, dark-mode swappable.
        // Tokens are bare sRGB channels (see src/styles/tokens.css L3), so the
        // colour function here is rgb(), not hsl(). Changing one without the
        // other silently breaks every alpha modifier in the app.
        bg:       'rgb(var(--bg) / <alpha-value>)',
        surface:  'rgb(var(--surface) / <alpha-value>)',
        raised:   'rgb(var(--surface-raised) / <alpha-value>)',
        hairline: 'rgb(var(--hairline) / <alpha-value>)',

        ink: {
          DEFAULT:   'rgb(var(--ink-primary) / <alpha-value>)',
          secondary: 'rgb(var(--ink-secondary) / <alpha-value>)',
          tertiary:  'rgb(var(--ink-tertiary) / <alpha-value>)',
          inverse:   'rgb(var(--ink-inverse) / <alpha-value>)',
        },

        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          tint:    'rgb(var(--brand-tint) / <alpha-value>)',
          ink:     'rgb(var(--brand-ink) / <alpha-value>)',
        },
        // NOTE: accent is now ORANGE (Instant Help / warning), not a synonym
        // for brand. Primary actions must use `brand`. Phase 3 fixes call sites.
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          tint:    'rgb(var(--accent-tint) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          tint:    'rgb(var(--success-tint) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          tint:    'rgb(var(--warning-tint) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          tint:    'rgb(var(--danger-tint) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--info) / <alpha-value>)',
          tint:    'rgb(var(--info-tint) / <alpha-value>)',
        },
        // Live signal — neon, reserved for "On the way" / "In progress".
        live: 'rgb(var(--live) / <alpha-value>)',
        // Star ratings only — deliberately NOT `warning`.
        star: 'rgb(var(--star) / <alpha-value>)',
        // Chat / conversational — periwinkle, replaces the old violet.
        chat: {
          DEFAULT: 'rgb(var(--chat) / <alpha-value>)',
          tint:    'rgb(var(--chat-tint) / <alpha-value>)',
        },
        // Navy inverse surface — dark bands inside a light page, and the
        // background for live (neon) status pills. Deliberately not theme-
        // swapped: navy stays navy in both themes, per the design system.
        navy: {
          DEFAULT: 'rgb(var(--sa-navy-rgb) / <alpha-value>)',
          ink:     'rgb(var(--sa-navy-ink-rgb) / <alpha-value>)',
        },
      },
      fontFamily: {
        // Outfit leads (team decision, 2026-08-06); Gilroy is shipped in the
        // design system and sits behind it. `inter` is kept as a key only
        // because ~every page still says className="font-inter" — the name is
        // now a misnomer and gets renamed in Phase 2.
        sans:    ['Outfit', 'Gilroy', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        inter:   ['Outfit', 'Gilroy', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        display: ['Outfit', 'Gilroy', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        // Logo lockup ONLY — Gilroy leads here and nowhere else. Do not use
        // `font-brand` for UI copy; see src/styles/typography.css.
        brand:   ['Gilroy', 'Outfit', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        // Navy-tinted, never neutral grey — "light through blue glass".
        e1: '0 1px 2px rgba(4,4,74,0.05), 0 2px 6px rgba(4,4,74,0.06)',
        e2: '0 2px 4px rgba(4,4,74,0.04), 0 8px 20px rgba(4,4,74,0.08)',
        e3: '0 4px 8px rgba(4,4,74,0.05), 0 18px 44px rgba(4,4,74,0.12)',
        float: '0 -8px 40px rgba(4,4,74,0.16)',
        // Reserved for the single primary CTA on a screen.
        brand: '0 8px 24px rgba(0,0,238,0.28)',
        neon: '0 6px 20px rgba(0,231,255,0.35)',
        instant: '0 8px 24px rgba(247,92,3,0.30)',
      },
      backgroundImage: {
        // The gradient IS the brand: neon -> sky -> blue, lit from top-left.
        // Never invert, never add a non-blue stop (instant is the exception).
        'grad-brand': 'linear-gradient(118deg,#00E7FF 0%,#00A4FF 34%,#0000EE 100%)',
        'grad-brand-soft': 'linear-gradient(118deg,#E6FDFF 0%,#E6F6FF 45%,#EEF2FF 100%)',
        'grad-deep': 'linear-gradient(140deg,#04044A 0%,#000675 48%,#0000EE 100%)',
        'grad-night': 'linear-gradient(160deg,#02022B 0%,#04044A 55%,#000675 100%)',
        // Hero: two radial lights (neon top-left, blue top-right) over a navy base.
        'grad-hero': 'radial-gradient(120% 130% at 8% 12%,#00E7FF 0%,transparent 46%),radial-gradient(120% 120% at 92% 8%,#0000EE 0%,transparent 52%),linear-gradient(160deg,#04044A 0%,#02022B 100%)',
        'grad-instant': 'linear-gradient(118deg,#FFA23C 0%,#F75C03 100%)',
        'grad-scrim-bottom': 'linear-gradient(180deg,rgba(2,2,43,0) 0%,rgba(2,2,43,0.72) 100%)',
        'grad-scrim-top': 'linear-gradient(180deg,rgba(2,2,43,0.55) 0%,rgba(2,2,43,0) 100%)',
      },
      borderRadius: {
        card:  '20px',
        field: '14px',
        sheet: '28px',
      },
      height: {
        13: '3.25rem', // 52px
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [animate],
};
