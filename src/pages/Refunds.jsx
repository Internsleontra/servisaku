import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Receipt, ShieldCheck } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { Button } from '@/components/ds';
import { formatMYR } from '@/lib/utils';
import { toast } from 'sonner';
import {
  PageShell, StatusPill, Card, EmptyState, Loading, Field, inputClass,
  EvidenceUploader, fmtDate,
} from '@/components/records/RecordUI';

/**
 * Refunds — the customer's list, and the request flow when arriving from a
 * booking (`/refunds?booking=<id>`).
 *
 * THE AMOUNT IS NEVER COMPUTED HERE. It comes from GET /refunds/policy, and the
 * create call recomputes it server-side and ignores anything the client sends.
 * So a stale preview cannot overpay, and the figure shown is the figure the
 * server will honour — see server/routes/refunds.js.
 */
export default function Refunds() {
  const [params] = useSearchParams();
  const bookingId = params.get('booking');
  return bookingId ? <RequestFlow bookingId={bookingId} /> : <RefundList />;
}

// ─── List ────────────────────────────────────────────────────────────────────

function RefundList() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);

  useEffect(() => {
    servisaku.refunds.list()
      .then((r) => setItems(Array.isArray(r) ? r : (r.items ?? [])))
      .catch(() => setItems([]));
  }, []);

  if (!items) return <PageShell title="Refunds"><Loading /></PageShell>;

  return (
    <PageShell title="Refunds" subtitle={items.length ? `${items.length} request${items.length === 1 ? '' : 's'}` : null}>
      {items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No refund requests"
          body="If a booking is cancelled or something goes wrong, you can request a refund from the booking itself."
          action={<Button variant="outline" size="sm" onClick={() => navigate('/bookings')}>View bookings</Button>}
        />
      ) : items.map((r) => (
        <Card key={r.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{formatMYR(r.refund_amount ?? r.refundAmount, { decimals: true })}</p>
              <p className="text-xs text-ink-secondary mt-0.5">
                Requested {fmtDate(r.created_date ?? r.createdAt)}
              </p>
            </div>
            <StatusPill status={r.status} />
          </div>

          {r.reason && <p className="mt-2 text-sm text-ink-secondary line-clamp-2">{r.reason}</p>}

          {r.processed_at || r.processedAt ? (
            <p className="mt-2 text-xs text-ink-secondary">
              Processed {fmtDate(r.processed_at ?? r.processedAt)} — allow a few working days for it to
              appear, depending on your bank.
            </p>
          ) : null}
        </Card>
      ))}
    </PageShell>
  );
}

// ─── Request flow ────────────────────────────────────────────────────────────

function RequestFlow({ bookingId }) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    servisaku.refunds.preview(bookingId)
      .then(setPreview)
      .catch((e) => setError(e.message || 'Could not work out what you are owed'));
  }, [bookingId]);

  const submit = async () => {
    if (reason.trim().length < 5) return toast.error('Please tell us briefly what happened');
    setSubmitting(true);
    try {
      const created = await servisaku.refunds.request({
        booking_id: bookingId,
        reason: reason.trim(),
        evidence: evidence.length ? evidence : undefined,
      });
      toast.success(created.auto_approved || created.status === 'approved'
        ? 'Refund approved — it is on its way'
        : 'Refund requested — we will review it shortly');
      navigate('/refunds', { replace: true });
    } catch (e) {
      toast.error(e.message || 'Could not submit that request');
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <PageShell title="Request a refund">
        <EmptyState
          icon={Receipt}
          title="This booking cannot be refunded"
          body={error}
          action={<Button variant="outline" size="sm" onClick={() => navigate('/bookings')}>Back to bookings</Button>}
        />
      </PageShell>
    );
  }

  if (!preview) return <PageShell title="Request a refund"><Loading label="Checking your booking…" /></PageShell>;

  const eligible = Number(preview.eligible_amount) > 0;

  return (
    <PageShell title="Request a refund" subtitle={`Booking total ${formatMYR(preview.booking_total, { decimals: true })}`}>
      {/* The figure and the RULE behind it. A number with no explanation is what
          turns a refund into a support ticket. */}
      <div className="rounded-2xl border border-hairline bg-surface p-4">
        <p className="text-xs uppercase tracking-wide text-ink-tertiary">You would receive</p>
        <p className="mt-1 text-3xl font-semibold">{formatMYR(preview.eligible_amount, { decimals: true })}</p>
        {preview.percent != null && Number(preview.percent) < 100 && (
          <p className="mt-0.5 text-sm text-ink-secondary">
            {preview.percent}% of {formatMYR(preview.booking_total, { decimals: true })}
          </p>
        )}
        {preview.explanation && (
          <p className="mt-3 text-sm text-ink-secondary border-t border-hairline pt-3">{preview.explanation}</p>
        )}
        {Number(preview.already_refunded) > 0 && (
          <p className="mt-2 text-xs text-ink-secondary">
            {formatMYR(preview.already_refunded, { decimals: true })} has already been refunded on this booking.
          </p>
        )}
      </div>

      {!eligible ? (
        <EmptyState
          icon={Receipt}
          title="No automatic refund at this stage"
          body="You can still raise a dispute and a person will look at what happened."
          action={<Button onClick={() => navigate(`/disputes?booking=${bookingId}`)}>Raise a dispute</Button>}
        />
      ) : (
        <>
          {preview.auto_approved && (
            <div className="flex items-start gap-2 rounded-xl bg-success-tint px-3 py-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
              <p className="text-xs text-ink">
                This one is approved automatically — no waiting for a review.
              </p>
            </div>
          )}

          <Field label="What happened?" hint="A sentence is enough. It helps us spot problems early.">
            <textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. I need to cancel — something came up at home"
              className={inputClass}
            />
          </Field>

          <Field label="Photos (optional)" hint="Only if something went wrong and a photo helps explain it.">
            <EvidenceUploader
              evidence={evidence}
              onChange={setEvidence}
              hint="JPG, PNG or WebP."
            />
          </Field>

          <Button block variant="primary" disabled={submitting} onClick={submit}>
            {submitting ? 'Submitting…' : `Request ${formatMYR(preview.eligible_amount, { decimals: true })}`}
          </Button>

          <p className="text-center text-xs text-ink-secondary">
            The amount is confirmed by our system when you submit, so it always matches the policy
            that applies at that moment.
          </p>
        </>
      )}
    </PageShell>
  );
}
