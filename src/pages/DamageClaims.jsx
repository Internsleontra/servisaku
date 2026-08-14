import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldAlert, Clock } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { Button } from '@/components/ds';
import { formatMYR } from '@/lib/utils';
import { toast } from 'sonner';
import {
  PageShell, StatusPill, Card, EmptyState, Loading, Field, inputClass,
  EvidenceUploader, fmtDate, fmtDateTime,
} from '@/components/records/RecordUI';

/**
 * Property damage claims.
 *
 * `/damage-claims`            → the customer's claims
 * `/damage-claims?booking=id` → file a new one
 * `/damage-claims?id=xxx`     → a claim's progress and history
 *
 * The reporting window and the SLA clocks come from the server, never from a
 * constant here — they are policy values, and a screen that hardcodes "48 hours"
 * is the sixth place that number would have to be changed.
 */
export default function DamageClaims() {
  const [params] = useSearchParams();
  const bookingId = params.get('booking');
  const claimId = params.get('id');
  if (bookingId) return <NewClaim bookingId={bookingId} />;
  if (claimId) return <ClaimDetail claimId={claimId} />;
  return <ClaimList />;
}

// ─── List ────────────────────────────────────────────────────────────────────

function ClaimList() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);

  useEffect(() => {
    servisaku.damageClaims.list()
      .then((r) => setItems(Array.isArray(r) ? r : (r.items ?? [])))
      .catch(() => setItems([]));
  }, []);

  if (!items) return <PageShell title="Damage claims"><Loading /></PageShell>;

  return (
    <PageShell title="Damage claims">
      {items.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No claims"
          body="If something in your home is damaged during a booking, report it from that booking as soon as you can."
          action={<Button variant="outline" size="sm" onClick={() => navigate('/bookings')}>View bookings</Button>}
        />
      ) : items.map((c) => (
        <Card key={c.id} onClick={() => navigate(`/damage-claims?id=${c.id}`)}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold truncate">{c.item_description ?? c.itemDescription ?? 'Damage claim'}</p>
              <p className="text-xs text-ink-secondary mt-0.5">Filed {fmtDate(c.created_date ?? c.createdAt)}</p>
            </div>
            <StatusPill status={c.status} />
          </div>
          <p className="mt-2 text-sm">
            Claimed {formatMYR(c.claimed_amount ?? c.claimedAmount, { decimals: true })}
            {(c.approved_amount ?? c.approvedAmount) != null && (
              <span className="text-success"> · approved {formatMYR(c.approved_amount ?? c.approvedAmount, { decimals: true })}</span>
            )}
          </p>
        </Card>
      ))}
    </PageShell>
  );
}

// ─── New claim ───────────────────────────────────────────────────────────────

function NewClaim({ bookingId }) {
  const navigate = useNavigate();
  const [item, setItem] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [evidence, setEvidence] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (item.trim().length < 3) return toast.error('What was damaged?');
    if (description.trim().length < 10) return toast.error('Please describe what happened');
    if (!(Number(amount) > 0)) return toast.error('Enter the repair or replacement cost');
    if (evidence.length === 0) return toast.error('At least one photo of the damage is required');

    setSubmitting(true);
    try {
      const created = await servisaku.damageClaims.create({
        booking_id: bookingId,
        item_description: item.trim(),
        incident_description: description.trim(),
        claimed_amount: Number(amount),
        evidence,
      });
      toast.success('Claim filed — we will acknowledge it shortly');
      navigate(`/damage-claims?id=${created.id}`, { replace: true });
    } catch (e) {
      toast.error(e.message || 'Could not file that claim');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell title="Report damage" subtitle="Tell us what happened and we will investigate">
      <div className="flex items-start gap-2 rounded-xl bg-warning-tint px-3 py-2.5">
        <Clock className="h-4 w-4 shrink-0 text-warning mt-0.5" aria-hidden="true" />
        <p className="text-xs text-ink">
          Report damage as soon as possible after the job finishes. A late report is still accepted,
          but it can be harder to establish what happened.
        </p>
      </div>

      <Field label="What was damaged?">
        <input
          value={item}
          onChange={(e) => setItem(e.target.value)}
          placeholder="e.g. Kitchen worktop"
          className={inputClass}
        />
      </Field>

      <Field label="What happened?" hint="Include where it was and how you noticed.">
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. A deep scratch appeared along the worktop edge after the deep clean."
          className={inputClass}
        />
      </Field>

      <Field label="Repair or replacement cost" hint="Your best estimate in Ringgit. A quote helps.">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className={inputClass}
        />
      </Field>

      <Field label="Photos" hint="Required — a photo of the damage is what makes a claim assessable.">
        <EvidenceUploader evidence={evidence} onChange={setEvidence} max={6} />
      </Field>

      <Button block variant="primary" disabled={submitting} onClick={submit}>
        {submitting ? 'Filing…' : 'File claim'}
      </Button>
    </PageShell>
  );
}

