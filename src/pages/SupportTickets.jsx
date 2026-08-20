import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/lib/useTranslation';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LifeBuoy, Send, Star } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { Button } from '@/components/ds';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  PageShell, StatusPill, Card, EmptyState, Loading, Field, inputClass, fmtDate, fmtDateTime,
} from '@/components/records/RecordUI';

/**
 * Support tickets.
 *
 * `/support`         → the customer's tickets
 * `/support?new=1`   → open one
 * `/support?id=xxx`  → the thread
 *
 * Tickets raised by the assistant land here too — it escalates with the whole
 * transcript attached, which is why a customer arriving from chat should not be
 * asked to explain themselves again.
 */
export default function SupportTickets() {
  const [params] = useSearchParams();
  if (params.get('new')) return <NewTicket bookingId={params.get('booking')} />;
  const id = params.get('id');
  if (id) return <TicketThread ticketId={id} />;
  return <TicketList />;
}

const CATEGORIES = [
  { value: 'booking', label: 'A booking' },
  { value: 'payment', label: 'Payment or billing' },
  { value: 'refund', label: 'A refund' },
  { value: 'technical', label: 'The app' },
  { value: 'complaint', label: 'A complaint' },
  { value: 'other', label: 'Something else' },
];

// ─── List ────────────────────────────────────────────────────────────────────

function TicketList() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);

  useEffect(() => {
    servisaku.support.list()
      .then((r) => setItems(Array.isArray(r) ? r : (r.items ?? [])))
      .catch(() => setItems([]));
  }, []);

  return (
    <PageShell
      title={t('Support')}
      action={<Button variant="primary" onClick={() => navigate('/support?new=1')}>{t('New')}</Button>}
    >
      {!items ? <Loading /> : items.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title={t('No tickets')}
          body={t('Ask the assistant first — it resolves most things instantly. If it cannot, it opens a ticket for you with everything already attached.')}
          action={<Button variant="primary" onClick={() => navigate('/support?new=1')}>{t('Open a ticket')}</Button>}
        />
      ) : items.map((ticket) => (
        <Card key={ticket.id} onClick={() => navigate(`/support?id=${ticket.id}`)}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold truncate">{ticket.subject}</p>
              <p className="text-xs text-ink-secondary mt-0.5">
                {ticket.reference ? `${ticket.reference} · ` : ''}{fmtDate(ticket.created_date ?? ticket.createdAt, locale)}
              </p>
            </div>
            <StatusPill status={ticket.status} />
          </div>
        </Card>
      ))}
    </PageShell>
  );
}

// ─── New ─────────────────────────────────────────────────────────────────────

function NewTicket({ bookingId }) {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [category, setCategory] = useState('booking');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (subject.trim().length < 3) return toast.error(t('Give it a short subject'));
    if (message.trim().length < 10) return toast.error(t('Tell us a bit more so we can help'));
    setSubmitting(true);
    try {
      const created = await servisaku.support.create({
        category,
        subject: subject.trim(),
        message: message.trim(),
        ...(bookingId ? { booking_id: bookingId } : {}),
      });
      toast.success(created.reference ? t('Ticket {ref} opened', { ref: created.reference }) : t('Ticket opened'));
      navigate(`/support?id=${created.id}`, { replace: true });
    } catch (e) {
      toast.error(e.message || t('Could not open that ticket'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell title={t('Open a ticket')} subtitle={t('A person will come back to you')}>
      <Field label={t('What is it about?')}>
        <div className="grid grid-cols-2 gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-sm transition-colors',
                category === c.value
                  ? 'border-brand bg-brand-tint font-medium text-brand'
                  : 'border-hairline bg-surface hover:bg-raised/50',
              )}
            >
              {t(c.label)}
            </button>
          ))}
        </div>
      </Field>

      <Field label={t('Subject')}>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t('e.g. Charged twice for one booking')}
          className={inputClass}
        />
      </Field>

      <Field label={t('What is happening?')}>
        <textarea
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('Include anything you have already tried.')}
          className={inputClass}
        />
      </Field>

      <Button block variant="primary" disabled={submitting} onClick={submit}>
        {submitting ? 'Opening…' : 'Open ticket'}
      </Button>
    </PageShell>
  );
}

// ─── Thread ──────────────────────────────────────────────────────────────────

function TicketThread({ ticketId }) {
  const { t, locale } = useTranslation();
  const [ticket, setTicket] = useState(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const load = () => servisaku.support.get(ticketId).then(setTicket).catch(() => setFailed(true));
  useEffect(() => { load(); }, [ticketId]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [ticket?.messages?.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      await servisaku.support.reply(ticketId, text);
      setDraft('');
      await load();
    } catch (e) {
      toast.error(e.message || t('Could not send that'));
    } finally {
      setSending(false);
    }
  };

  const rate = async (stars) => {
    try {
      await servisaku.support.csat(ticketId, stars);
      toast.success(t('Thanks — that helps us improve'));
      await load();
    } catch (e) {
      toast.error(e.message || t('Could not save that rating'));
    }
  };

  if (failed) {
    return (
      <PageShell title={t('Ticket')}>
        <EmptyState icon={LifeBuoy} title={t('Ticket not found')} body={t('It may have been closed, or it belongs to another account.')} />
      </PageShell>
    );
  }
  if (!ticket) return <PageShell title={t('Ticket')}><Loading /></PageShell>;

  const messages = ticket.messages ?? [];
  const closed = ['resolved', 'closed'].includes(ticket.status);

  return (
    <PageShell title={ticket.subject} subtitle={ticket.reference} action={<StatusPill status={ticket.status} />}>
      <Card>
        <p className="text-sm">{ticket.message}</p>
        <p className="mt-2 text-xs text-ink-secondary">{fmtDateTime(ticket.created_date ?? ticket.createdAt, locale)}</p>
      </Card>

      {messages.length > 0 && (
        <div className="space-y-2">
          {messages.map((m) => {
            const mine = m.sender_role === 'consumer' || m.senderRole === 'consumer';
            return (
              <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm',
                  mine ? 'rounded-br-sm bg-brand text-brand-ink' : 'rounded-bl-sm bg-raised text-ink',
                )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.message}</p>
                  <p className={cn('mt-1 text-[10px]', mine ? 'text-brand-ink/70' : 'text-ink-tertiary')}>
                    {fmtDateTime(m.created_date ?? m.createdAt, locale)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}

      {closed ? (
        <Card>
          <p className="text-sm font-semibold">{t('How did we do?')}</p>
          <div className="mt-2 flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => rate(n)}
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
                className="p-1"
              >
                <Star
                  className={cn(
                    'h-6 w-6',
                    (ticket.csat_rating ?? ticket.csatRating ?? 0) >= n
                      ? 'fill-warning text-warning'
                      : 'text-ink-tertiary',
                  )}
                />
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={async () => {
              try {
                await servisaku.support.reopen(ticketId, 'Still not resolved');
                await load();
                toast.success(t('Reopened'));
              } catch (e) { toast.error(e.message || t('Could not reopen')); }
            }}
          >
            {t('Still not resolved — reopen')}
          </Button>
        </Card>
      ) : (
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('Reply…')}
            aria-label={t('Reply')}
            className={cn(inputClass, 'resize-none')}
          />
          <Button
            size="icon"
            variant="primary"
            className="h-11 w-11 shrink-0"
            disabled={sending || !draft.trim()}
            onClick={send}
            aria-label={t('Send reply')}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
    </PageShell>
  );
}
