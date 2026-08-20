import { AlertCircle, Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/useTranslation';

/**
 * One turn in the transcript.
 *
 * Timestamps are on hover/long-press only — a time against every bubble turns a
 * conversation into a log, and nobody reads it that way.
 */
export function ChatMessage({ message }) {
  const { t, locale } = useTranslation();
  const isUser = message.sender === 'user';
  const isSystem = message.sender === 'system';

  if (isSystem) {
    return (
      <div className="my-3 px-3">
        <div className="rounded-lg border border-brand/30 bg-brand-tint px-3 py-2 text-sm text-ink">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex w-full gap-2 px-3 py-1.5', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
          <Bot className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
      )}

      <div className={cn('max-w-[85%] space-y-1', isUser && 'items-end')}>
        {message.attachments?.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-hairline">
            {message.attachments.map((a, i) => (
              a.url ? (
                <img
                  key={a.uploadId || i}
                  src={a.url}
                  alt={t('Attached photo')}
                  className="max-h-48 w-auto object-cover"
                />
              ) : null
            ))}
          </div>
        )}

        {message.content && (
          <div
            title={new Date(message.createdAt).toLocaleString(locale)}
            className={cn(
              'whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
              isUser
                ? 'rounded-br-sm bg-brand text-brand-ink'
                : 'rounded-bl-sm bg-raised text-ink',
              message.pending && 'opacity-60',
              message.failed && 'border border-danger/40',
            )}
          >
            {message.content}
          </div>
        )}

        {message.failed && (
          <p className="flex items-center gap-1 text-xs text-danger">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />{t('Not sent — tap to retry')}</p>
        )}
      </div>

      {isUser && (
        <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-raised text-ink-secondary">
          <User className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

/** Shown only after a delay — see TYPING_DELAY_MS in lib/chatbot/state.js. */
export function TypingIndicator({ slow }) {
  const { t, locale } = useTranslation();
  return (
    <div className="flex items-center gap-2 px-3 py-2" aria-live="polite">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-tint text-brand">
        <Bot className="h-3.5 w-3.5" aria-hidden="true" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-raised px-3 py-2.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-tertiary/60 motion-reduce:animate-none"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
      {slow && <span className="text-xs text-ink-secondary">{t('Still working on that…')}</span>}
    </div>
  );
}

export function DaySeparator({ day }) {
  const { locale } = useTranslation();
  const label = new Date(day).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="my-2 flex items-center gap-2 px-3">
      <div className="h-px flex-1 bg-hairline" />
      <span className="text-[11px] uppercase tracking-wide text-ink-secondary">{label}</span>
      <div className="h-px flex-1 bg-hairline" />
    </div>
  );
}

export default ChatMessage;