// ─── Detail ──────────────────────────────────────────────────────────────────

function ClaimDetail({ claimId }) {
  const [claim, setClaim] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    servisaku.damageClaims.get(claimId).then(setClaim).catch(() => setFailed(true));
  }, [claimId]);

  if (failed) {
    return (
      <PageShell title="Damage claim">
        <EmptyState icon={ShieldAlert} title="Claim not found" body="It may have been withdrawn, or it belongs to another account." />
      </PageShell>
    );
  }
  if (!claim) return <PageShell title="Damage claim"><Loading /></PageShell>;

  // The stages the server actually reports, in the order they happen.
  const stages = [
    { key: 'submitted', label: 'Filed', at: claim.created_date ?? claim.createdAt },
    { key: 'acknowledged', label: 'Acknowledged', at: claim.acknowledged_at ?? claim.acknowledgedAt },
    { key: 'partner', label: 'Professional responded', at: claim.partner_responded_at ?? claim.partnerRespondedAt },
    { key: 'decided', label: 'Decision', at: claim.decided_at ?? claim.decidedAt },
    { key: 'paid', label: 'Compensation', at: claim.compensated_at ?? claim.compensatedAt },
  ];

  return (
    <PageShell title="Damage claim" action={<StatusPill status={claim.status} />}>
      <Card>
        <p className="font-semibold">{claim.item_description ?? claim.itemDescription}</p>
        <p className="mt-1 text-sm text-ink-secondary">{claim.incident_description ?? claim.incidentDescription}</p>
        <div className="mt-3 flex items-baseline gap-4 border-t border-hairline pt-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink-tertiary">Claimed</p>
            <p className="font-semibold">{formatMYR(claim.claimed_amount ?? claim.claimedAmount, { decimals: true })}</p>
          </div>
          {(claim.approved_amount ?? claim.approvedAmount) != null && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-tertiary">Approved</p>
              <p className="font-semibold text-success">{formatMYR(claim.approved_amount ?? claim.approvedAmount, { decimals: true })}</p>
            </div>
          )}
        </div>
      </Card>

      {(claim.evidence?.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {claim.evidence.map((e, i) => (
            <img key={e.url || i} src={e.url} alt={e.caption || 'Evidence'} className="h-20 w-20 rounded-lg object-cover border border-hairline" />
          ))}
        </div>
      )}

      <Card>
        <p className="text-sm font-semibold mb-2">Progress</p>
        <ol className="space-y-2.5">
          {stages.map((s) => (
            <li key={s.key} className="flex items-start gap-2.5">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${s.at ? 'bg-brand' : 'bg-hairline'}`} />
              <div className="min-w-0">
                <p className={`text-sm ${s.at ? '' : 'text-ink-tertiary'}`}>{s.label}</p>
                {s.at && <p className="text-xs text-ink-secondary">{fmtDateTime(s.at)}</p>}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {(claim.decision_note ?? claim.decisionNote) && (
        <Card>
          <p className="text-sm font-semibold">Outcome</p>
          <p className="mt-1 text-sm text-ink-secondary">{claim.decision_note ?? claim.decisionNote}</p>
        </Card>
      )}
    </PageShell>
  );
}
