import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { CheckCircle2, FileText, ScrollText } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { Button } from '@/components/ds';
import { toast } from 'sonner';
import {
  PageShell, Card, EmptyState, Loading, fmtDate,
} from '@/components/records/RecordUI';

/**
 * Legal documents and the acceptance record.
 *
 * `/legal`            → the documents that apply to this account
 * `/legal?doc=slug`   → read one, and accept it if it is outstanding
 *
 * Acceptance is evidentiary: the server records the exact version, the
 * timestamp, the IP and the user agent, all captured server-side. Nothing about
 * that is sent from here, which is the point — a client-supplied acceptance
 * record would be worth nothing.
 */
export default function Legal() {
  const [params] = useSearchParams();
  const slug = params.get('doc');
  return slug ? <DocumentView slug={slug} /> : <DocumentList />;
}

const TITLES = {
  customer_terms: 'Terms & Conditions',
  partner_terms: 'Partner Terms',
  privacy_policy: 'Privacy Notice',
  refund_policy: 'Refund Policy',
  cancellation_policy: 'Cancellation Policy',
  damage_policy: 'Damage Policy',
};

const titleFor = (d) => d.title || TITLES[d.slug] || String(d.slug || '').replace(/_/g, ' ');

// ─── List ────────────────────────────────────────────────────────────────────

function DocumentList() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState(null);
  const [pending, setPending] = useState([]);

  useEffect(() => {
    servisaku.legal.documents()
      .then((r) => setDocuments(Array.isArray(r) ? r : (r.items ?? [])))
      .catch(() => setDocuments([]));
    // Pending needs a session; an anonymous visitor simply has nothing outstanding.
    servisaku.legal.pending()
      .then((r) => setPending(r?.documents ?? (Array.isArray(r) ? r : [])))
      .catch(() => setPending([]));
  }, []);

  if (!documents) return <PageShell title="Legal"><Loading /></PageShell>;

  const pendingSlugs = new Set(pending.map((p) => p.slug));

  return (
    <PageShell title="Legal" subtitle="The terms that apply to your account">
      {pending.length > 0 && (
        <Card className="border-warning/40 bg-warning-tint">
          <p className="text-sm font-semibold">
            {pending.length === 1 ? 'One document needs' : `${pending.length} documents need`} your acceptance
          </p>
          <p className="mt-1 text-sm text-ink-secondary">
            These have changed since you last accepted them.
          </p>
        </Card>
      )}

      {documents.length === 0 ? (
        <EmptyState icon={ScrollText} title="Nothing published yet" body="Our terms will appear here once published." />
      ) : documents.map((d) => (
        <Card key={d.id ?? d.slug} onClick={() => navigate(`/legal?doc=${d.slug}`)}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold truncate">{titleFor(d)}</p>
              <p className="text-xs text-ink-secondary mt-0.5">
                Version {d.version}
                {(d.effective_from ?? d.effectiveFrom) ? ` · in force from ${fmtDate(d.effective_from ?? d.effectiveFrom)}` : ''}
              </p>
            </div>
            {pendingSlugs.has(d.slug)
              ? <span className="shrink-0 rounded-full bg-warning-tint px-2.5 py-0.5 text-[11px] font-semibold text-warning">Action needed</span>
              : <CheckCircle2 className="h-4 w-4 shrink-0 text-success mt-0.5" aria-hidden="true" />}
          </div>
        </Card>
      ))}
    </PageShell>
  );
}

// ─── Document ────────────────────────────────────────────────────────────────

function DocumentView({ slug }) {
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [mustAccept, setMustAccept] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    servisaku.legal.document(slug).then(setDoc).catch(() => setFailed(true));
    servisaku.legal.pending()
      .then((r) => {
        const list = r?.documents ?? (Array.isArray(r) ? r : []);
        setMustAccept(list.some((p) => p.slug === slug));
      })
      .catch(() => setMustAccept(false));
  }, [slug]);

  const accept = async () => {
    setAccepting(true);
    try {
      await servisaku.legal.accept({ document_id: doc.id, slug: doc.slug, version: doc.version });
      setMustAccept(false);
      toast.success('Accepted — thank you');
    } catch (e) {
      toast.error(e.message || 'Could not record that acceptance');
    } finally {
      setAccepting(false);
    }
  };

  if (failed) {
    return (
      <PageShell title="Legal">
        <EmptyState icon={FileText} title="Document not found" body="It may not be published yet." />
      </PageShell>
    );
  }
  if (!doc) return <PageShell title="Legal"><Loading /></PageShell>;

  const body = doc.content_md ?? doc.contentMd ?? '';

  return (
    <PageShell title={titleFor(doc)} subtitle={`Version ${doc.version}`}>
      {mustAccept && (
        <Card className="border-warning/40 bg-warning-tint">
          <p className="text-sm font-semibold">This version needs your acceptance</p>
          {(doc.summary) && <p className="mt-1 text-sm text-ink-secondary">{doc.summary}</p>}
        </Card>
      )}

      {/* prose-sm keeps a long legal document readable on a phone without every
          heading shouting. */}
      <Card>
        <div className="prose prose-sm max-w-none prose-headings:font-semibold prose-headings:text-ink prose-p:text-ink-secondary prose-li:text-ink-secondary prose-strong:text-ink">
          <ReactMarkdown>{body}</ReactMarkdown>
        </div>
      </Card>

      {mustAccept ? (
        <div className="sticky bottom-4">
          <Button block variant="primary" disabled={accepting} onClick={accept}>
            {accepting ? 'Recording…' : `Accept version ${doc.version}`}
          </Button>
        </div>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => navigate('/legal')}>
          Back to documents
        </Button>
      )}

      <p className="text-center text-xs text-ink-secondary">
        Published {fmtDate(doc.published_at ?? doc.publishedAt ?? doc.effective_from ?? doc.effectiveFrom)}.
        Previous versions are kept on record.
      </p>
    </PageShell>
  );
}
