/**
 * ServisAku design-system primitives, ported to Tailwind + tokens.
 *
 * Source of truth: .claude/skills/servisaku-design/components/**
 * These replace one-off implementations across the app. If a page needs a
 * variation, extend the primitive here rather than forking it inline.
 *
 * Two system rules are baked in and must not be undone at call sites:
 *   1. Never `border` + `shadow` on one element — borders are INSET RINGS.
 *   2. Selection thickens the ring to 1.5px brand; it never swaps to border-2,
 *      so a selected control never shifts by a pixel.
 */
import { Star, Clock, Check, CheckCheck, Lock, TicketPercent, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export const RING = 'shadow-[inset_0_0_0_1px_rgb(var(--hairline))]';
export const RING_BRAND = 'shadow-[inset_0_0_0_1.5px_rgb(var(--brand))]';

/* ── Card ──────────────────────────────────────────────────────────────── */
export function Card({ variant = 'base', className, children, ...rest }) {
  return (
    <div
      className={cn(
        'rounded-card',
        variant === 'base' && 'bg-surface shadow-e1',
        variant === 'raised' && 'bg-surface shadow-e2',
        variant === 'outline' && cn('bg-surface', RING),
        variant === 'glass' && 'bg-white/10 ring-1 ring-inset ring-white/[0.16] backdrop-blur',
        variant === 'brand' && 'bg-grad-brand text-white',
        variant === 'night' && 'bg-grad-night text-white',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ── Chip ──────────────────────────────────────────────────────────────── */
export function Chip({ icon: Icon, selected, className, children, ...rest }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-caption transition-colors md:min-h-0 md:py-1.5',
        selected ? cn('bg-brand-tint text-brand', RING_BRAND) : cn('bg-surface text-ink-secondary hover:bg-raised', RING),
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className="size-3.5" />}
      {children}
    </button>
  );
}

/* ── StarRating ────────────────────────────────────────────────────────── */
export function StarRating({ value = 0, count, showValue = true, className }) {
  const full = Math.round(value);
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={cn('size-3.5', i <= full ? 'fill-star text-star' : 'text-ink-tertiary')}
          />
        ))}
      </span>
      {showValue && value > 0 && <span className="sa-num text-xs text-ink">{value}</span>}
      {count != null && (
        <span className="sa-num text-xs text-ink-tertiary">({count.toLocaleString()})</span>
      )}
    </span>
  );
}

/* ── SegmentedTabs (underline) ─────────────────────────────────────────── */
export function SegmentedTabs({ items = [], value, onChange, className }) {
  return (
    <div className={cn('flex gap-6 shadow-[inset_0_-1px_0_rgb(var(--hairline))]', className)}>
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange?.(it.id)}
            className={cn(
              '-mb-px pb-3 text-caption transition-colors',
              active
                ? 'border-b-2 border-brand text-brand'
                : 'border-b-2 border-transparent text-ink-secondary hover:text-ink',
            )}
          >
            {/* dual-field-exempt: design-system primitive; the caller supplies a resolved label */}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── CategoryTile ──────────────────────────────────────────────────────── */
/* `image` takes precedence over `icon`: when category artwork exists it is shown
   bare, because the artwork carries an opaque white background and would read as
   a white square if dropped inside the tinted glyph box. The Lucide glyph stays
   as the fallback for any category without artwork. */
export function CategoryTile({ label, icon: Icon, image, count, tone = 'soft', className, ...rest }) {
  const dark = tone === 'dark';
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-[104px] w-full flex-col items-start justify-between gap-3 rounded-md p-3.5 text-left transition hover:-translate-y-0.5',
        dark ? 'bg-grad-deep text-white shadow-e2' : cn('bg-surface text-ink', RING),
        className,
      )}
      {...rest}
    >
      {image ? (
        <img
          src={image}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="size-14 shrink-0 rounded-sm object-contain"
        />
      ) : (
        <span
          className={cn(
            'grid size-10 place-items-center rounded-sm',
            dark ? 'bg-white/[0.14] text-live' : 'bg-grad-brand-soft text-brand-ink',
          )}
        >
          {Icon && <Icon className="size-[22px]" />}
        </span>
      )}
      <span>
        <span className="block font-display text-caption font-semibold leading-tight">{label}</span>
        {count != null && (
          <span className={cn('sa-num text-micro', dark ? 'text-white/60' : 'text-ink-tertiary')}>
            {count} services
          </span>
        )}
      </span>
    </button>
  );
}

