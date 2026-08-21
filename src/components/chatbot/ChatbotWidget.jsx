import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import { useChatbot } from '@/hooks/useChatbot';
import { ChatPanel } from './ChatPanel';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/useTranslation';

/**
 * The chat entry point.
 *
 * Two shapes from one component: a floating bubble for consumers (full-screen on
 * a phone, a panel on a desktop) and a docked side panel for partners, who are
 * usually on a job and want it beside the work rather than over it.
 *
 * The conversation is created lazily on the first message, not on mount — a
 * bubble sitting unopened on every page should not be creating rows.
 */
export function ChatbotWidget({
  role = 'consumer',
  mode = 'assistant',
  variant = 'floating', // floating | docked
  title,
  className,
}) {
  const { t, lang } = useTranslation();
  const [open, setOpen] = useState(false);
  // The conversation locale is sent as the `explicit` locale, which outranks
  // Accept-Language in resolveLocale. Left unset it defaulted to 'en' and
  // overrode the Malay header for the whole conversation — answers localized,
  // the greeting did not. Reuses the existing language context; no second
  // chatbot locale mechanism.
  const chat = useChatbot({ role, mode, locale: lang });

  // Escape closes, which is the one keyboard behaviour people try without being
  // told.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const panelTitle = title || (role === 'partner' ? t('Partner Assistant') : t('ServisAku Assistant'));

  if (variant === 'docked') {
    return (
      <div className={cn('flex h-full w-full flex-col rounded-xl border border-hairline', className)}>
        <ChatPanel chat={chat} title={panelTitle} />
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className={cn(
              'fixed z-50 overflow-hidden border border-hairline bg-surface shadow-xl',
              // Full screen on a phone: a 340px panel on a 360px viewport is a
              // worse experience than the page it is covering.
              'inset-0 rounded-none',
              'sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(600px,calc(100vh-8rem))] sm:w-[380px] sm:rounded-2xl',
            )}
            role="dialog"
            aria-label={panelTitle}
          >
            <ChatPanel chat={chat} title={panelTitle} onClose={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? t('Close assistant') : t('Open assistant')}
        aria-expanded={open}
        className={cn(
          'fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full',
          'bg-brand text-brand-ink shadow-lg transition-transform hover:scale-105',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ring-offset-bg',
          // Clear of the bottom nav on mobile, normal spacing on desktop.
          'sm:bottom-6 sm:right-6',
          open && 'sm:flex hidden',
          className,
        )}
      >
        <MessageCircle className="h-5 w-5" />
        {chat.ticket && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full shadow-[inset_0_0_0_1px_rgb(var(--hairline))] border-background bg-warning" />
        )}
      </button>
    </>
  );
}

export default ChatbotWidget;
