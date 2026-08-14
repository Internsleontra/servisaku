import { useState, useEffect } from 'react';
import {
  ShieldCheck, Clock, XCircle, AlertTriangle, Upload, CheckCircle2, FileText,
  LoaderCircle, TriangleAlert, Paperclip,
} from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { PageHeader } from '@/components/partner/PageHeader';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { Button, RING } from '@/components/ds';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import moment from 'moment';

/* Verification is KYC: the documents ServisAku needs before a partner can be
   activated. Everything here comes from GET /partners/me/documents, which merges
   the server's DOC_CATALOG with the partner's submissions. The catalogue, the
   statuses and the required set are all server-owned — nothing is invented here.

   `status` is one of: missing · pending · verified · rejected · expired.
   `expired` is computed server-side from expiryDate, so it never has to be
   derived on the client. */

const STATUS = {
  verified: { pill: 'bg-success-tint text-success', icon: CheckCircle2, label: 'Verified' },
  // Pending is a wait, not a warning — amber, but not the orange reserved for
  // action-needed states.
  pending: { pill: 'bg-warning-tint text-star', icon: Clock, label: 'Pending review' },
  rejected: { pill: 'bg-danger-tint text-danger', icon: XCircle, label: 'Rejected' },
  expired: { pill: 'bg-warning-tint text-warning', icon: AlertTriangle, label: 'Expired' },
  missing: { pill: 'bg-raised text-ink-secondary', icon: FileText, label: 'Missing' },
};

/* Which statuses need the partner to do something. Drives the attention summary
   and the ordering hint — never the document list itself, which stays in the
   server's catalogue order so it reads the same every visit. */
const NEEDS_ACTION = ['missing', 'rejected', 'expired'];

const ACTION_LABEL = {
  missing: 'Upload',
  rejected: 'Re-submit',
  expired: 'Renew',
};

const GROUP_ORDER = ['Identity', 'Professional', 'Financial', 'Business'];
const PLACEHOLDER = { mykad: '900101-14-5567', ssm: '202301012345', skill_cert: 'CIDB / ST cert no.', bank: 'Account number' };

function Panel({ children, className }) {
  return <div className={cn('rounded-card bg-surface p-5', RING, className)}>{children}</div>;
}

