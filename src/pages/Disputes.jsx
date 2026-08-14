import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Flag, Info } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { Button } from '@/components/ds';
import { toast } from 'sonner';
import {
  PageShell, StatusPill, Card, EmptyState, Loading, Field, inputClass,
  EvidenceUploader, fmtDate, fmtDateTime,
} from '@/components/records/RecordUI';

/**
 * Disputes — the "Flag Job" path.
 *
 * `/disputes`            → the customer's disputes
 * `/disputes?booking=id` → raise one
 * `/disputes?id=xxx`     → its progress
 *
 * Raising a dispute freezes the disputed amount server-side, which is the point
 * of doing it here rather than by complaining in chat: it stops the payout while
 * a person looks at it.
 */
export default function Disputes() {
  const [params] = useSearchParams();
  const bookingId = params.get('booking');
  const disputeId = params.get('id');
  if (bookingId) return <NewDispute bookingId={bookingId} />;
  if (disputeId) return <DisputeDetail disputeId={disputeId} />;
  return <DisputeList />;
}

const REASONS = [
  { value: 'not_performed', label: 'The work was not done' },
  { value: 'quality', label: 'The work was poor quality' },
  { value: 'incomplete', label: 'Only part of it was done' },
  { value: 'no_show', label: 'Nobody turned up' },
  { value: 'overcharged', label: 'I was charged the wrong amount' },
  { value: 'other', label: 'Something else' },
];

// ─── List ────────────────────────────────────────────────────────────────────

function DisputeList() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);

  useEffect(() => {
    servisaku.disputes.list()
      .then((r) => setItems(Array.isArray(r) ? r : (r.items ?? [])))
      .catch(() => setItems([]));
  }, []);

  if (!items) return <PageShell title="Disputes"><Loading /></PageShell>;

  return (
    <PageShell title="Disputes">
      {items.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="No disputes"
          body="If a job was not done properly, flag it from the booking and we will investigate."
          action={<Button variant="outline" size="sm" onClick={() => navigate('/bookings')}>View bookings</Button>}
        />
      ) : items.map((d) => (
        <Card key={d.id} onClick={() => navigate(`/disputes?id=${d.id}`)}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold capitalize truncate">
                {String(d.reason ?? d.category ?? 'Dispute').replace(/_/g, ' ')}
              </p>
              <p className="text-xs text-ink-secondary mt-0.5">Raised {fmtDate(d.created_date ?? d.createdAt)}</p>
            </div>
            <StatusPill status={d.status} />
          </div>
          {d.description && <p className="mt-2 text-sm text-ink-secondary line-clamp-2">{d.description}</p>}
        </Card>
      ))}
    </PageShell>
  );
}

// ─── New ─────────────────────────────────────────────────────────────────────

function NewDispute({ bookingId }) {
  const navigate = useNavigate();
  const [reason, setReason] = useState('quality');
  const [description, setDescription] = useState('');
  const [evidence, setEvidence] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (description.trim().length < 10) return toast.error('Please describe what went wrong');
    setSubmitting(true);
    try {
      const created = await servisaku.disputes.create({
        booking_id: bookingId,
        reason,
        description: description.trim(),
        evidence: evidence.length ? evidence : undefined,
      });
      toast.success('Dispute raised — the amount is on hold while we look at it');
      navigate(`/disputes?id=${created.id}`, { replace: true });
    } catch (e) {
      toast.error(e.message || 'Could not raise that dispute');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell title="Flag this job" subtitle="Tell us what went wrong">
      <div className="flex items-start gap-2 rounded-xl bg-info-tint px-3 py-2.5">
        <Info className="h-4 w-4 shrink-0 text-info mt-0.5" aria-hidden="true" />
        <p className="text-xs text-ink">
          Raising this puts the payment on hold while we investigate, so nothing is released to the
          professional until it is settled.
        </p>
      </div>

      <Field label="What is the problem?">
        <div className="space-y-1.5">
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setReason(r.value)}
              className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                reason === r.value
                  ? 'border-brand bg-brand-tint font-medium text-brand'
                  : 'border-hairline bg-surface hover:bg-raised/50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="What happened?" hint="The more specific you are, the faster we can resolve it.">
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. The bathroom was not cleaned at all and the professional left after 20 minutes."
          className={inputClass}
        />
      </Field>

      <Field label="Photos (optional)" hint="Photos of the problem make a dispute much easier to resolve.">
        <EvidenceUploader evidence={evidence} onChange={setEvidence} />
      </Field>

      <Button block variant="primary" disabled={submitting} onClick={submit}>
        {submitting ? 'Raising…' : 'Raise dispute'}
      </Button>
    </PageShell>
  );
}

// ─── Detail ──────────────────────────────────────────────────────────────────

function DisputeDetail({ disputeId }) {
  const [dispute, setDispute] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    servisaku.disputes.get(disputeId).then(setDispute).catch(() => setFailed(true));
  }, [disputeId]);

  if (failed) {
    return (
      <PageShell title="Dispute">
        <EmptyState icon={Flag} title="Dispute not found" body="It may have been resolved, or it belongs to another account." />
      </PageShell>
    );
  }
  if (!dispute) return <PageShell title="Dispute"><Loading /></PageShell>;

  const partnerResponse = dispute.partner_response ?? dispute.partnerResponse;
  const resolution = dispute.resolution ?? dispute.resolutionNote;

  return (
    <PageShell title="Dispute" action={<StatusPill status={dispute.status} />}>
      <Card>
        <p className="font-semibold capitalize">
          {String(dispute.reason ?? 'Dispute').replace(/_/g, ' ')}
        </p>
        <p className="mt-1 text-sm text-ink-secondary">{dispute.description}</p>
        <p className="mt-2 text-xs text-ink-secondary">Raised {fmtDateTime(dispute.created_date ?? dispute.createdAt)}</p>
      </Card>

      {(dispute.evidence?.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {dispute.evidence.map((e, i) => (
            <img key={e.url || i} src={e.url} alt={e.caption || 'Evidence'} className="h-20 w-20 rounded-lg object-cover border border-hairline" />
          ))}
        </div>
      )}

      {partnerResponse && (
        <Card>
          <p className="text-sm font-semibold">The professional&apos;s response</p>
          <p className="mt-1 text-sm text-ink-secondary">{partnerResponse}</p>
        </Card>
      )}

      {resolution ? (
        <Card className="border-brand/30 bg-brand-tint">
          <p className="text-sm font-semibold">Outcome</p>
          <p className="mt-1 text-sm">{resolution}</p>
        </Card>
      ) : (
        <p className="px-1 text-center text-xs text-ink-secondary">
          We will notify you as soon as there is an outcome. Nothing is paid out while this is open.
        </p>
      )}
    </PageShell>
  );
}
