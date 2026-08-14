import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, MessageSquare, AlertTriangle, ChevronDown, Plus } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import moment from 'moment';

const SUPPORT_PHONE = '+60322998888';
const EMERGENCY_PHONE = '+60322990000';

const FAQS = [
  { q: 'When do I get paid?', a: 'Completed jobs add to your wallet. Withdraw to your Malaysian bank anytime from the Wallet — funds arrive in 1–3 business days.' },
  { q: 'How do I add extra work during a job?', a: 'Open the job, tap "Add extra service", and propose it. The customer approves and the invoice updates automatically. Never take cash.' },
  { q: 'What if the customer is not home?', a: 'Use "Cannot Access" on the job screen to alert the customer and support. Wait the grace period before marking it.' },
  { q: 'How is my rating calculated?', a: 'It is the average of customer star ratings on completed jobs. Reply professionally to feedback to build trust.' },
  { q: 'Why am I not getting jobs?', a: 'Check you are Online, not in Vacation mode, fully verified, and that your coverage area and categories are set in Availability.' },
];

const CATEGORIES = [
  { id: 'technical', label: 'Technical issue' },
  { id: 'payment', label: 'Payment issue' },
  { id: 'booking', label: 'Booking issue' },
  { id: 'report_customer', label: 'Report a customer' },
  { id: 'other', label: 'Other' },
];

const STATUS_PILL = { open: 'bg-warning-tint text-warning', resolved: 'bg-success-tint text-success' };

function Card({ children, className = '' }) {
  return <div className={`bg-surface rounded-2xl border border-hairline/10 shadow-e1 p-4 ${className}`}>{children}</div>;
}

export default function PartnerSupport() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [openFaq, setOpenFaq] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: 'technical', subject: '', message: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { servisaku.support.list().then(setTickets).catch(() => {}); }, []);

  const submit = async () => {
    if (form.subject.trim().length < 3 || form.message.trim().length < 5) return toast.error('Add a subject and a short description');
    setSubmitting(true);
    try {
      const t = await servisaku.support.create({ category: form.category, subject: form.subject.trim(), message: form.message.trim() });
      setTickets((ts) => [t, ...ts]);
      setForm({ category: 'technical', subject: '', message: '' });
      setShowForm(false);
      toast.success('Ticket raised — we’ll get back to you');
    } catch (e) { toast.error(e.message || 'Could not raise ticket'); } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-bg font-inter" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
      <div className="bg-gradient-to-br from-brand-ink via-brand to-brand/80 px-5 lg:px-8 pt-14 lg:pt-8 pb-8">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <ArrowLeft className="h-4 w-4 text-white" />
          </button>
          <div><p className="text-white/60 text-xs">Support</p><h1 className="text-xl font-semibold text-white">How can we help?</h1></div>
        </div>
      </div>

      <div className="px-5 lg:px-8 max-w-2xl mx-auto -mt-4 space-y-5">
        {/* Contact actions */}
        <div className="grid grid-cols-3 gap-3">
          <a href={`tel:${SUPPORT_PHONE}`} className="flex flex-col items-center gap-2 rounded-2xl border border-hairline/10 bg-surface p-4 shadow-e1 hover:shadow-e2 transition-all">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint text-brand"><Phone className="h-5 w-5" /></div>
            <span className="text-[11px] font-semibold text-ink">Call support</span>
          </a>
          <button onClick={() => navigate('/notifications')} className="flex flex-col items-center gap-2 rounded-2xl border border-hairline/10 bg-surface p-4 shadow-e1 hover:shadow-e2 transition-all">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info-tint text-info"><MessageSquare className="h-5 w-5" /></div>
            <span className="text-[11px] font-semibold text-ink">Live chat</span>
          </button>
          <a href={`tel:${EMERGENCY_PHONE}`} className="flex flex-col items-center gap-2 rounded-2xl border border-danger/30 bg-danger-tint p-4 shadow-e1 hover:shadow-e2 transition-all">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger-tint text-danger"><AlertTriangle className="h-5 w-5" /></div>
            <span className="text-[11px] font-semibold text-danger">Emergency</span>
          </a>
        </div>

        {/* Raise ticket */}
        <div className="space-y-3">
          <SectionHeader title="Tickets" action={
            <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-xs font-semibold text-brand"><Plus className="h-3.5 w-3.5" /> Raise ticket</button>
          } />
          {showForm && (
            <Card className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c.id} onClick={() => setForm((f) => ({ ...f, category: c.id }))}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${form.category === c.id ? 'bg-brand text-white' : 'bg-raised text-ink-secondary'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
              <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Subject"
                className="w-full rounded-xl bg-raised px-3 py-2.5 text-sm text-ink outline-none focus:ring-1 focus:ring-brand" />
              <textarea value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} rows={3} placeholder="Describe the issue…"
                className="w-full rounded-xl bg-raised px-3 py-2.5 text-sm text-ink outline-none focus:ring-1 focus:ring-brand" />
              <Button onClick={submit} disabled={submitting} className="w-full h-10 rounded-xl bg-brand text-white hover:bg-brand/90">{submitting ? 'Submitting…' : 'Submit ticket'}</Button>
            </Card>
          )}
          {tickets.length === 0 ? (
            <Card className="text-center py-6"><p className="text-xs text-ink-secondary">No tickets yet</p></Card>
          ) : tickets.map((t) => (
            <Card key={t.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{t.subject}</p>
                  <p className="text-[11px] text-ink-secondary">{CATEGORIES.find((c) => c.id === t.category)?.label} · {moment(t.created_date).format('D MMM')}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_PILL[t.status] || 'bg-raised text-ink-secondary'}`}>{t.status}</span>
              </div>
            </Card>
          ))}
        </div>

        {/* FAQs */}
        <div className="space-y-2">
          <SectionHeader title="FAQs" className="mb-1" />
          {FAQS.map((f, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-hairline/10 bg-surface shadow-e1">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <span className="text-sm font-medium text-ink">{f.q}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-ink-secondary transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && <p className="border-t border-hairline/10 px-4 py-3 text-xs leading-relaxed text-ink-secondary">{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