/* ── ServiceCard ───────────────────────────────────────────────────────── */
export function ServiceCard({
  name, category, price, strikePrice, unit, rating, ratingCount, duration,
  icon: Icon, image, badge, layout = 'row', onOpen, className,
}) {
  const tile = (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-md bg-grad-brand-soft',
        layout === 'row' ? 'size-[84px]' : 'h-[116px] w-full',
      )}
    >
      {image ? (
        <img src={image} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center text-brand-ink">
          {Icon && <Icon className={layout === 'row' ? 'size-7' : 'size-8'} />}
        </span>
      )}
      {badge && (
        <span className="sa-caps absolute left-2 top-2 rounded-full bg-grad-brand px-2 py-0.5 text-white">
          {badge}
        </span>
      )}
    </div>
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex gap-3 rounded-card bg-surface p-3.5 text-left shadow-e1 transition hover:-translate-y-0.5 hover:shadow-e2',
        layout === 'row' ? 'flex-row items-center' : 'flex-col',
        className,
      )}
    >
      {tile}
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        {category && <span className="sa-caps text-ink-tertiary">{category}</span>}
        <span className="font-display text-h4 font-semibold leading-snug text-ink">{name}</span>
        <span className="flex flex-wrap items-center gap-2.5">
          {rating != null && <StarRating value={rating} count={ratingCount} />}
          {duration && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-secondary">
              <Clock className="size-3.5" /> {duration}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex items-baseline gap-2">
          <span className="sa-num text-lead font-semibold text-ink">{price}</span>
          {strikePrice && (
            <span className="sa-num text-caption text-ink-tertiary line-through">{strikePrice}</span>
          )}
          {unit && <span className="text-xs text-ink-tertiary">{unit}</span>}
        </span>
      </span>
    </button>
  );
}

/* ── PriceSummary ──────────────────────────────────────────────────────── */
export function PriceSummary({ lines = [], total, totalLabel = 'Total payable', note, className }) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
        {/* dual-field-exempt: design-system primitive; the caller supplies a resolved label */}
      {lines.map((l, i) => (
        <div key={`${l.label}-${i}`} className="flex items-center gap-2 text-caption font-normal">
          <span
            className={cn(
              'inline-flex items-center gap-1.5',
              l.tone === 'discount' ? 'text-success' : 'text-ink-secondary',
            )}
          >
            {l.tone === 'discount' && <TicketPercent className="size-3.5" />}
            {/* dual-field-exempt: design-system primitive; the caller supplies a resolved label */}
            {l.label}
          </span>
          <span
            className={cn('sa-num ml-auto', l.tone === 'discount' ? 'text-success' : 'text-ink')}
          >
            {l.value}
          </span>
        </div>
      ))}
      {/* Dashed rule above a total is the one place the system allows dashes. */}
      <div className="flex items-center gap-2 border-t border-dashed border-hairline pt-2.5">
        <span className="font-display text-md font-semibold text-ink">{totalLabel}</span>
        <span className="sa-num ml-auto text-h3 font-semibold text-ink">{total}</span>
      </div>
      {note && (
        <div className="flex gap-1.5 text-xs text-ink-tertiary">
          <Lock className="mt-px size-3 shrink-0" />
          {note}
        </div>
      )}
    </div>
  );
}