export default function PartnerVerification() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [active, setActive] = useState(null); // catalog doc being uploaded
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // A rejection here (403 for a non-applicant) previously left `data` null
    // forever, which is the spinner state — the page hung with no explanation.
    servisaku.documents.list()
      .then(setData)
      .catch((e) => setLoadError(e?.message || 'Could not load your documents'));
  }, []);

  // Escape closes the upload sheet, matching the overlay click.
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setActive(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const openUpload = (doc) => {
    setActive(doc);
    setNumber(doc.number || '');
    setExpiry(doc.expiry_date ? moment(doc.expiry_date).format('YYYY-MM-DD') : '');
    setFile(null);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      let file_url;
      if (file) ({ file_url } = await servisaku.integrations.Core.UploadFile({ file }));
      const payload = { type: active.type };
      if (file_url) payload.file_url = file_url;
      if (active.hasNumber && number) payload.number = number;
      if (active.hasExpiry && expiry) payload.expiry_date = expiry;
      const next = await servisaku.documents.submit(payload);
      setData(next);
      setActive(null);
      toast.success('Submitted for verification');
    } catch (e) {
      toast.error(e.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) return (
    <div className="px-5 py-6 lg:px-8 lg:py-8">
      <PageHeader eyebrow="Verification Center" title="Get verified" backTo="/partner" />
      <div className={cn('flex items-start gap-3 rounded-card bg-danger-tint p-4', RING)} role="alert">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
        <div>
          <p className="text-caption font-semibold text-danger">Couldn&apos;t load your documents</p>
          <p className="mt-0.5 text-xs text-ink-secondary">{loadError}</p>
        </div>
      </div>
    </div>
  );

  if (!data) return (
    <div className="flex justify-center pt-32">
      <LoaderCircle className="size-6 animate-spin text-brand" role="status" aria-label="Loading documents" />
    </div>
  );

  const groups = GROUP_ORDER
    .map((g) => ({ group: g, items: data.documents.filter((d) => d.group === g) }))
    .filter((g) => g.items.length);

  const attention = data.documents.filter((d) => NEEDS_ACTION.includes(d.status) && d.required);

  return (
    <div
      className="px-5 py-6 lg:px-8 lg:py-8"
      style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
    >
      <PageHeader
        eyebrow="Verification Center"
        title="Get verified"
        subtitle="Upload the documents ServisAku needs to activate your account."
        backTo="/partner"
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px] lg:items-start">

        {/* ── Documents ─────────────────────────────────────────────────── */}
        <div className="space-y-6">
          {groups.map(({ group, items }) => (
            <section key={group} className="space-y-3">
              <SectionHeader title={group} />
              {items.map((doc) => {
                const meta = STATUS[doc.status] || STATUS.missing;
                const Icon = meta.icon;
                const expiringSoon = doc.expiry_date && doc.status === 'verified'
                  && moment(doc.expiry_date).diff(moment(), 'days') <= 30;
                return (
                  <Panel key={doc.type} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-caption font-semibold text-ink">{doc.label}</p>
                          {doc.required && (
                            <span className="sa-caps text-[9px] text-brand">Required</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-ink-secondary">{doc.help}</p>
                        {doc.number && <p className="sa-num mt-1 text-[11px] font-medium text-ink">{doc.number}</p>}
                        {doc.expiry_date && (
                          <p className={cn('sa-num mt-1 text-[11px]',
                            doc.status === 'expired' || expiringSoon ? 'font-semibold text-warning' : 'text-ink-tertiary')}>
                            {doc.status === 'expired' ? 'Expired ' : 'Valid until '}
                            {moment(doc.expiry_date).format('D MMM YYYY')}
                            {expiringSoon && ' · renew soon'}
                          </p>
                        )}
                        {doc.status === 'rejected' && doc.rejection_reason && (
                          <p className={cn('mt-2 rounded-field bg-danger-tint p-2.5 text-[11px] text-danger', RING)}>
                            <span className="font-semibold">Why it was rejected: </span>{doc.rejection_reason}
                          </p>
                        )}
                      </div>
                      <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', meta.pill)}>
                        <Icon className="size-3" aria-hidden="true" /> {meta.label}
                      </span>
                    </div>
                    {doc.status !== 'verified' && (
                      <Button
                        onClick={() => openUpload(doc)}
                        variant="outline"
                        block
                        className="mt-3"
                      >
                        <Upload className="size-4" aria-hidden="true" />
                        {ACTION_LABEL[doc.status] || 'Update'}
                      </Button>
                    )}
                  </Panel>
                );
              })}
            </section>
          ))}
        </div>

        {/* ── Status rail ───────────────────────────────────────────────── */}
        <aside className="space-y-5 lg:sticky lg:top-5">
          <Panel>
            <SectionHeader title="Verification progress" className="mb-3" />
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-caption text-ink-secondary">
                <span className="sa-num font-semibold text-ink">{data.required_verified}</span> of{' '}
                <span className="sa-num font-semibold text-ink">{data.required_total}</span> required verified
              </p>
              <span className="sa-num text-h4 font-semibold text-brand">{data.progress}%</span>
            </div>
            <div
              className="mt-3 h-2 w-full overflow-hidden rounded-full bg-raised"
              role="progressbar"
              aria-valuenow={data.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Verification progress"
            >
              <div className="h-full rounded-full bg-grad-brand transition-all" style={{ width: `${data.progress}%` }} />
            </div>

            <div className={cn('mt-4 flex items-start gap-2 rounded-field p-3 text-xs font-semibold',
              data.activated ? 'bg-success-tint text-success' : 'bg-brand-tint text-brand')}>
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {data.activated
                ? 'You are fully verified and active'
                : 'Complete the required documents to activate your account'}
            </div>
          </Panel>

          {attention.length > 0 && (
            <Panel>
              <SectionHeader title="Needs your attention" sub={`${attention.length} required document${attention.length > 1 ? 's' : ''}`} className="mb-3" />
              <ul className="space-y-2">
                {attention.map((d) => {
                  const meta = STATUS[d.status] || STATUS.missing;
                  const Icon = meta.icon;
                  return (
                    <li key={d.type}>
                      <button
                        type="button"
                        onClick={() => openUpload(d)}
                        className={cn(
                          'flex min-h-11 w-full items-center gap-2.5 rounded-field px-3 text-left text-caption transition hover:bg-raised',
                          'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]',
                        )}
                      >
                        <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', meta.pill)}>
                          <Icon className="size-3.5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">{d.label}</span>
                        <span className="shrink-0 text-[11px] font-semibold text-brand">
                          {ACTION_LABEL[d.status] || 'Update'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </aside>
      </div>

      {/* Upload sheet */}
      {active && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
          onClick={() => setActive(null)}
        >
          <div
            className="w-full max-w-lg rounded-t-sheet bg-surface p-5 sm:rounded-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-title"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hairline" />
            <h2 id="upload-title" className="text-h4 text-ink">{active.label}</h2>
            <p className="mt-0.5 text-xs text-ink-secondary">{active.help}</p>

            <div className="mt-4 space-y-3">
              {active.hasNumber && (
                <div>
                  <label htmlFor="doc-number" className="block text-xs font-medium text-ink-secondary">
                    {active.numberLabel}
                  </label>
                  <input
                    id="doc-number"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder={PLACEHOLDER[active.type] || ''}
                    className={cn('sa-num mt-1 min-h-11 w-full rounded-field bg-raised px-4 text-caption text-ink outline-none',
                      'focus-visible:shadow-[shadow:var(--focus-ring)]', RING)}
                  />
                </div>
              )}
              {active.hasExpiry && (
                <div>
                  <label htmlFor="doc-expiry" className="block text-xs font-medium text-ink-secondary">Expiry date</label>
                  <input
                    id="doc-expiry"
                    type="date"
                    value={expiry}
                    min={moment().format('YYYY-MM-DD')}
                    onChange={(e) => setExpiry(e.target.value)}
                    className={cn('sa-num mt-1 min-h-11 w-full rounded-field bg-raised px-4 text-caption text-ink outline-none',
                      'focus-visible:shadow-[shadow:var(--focus-ring)]', RING)}
                  />
                </div>
              )}

              {/* The file input is sr-only rather than `hidden`: a display:none
                  input is not focusable, so the attach control was unreachable by
                  keyboard. Same click behaviour, now tabbable. */}
              <div>
                <label
                  htmlFor="doc-file"
                  className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-field px-4 py-3 transition',
                    'hover:bg-raised focus-within:shadow-[shadow:var(--focus-ring)]', RING)}
                >
                  <Paperclip className="size-5 shrink-0 text-ink-secondary" aria-hidden="true" />
                  <span className="truncate text-caption text-ink-secondary">
                    {file ? file.name : 'Attach a photo or PDF'}
                  </span>
                  <input
                    id="doc-file"
                    type="file"
                    accept="image/*,application/pdf"
                    className="sr-only"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <Button onClick={() => setActive(null)} variant="outline" className="flex-1">Cancel</Button>
              <Button onClick={submit} loading={submitting} disabled={submitting} className="flex-1">
                {submitting ? 'Submitting…' : 'Submit'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
