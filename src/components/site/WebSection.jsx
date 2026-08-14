import { cn } from '@/lib/utils';

/**
 * Marketing section wrapper — the structural unit the design system's
 * consumer website is built from (ui_kits/consumer_web/WebShell.jsx).
 *
 * Fixed by the system, do not vary per page:
 *   container   1240px, 32px gutters (20px on mobile)
 *   rhythm      72px vertical padding
 *   header      eyebrow (11px caps) -> display-2 title -> 17px body, max 680px
 *   tones       paper (page) | card (white) | dark (--grad-night)
 *
 * On dark the eyebrow turns neon and body copy drops to 72% white — that
 * contrast pairing is what makes the trust band read as a band rather than a
 * dark rectangle.
 */
export function WebSection({ eyebrow, title, body, tone = 'paper', titleAs: TitleTag = 'h2', className, children }) {
  const dark = tone === 'dark';
  return (
    <section
      className={cn(
        'py-14 md:py-[72px]',
        tone === 'card' && 'bg-surface',
        tone === 'paper' && 'bg-bg',
        dark && 'bg-grad-night text-white',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-[1240px] px-5 md:px-8">
        {(eyebrow || title || body) && (
          <div className="mb-9 max-w-[680px]">
            {eyebrow && (
              <div className={cn('sa-caps mb-2.5', dark ? 'text-live' : 'text-brand')}>{eyebrow}</div>
            )}
            {title && (
              <TitleTag className={cn('text-display-2', dark ? 'text-white' : 'text-ink')}>{title}</TitleTag>
            )}
            {body && (
              <p className={cn('mt-3.5 text-lead', dark ? 'text-white/70' : 'text-ink-secondary')}>
                {body}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

export default WebSection;