/* ── TimeSlotPicker ────────────────────────────────────────────────────── */
export function TimeSlotPicker({ days = [], slots = [], day, slot, onDayChange, onSlotChange, className }) {
  return (
    <div className={cn('flex flex-col gap-3.5', className)}>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => {
          const active = d.id === day;
          return (
            <button
              key={d.id}
              type="button"
              disabled={d.full}
              onClick={() => onDayChange?.(d.id)}
              className={cn(
                'w-[62px] flex-none rounded-md py-2.5 transition disabled:cursor-not-allowed disabled:opacity-40',
                active ? 'bg-grad-brand text-white shadow-brand' : cn('bg-surface text-ink', RING),
              )}
            >
              <span className="sa-caps block opacity-70">{d.dow}</span>
              <span className="sa-num block text-xl font-semibold leading-tight">{d.date}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {slots.map((s) => {
          const active = s.id === slot;
          return (
            <button
              key={s.id}
              type="button"
              disabled={s.full}
              onClick={() => onSlotChange?.(s.id)}
              className={cn(
                'h-11 rounded-sm text-caption transition disabled:cursor-not-allowed',
                s.full && 'text-ink-tertiary line-through',
                active
                  ? cn('bg-brand-tint text-brand-ink', RING_BRAND)
                  : cn('bg-surface text-ink', RING),
              )}
            >
              {/* dual-field-exempt: design-system primitive; the caller supplies a resolved label */}
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Inclusion / exclusion list row ────────────────────────────────────── */
export function CheckRow({ tone = 'include', children }) {
  const Icon = tone === 'include' ? Check : undefined;
  return (
    <div className="flex gap-2 text-caption font-normal text-ink">
      {tone === 'include' ? (
        <Check className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <span className="mt-0.5 grid size-4 shrink-0 place-items-center text-danger">×</span>
      )}
      {children}
    </div>
  );
}

/* ── Button ────────────────────────────────────────────────────────────────
   Port of the design system's core/Button (components/core/Button.jsx).

   Sizes and variants match the spec exactly: sm 36 / md 44 / lg 52, primary on
   the brand gradient with the brand glow, outline as a 1.5px inset ring (never
   a border), press = scale(0.97), hover = brightness(0.94) with no hue change.

   Replaces `@/components/ui/button` incrementally — migrate call sites as each
   page is rebuilt, not in one sweep (button has fan-in 27).
--------------------------------------------------------------------------- */
const BTN_SIZES = {
  sm: 'h-9 px-3.5 text-caption gap-1.5',
  md: 'h-11 px-5 text-md gap-2',
  lg: 'h-13 px-6 text-lead gap-2.5',
};

const BTN_VARIANTS = {
  primary: 'bg-grad-brand text-white shadow-brand',
  solid: 'bg-brand text-white',
  secondary: 'bg-brand-tint text-brand-ink',
  outline: `bg-transparent text-brand ${RING_BRAND}`,
  ghost: 'bg-transparent text-ink hover:bg-raised',
  instant: 'bg-grad-instant text-white shadow-instant',
  inverse: 'bg-white/[0.12] text-white ring-1 ring-inset ring-white/[0.16]',
  danger: 'bg-danger text-white',
};

export function Button({
  children, variant = 'primary', size = 'md', block, disabled, loading,
  type = 'button', className, ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'items-center justify-center rounded-field font-display font-semibold whitespace-nowrap',
        'transition duration-150 hover:brightness-[0.94] active:scale-[0.97]',
        // The kit applies --focus-ring globally via `button:focus-visible`
        // (tokens/base.css). That rule was never ported, so this component had
        // no focus treatment at all and fell back to the raw browser outline.
        // Scoped here rather than re-added globally to keep the change to buttons.
        // `shadow-[shadow:…]` type hint is required: without it Tailwind reads a
        // bare var() as a shadow COLOR and emits --tw-shadow-color, which renders
        // no ring at all on variants that carry no shadow.
        'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]',
        'disabled:cursor-not-allowed disabled:opacity-[0.42] disabled:hover:brightness-100 disabled:active:scale-100',
        block ? 'flex w-full' : 'inline-flex',
        BTN_SIZES[size] || BTN_SIZES.md,
        BTN_VARIANTS[variant] || BTN_VARIANTS.primary,
        className,
      )}
      {...rest}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/* ── ChatBubble ────────────────────────────────────────────────────────────
   Port of patterns/ChatBubble.jsx. Tail geometry is asymmetric by design: the
   corner nearest the sender is 4px, the rest are radius-md. Incoming bubbles
   carry an inset ring (never a border + shadow); outgoing are solid brand.
--------------------------------------------------------------------------- */
export function ChatBubble({ from = 'them', time, status, pending, className, children }) {
  if (from === 'system') {
    return (
      <div className={cn('self-center rounded-full bg-raised px-3 py-1.5 text-xs text-ink-secondary', className)}>
        {children}
      </div>
    );
  }
  const mine = from === 'me';
  return (
    <div
      className={cn(
        'max-w-[78%] px-3.5 py-2.5 text-md leading-normal',
        mine
          ? 'self-end rounded-[14px] rounded-br-[4px] bg-brand text-white'
          : cn('self-start rounded-[14px] rounded-bl-[4px] bg-surface text-ink', RING),
        pending && 'opacity-70',
        className,
      )}
    >
      {children}
      {(time || status) && (
        <span
          className={cn(
            'mt-1 flex items-center justify-end gap-1 text-micro',
            mine ? 'text-white/70' : 'text-ink-tertiary',
          )}
        >
          <span className="sa-num">{time}</span>
          {status === 'read' ? <CheckCheck className="size-3" /> : status === 'sent' ? <Check className="size-3" /> : null}
        </span>
      )}
    </div>
  );
}
