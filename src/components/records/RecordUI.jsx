import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ImagePlus, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/useTranslation';

/**
 * Shared shell and primitives for the record screens — refunds, damage claims,
 * disputes, support tickets and legal acceptance.
 *
 * These five screens are structurally the same thing: a list of records the
 * customer has raised, a form to raise another, and a detail view with a status
 * and a history. Building each one separately is how five subtly different
 * status colours and five different empty states happen.
 */

export function PageShell({ title, subtitle, action, children, aside }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className="bg-bg pb-16">
      {/* Gradient page header — same pattern as the booking funnel. Replaces
          the previous `max-w-lg` mobile column that rendered as a narrow strip
          on desktop. */}
      <div className="bg-grad-hero text-white">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-8 md:pb-14">
          <button
            onClick={() => navigate(-1)}
            className="mb-4 inline-flex items-center gap-1.5 text-caption font-normal text-white/75 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-[15px]" /> {t('Back')}
          </button>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-display-2 text-white">{title}</h1>
              {subtitle && <p className="mt-2 text-lead text-white/[0.78]">{subtitle}</p>}
            </div>
            {action}
          </div>
        </div>
      </div>

      {/* Two-column on desktop when the page supplies an aside; single 1240px
          column otherwise. */}
      <div
        className={cn(
          'mx-auto -mt-8 grid w-full max-w-[1240px] items-start gap-6 px-5 md:px-8',
          aside && 'lg:grid-cols-[1.5fr_0.9fr]',
        )}
      >
        <div className="flex flex-col gap-4">{children}</div>
        {aside && <div className="lg:sticky lg:top-[100px]">{aside}</div>}
      </div>
    </div>
  );
}

/**
 * Status colours, mapped once.
 *
 * Every one of these screens has a status, and the vocabulary overlaps but is
 * not identical — a refund is "processing", a claim is "investigating", a ticket
 * is "awaiting_customer". Grouping them by MEANING rather than by name keeps a
 * pending refund and a pending claim the same colour to the customer.
 */
const TONE = {
  neutral: 'bg-raised text-ink-secondary',
  waiting: 'bg-warning-tint text-warning',
  active: 'bg-info-tint text-info',
  good: 'bg-success-tint text-success',
  bad: 'bg-danger-tint text-danger',
};

const STATUS_TONE = {
  pending: 'waiting', under_review: 'waiting', awaiting_customer: 'waiting',
  awaiting_partner_response: 'waiting', awaiting_evidence: 'waiting', open: 'waiting',
  submitted: 'waiting', acknowledged: 'waiting', requested: 'waiting',
  processing: 'active', investigating: 'active', in_progress: 'active',
  escalated: 'active', approved: 'active', scheduled: 'active',
  completed: 'good', resolved: 'good', succeeded: 'good', paid: 'good', accepted: 'good',
  rejected: 'bad', failed: 'bad', declined: 'bad', cancelled: 'bad', withdrawn: 'bad',
  closed: 'neutral', reopened: 'active',
};

/* Customer-facing wording for record statuses. Display layer only — the stored
   value is unchanged; this is the English key that t() then translates. */
const RECORD_STATUS_LABEL = {
  pending: 'Pending',
  requested: 'Requested',
  submitted: 'Submitted',
  acknowledged: 'Acknowledged',
  open: 'Open',
  under_review: 'Under review',
  awaiting_customer: 'Awaiting your reply',
  awaiting_partner_response: 'Awaiting partner response',
  awaiting_evidence: 'Awaiting evidence',
  investigating: 'Investigating',
  processing: 'Processing',
  in_progress: 'In progress',
  escalated: 'Escalated',
  approved: 'Approved',
  scheduled: 'Scheduled',
  completed: 'Completed',
  resolved: 'Resolved',
  succeeded: 'Succeeded',
  paid: 'Paid',
  accepted: 'Accepted',
  rejected: 'Rejected',
  failed: 'Failed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  withdrawn: 'Withdrawn',
  closed: 'Closed',
  reopened: 'Reopened',
};

export function StatusPill({ status, className }) {
  const { t } = useTranslation();
  if (!status) return null;
  const tone = TONE[STATUS_TONE[status] || 'neutral'];
  // The raw enum was previously printed as customer copy ("awaiting_customer"
  // → "Awaiting customer"), which cannot be translated. Look the value up as a
  // key; unknown statuses still fall back to the de-underscored form.
  const label = t(RECORD_STATUS_LABEL[status] || String(status).replace(/_/g, ' '));
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', tone, className)}>
      {label}
    </span>
  );
}

export function Card({ onClick, children, className }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'w-full rounded-card bg-surface p-4 text-left shadow-[inset_0_0_0_1px_rgb(var(--hairline))]',
        onClick && 'transition hover:-translate-y-0.5 hover:shadow-e2',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="rounded-card bg-surface px-6 py-12 text-center shadow-[inset_0_0_0_1px_rgb(var(--hairline))]">
      {Icon && <Icon className="mx-auto h-8 w-8 text-ink-tertiary" aria-hidden="true" />}
      <p className="mt-3 font-semibold">{title}</p>
      {body && <p className="mt-1 text-sm text-ink-secondary">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-ink-secondary" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span className="text-sm">{label || t('Loading…')}</span>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-ink-secondary mt-0.5">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputClass =
  'w-full rounded-field bg-surface px-3.5 py-2.5 text-caption text-ink '
  + 'shadow-[inset_0_0_0_1px_rgb(var(--hairline))] placeholder:text-ink-tertiary '
  + 'focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1.5px_rgb(var(--brand))]';

/**
 * Photo evidence.
 *
 * Uploads immediately rather than on submit: a claim form that loses four
 * photos because the description was too short is how people give up on
 * reporting damage.
 */
export function EvidenceUploader({ evidence, onChange, max = 5, hint }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const upload = async (file) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('files', file);
      const token = localStorage.getItem('auth_token');
      const base = import.meta.env.VITE_API_BASE || '/api';
      const res = await fetch(`${base}/uploads`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) throw new Error(t('Upload failed'));
      const body = await res.json();
      const file0 = Array.isArray(body) ? body[0] : (body.files?.[0] ?? body);
      onChange([...evidence, { kind: 'photo', url: file0.url, caption: file.name?.slice(0, 60) }]);
    } catch {
      onChange([...evidence]); // leave the list untouched
      throw new Error(t('That photo could not be uploaded — please try again'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {evidence.map((e, i) => (
          <div key={e.url || i} className="relative">
            <img src={e.url} alt={e.caption || 'Evidence'} className="size-16 rounded-md object-cover shadow-[inset_0_0_0_1px_rgb(var(--hairline))]" />
            <button
              type="button"
              onClick={() => onChange(evidence.filter((_, j) => j !== i))}
              aria-label={t('Remove photo')}
              className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-ink text-ink-inverse flex items-center justify-center"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {evidence.length < max && (
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="grid size-16 place-items-center rounded-md text-ink-tertiary shadow-[inset_0_0_0_1px_rgb(var(--hairline))] transition hover:bg-raised disabled:opacity-50"
            aria-label={t('Add a photo')}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          </button>
        )}
      </div>

      {hint && <p className="mt-1.5 text-xs text-ink-secondary">{hint}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) await upload(file);
        }}
      />
    </div>
  );
}

/* Locale is passed in because these are plain functions, not hooks; callers
   hand over the value from useTranslation() so dates follow the language. */
export const fmtDate = (d, locale = 'en-MY') => (d
  ? new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  : '—');

export const fmtDateTime = (d, locale = 'en-MY') => (d
  ? new Date(d).toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  : '—');
