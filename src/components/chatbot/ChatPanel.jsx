import { useEffect, useRef } from 'react';
import { AlertTriangle, Headphones, Languages, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { groupByDay } from '@/lib/chatbot/state';
import { ChatMessage, DaySeparator, TypingIndicator } from './ChatMessage';
import { ChatComposer } from './ChatComposer';
import { cn } from '@/lib/utils';

/** Quick replies. They disappear on tap or as soon as the user types. */
function QuickReplies({ options, onPick, disabled }) {
  if (!options?.length) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]{display:none}">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onPick(o)}
          className={cn(
            'shrink-0 rounded-full border border-brand/30 bg-brand-tint px-3 py-1.5 text-xs font-medium text-brand',
            'transition-colors hover:bg-brand-tint disabled:opacity-50',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A proposed action.
 *
 * The consequence is stated in full, and Confirm is never the focused control —
 * a destructive default is how the wrong thing gets tapped on a phone.
 */
function ActionCard({ card, actionable, onConfirm, onDecline }) {
  if (!card) return null;
  const settled = card.status && card.status !== 'pending';

  return (
    <div className={cn(
      'mx-3 mb-2 rounded-xl border p-3',
      card.destructive ? 'border-danger/40 bg-danger-tint' : 'border-hairline bg-raised/60',
    )}
    >
      <p className="text-sm font-medium text-ink">{card.summary}</p>
      {settled ? (
        <p className="mt-2 text-xs capitalize text-ink-secondary">{card.status}</p>
      ) : (
        <div className="mt-2.5 flex gap-2">
          <Button type="button" size="sm" variant="outline" className="flex-1" onClick={onDecline} disabled={!actionable}>
            Not now
          </Button>
          <Button
            type="button"
            size="sm"
            variant={card.destructive ? 'destructive' : 'primary'}
            className="flex-1"
            onClick={onConfirm}
            disabled={!actionable}
          >
            {card.confirmLabel || 'Confirm'}
          </Button>
        </div>
      )}
    </div>
  );
}

/** "Step 2 of 4" — a diagnostic with no visible end feels like an interrogation. */
function TreeProgress({ tree }) {
  if (!tree?.of) return null;
  return (
    <div className="flex items-center gap-2 px-3 pb-1.5">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-raised">
        <div
          className="h-full rounded-full bg-brand transition-all"
          style={{ width: `${Math.min(100, (tree.step / tree.of) * 100)}%` }}
        />
      </div>
      <span className="text-[11px] text-ink-secondary">Step {tree.step} of {tree.of}</span>
    </div>
  );
}

export function ChatPanel({ chat, title = 'ServisAku Assistant', onClose, className }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.messages.length, chat.typing]);

  const groups = groupByDay(chat.messages);

  return (
    <div className={cn('flex h-full flex-col overflow-hidden bg-surface', className)}>
      <header className="flex items-center gap-2 border-b border-hairline px-3 py-2.5">
        <h2 className="flex-1 truncate text-sm font-semibold">{title}</h2>

        <button
          type="button"
          onClick={() => chat.setLocale(chat.locale === 'en' ? 'ms' : 'en')}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-secondary hover:bg-raised"
          aria-label="Switch language"
        >
          <Languages className="h-3.5 w-3.5" />
          {chat.locale === 'en' ? 'EN' : 'BM'}
        </button>

        <button type="button" onClick={chat.reset} className="rounded-md p-1.5 text-ink-secondary hover:bg-raised" aria-label="Start a new conversation">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>

        {onClose && (
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ink-secondary hover:bg-raised" aria-label="Close chat">
            <X className="h-4 w-4" />
          </button>
        )}
      </header>

      {chat.ticket && (
        <div className="flex items-center gap-2 border-b border-hairline bg-brand-tint px-3 py-2">
          <Headphones className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <p className="flex-1 text-xs text-ink">
            Ticket <span className="font-medium">#{chat.ticket.reference}</span> is with our support team.
          </p>
        </div>
      )}

      {/* Live region: a screen reader should hear the reply, not just see it. */}
      <div className="flex-1 overflow-y-auto py-2" role="log" aria-live="polite" aria-label="Conversation">
        {groups.map((group) => (
          <div key={group.day}>
            <DaySeparator day={group.day} />
            {group.messages.map((m) => <ChatMessage key={m.id} message={m} />)}
          </div>
        ))}
        {chat.typing && <TypingIndicator slow={chat.slow} />}
        <div ref={endRef} />
      </div>

      {chat.error && (
        <div className="flex items-center gap-2 border-t border-danger/40 bg-danger-tint px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="flex-1 text-xs text-danger">{chat.error}</p>
        </div>
      )}

      <TreeProgress tree={chat.tree} />

      <ActionCard
        card={chat.actionCard}
        actionable={chat.actionable}
        onConfirm={chat.confirmAction}
        onDecline={chat.declineAction}
      />

      <QuickReplies options={chat.quickReplies} onPick={chat.sendQuickReply} disabled={chat.busy} />

      {/* "Talk to a human" is a persistent control, not something you have to
          know to type. Burying it is what makes people distrust a bot. */}
      {chat.offerHuman && (
        <div className="px-3 pb-2">
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => chat.escalate('user_requested')}>
            <Headphones className="mr-1.5 h-3.5 w-3.5" />
            Talk to a person
          </Button>
        </div>
      )}

      <ChatComposer
        draft={chat.draft}
        onDraftChange={chat.setDraft}
        onSend={chat.send}
        onAttach={chat.attach}
        onClearAttachment={chat.clearAttachment}
        onTranscribe={chat.transcribe}
        disabled={chat.composerDisabled}
        busy={chat.busy}
        attachment={chat.attachment}
      />
    </div>
  );
}

export default ChatPanel;
