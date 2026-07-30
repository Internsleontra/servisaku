import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Clock, XCircle, AlertTriangle, Upload, CheckCircle2, FileText } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import moment from 'moment';

const STATUS = {
  verified: { pill: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2, label: 'Verified' },
  pending: { pill: 'bg-amber-50 text-amber-700', icon: Clock, label: 'Pending' },
  rejected: { pill: 'bg-red-50 text-red-600', icon: XCircle, label: 'Rejected' },
  expired: { pill: 'bg-orange-50 text-orange-600', icon: AlertTriangle, label: 'Expired' },
  missing: { pill: 'bg-raised text-ink-secondary', icon: FileText, label: 'Missing' },
};
const GROUP_ORDER = ['Identity', 'Professional', 'Financial', 'Business'];
const PLACEHOLDER = { mykad: '900101-14-5567', ssm: '202301012345', skill_cert: 'CIDB / ST cert no.', bank: 'Account number' };

function Card({ children, className = '' }) {
  return <div className={`bg-surface rounded-2xl border border-hairline/10 shadow-e1 p-4 ${className}`}>{children}</div>;
}

export default function PartnerVerification() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [active, setActive] = useState(null); // catalog doc being uploaded
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { servisaku.documents.list().then(setData); }, []);

  const openUpload = (doc) => { setActive(doc); setNumber(doc.number || ''); setExpiry(doc.expiry_date ? moment(doc.expiry_date).format('YYYY-MM-DD') : ''); setFile(null); };

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

  if (!data) return (
    <div className="flex justify-center pt-32"><div className="w-6 h-6 border-2 border-raised border-t-brand rounded-full animate-spin" /></div>
  );

  const groups = GROUP_ORDER
    .map((g) => ({ group: g, items: data.documents.filter((d) => d.group === g) }))
    .filter((g) => g.items.length);

  return (
    <div className="min-h-screen bg-bg font-inter" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-ink via-brand to-brand/80 px-5 lg:px-8 pt-14 lg:pt-8 pb-8">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <ArrowLeft className="h-4 w-4 text-white" />
          </button>
          <div>
            <p className="text-white/60 text-xs">Verification Center</p>
            <h1 className="text-xl font-bold text-white">Get verified</h1>
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/70 text-xs font-medium">{data.required_verified} of {data.required_total} required documents verified</p>
            <span className="text-white font-bold text-sm">{data.progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-surface transition-all" style={{ width: `${data.progress}%` }} />
          </div>
          <div className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${data.activated ? 'bg-emerald-500/20 text-white' : 'bg-white/10 text-white/80'}`}>
            <ShieldCheck className="h-4 w-4" />
            {data.activated ? 'You are fully verified and active' : 'Complete required documents to activate your account'}
          </div>
        </div>
      </div>

      <div className="px-5 lg:px-8 max-w-2xl mx-auto pt-5 space-y-5">
        {groups.map(({ group, items }) => (
          <div key={group} className="space-y-3">
            <SectionHeader title={group} />
            {items.map((doc) => {
              const meta = STATUS[doc.status] || STATUS.missing;
              const Icon = meta.icon;
              const expiringSoon = doc.expiry_date && doc.status === 'verified' && moment(doc.expiry_date).diff(moment(), 'days') <= 30;
              return (
                <Card key={doc.type}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-ink">{doc.label}</p>
                        {doc.required && <span className="text-[9px] font-bold uppercase tracking-wide text-brand">Required</span>}
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-secondary">{doc.help}</p>
                      {doc.number && <p className="mt-1 text-[11px] font-medium text-ink">{doc.number}</p>}
                      {doc.expiry_date && (
                        <p className={`mt-1 text-[11px] ${doc.status === 'expired' || expiringSoon ? 'text-orange-600 font-semibold' : 'text-ink-tertiary'}`}>
                          {doc.status === 'expired' ? 'Expired ' : 'Valid until '}{moment(doc.expiry_date).format('D MMM YYYY')}
                          {expiringSoon && ' · renew soon'}
                        </p>
                      )}
                      {doc.status === 'rejected' && doc.rejection_reason && (
                        <p className="mt-1 text-[11px] text-red-600">Reason: {doc.rejection_reason}</p>
                      )}
                    </div>
                    <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.pill}`}>
                      <Icon className="h-3 w-3" /> {meta.label}
                    </span>
                  </div>
                  {doc.status !== 'verified' && (
                    <Button onClick={() => openUpload(doc)} variant="outline"
                      className="mt-3 h-9 w-full rounded-xl border-brand/30 text-xs font-semibold text-brand hover:bg-brand-tint">
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      {doc.status === 'missing' ? 'Upload' : doc.status === 'rejected' ? 'Re-submit' : doc.status === 'expired' ? 'Renew' : 'Update'}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        ))}
      </div>

      {/* Upload sheet */}
      {active && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setActive(null)}>
          <div className="w-full max-w-lg rounded-t-3xl bg-surface p-5" onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hairline/30" />
            <h2 className="text-lg font-bold text-ink">{active.label}</h2>
            <p className="text-xs text-ink-secondary mt-0.5">{active.help}</p>

            <div className="mt-4 space-y-3">
              {active.hasNumber && (
                <label className="block text-xs font-medium text-ink-secondary">{active.numberLabel}
                  <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder={PLACEHOLDER[active.type] || ''}
                    className="mt-1 w-full rounded-xl bg-raised px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-brand/30" />
                </label>
              )}
              {active.hasExpiry && (
                <label className="block text-xs font-medium text-ink-secondary">Expiry date
                  <input type="date" value={expiry} min={moment().format('YYYY-MM-DD')} onChange={(e) => setExpiry(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-raised px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-brand/30" />
                </label>
              )}
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-hairline/40 px-4 py-3 hover:border-brand">
                <Upload className="h-5 w-5 text-ink-secondary" />
                <span className="text-sm text-ink-secondary truncate">{file ? file.name : 'Attach a photo or PDF'}</span>
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            <div className="mt-5 flex gap-2">
              <Button onClick={() => setActive(null)} variant="outline" className="flex-1 h-11 rounded-xl">Cancel</Button>
              <Button onClick={submit} disabled={submitting} className="flex-1 h-11 rounded-xl bg-brand text-white hover:bg-brand/90">
                {submitting ? 'Submitting…' : 'Submit'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
