import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { User, Briefcase, MapPin, Image as ImageIcon, CreditCard, CheckCircle2, ArrowRight, ArrowLeft, X, ShieldCheck } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { CITIES } from '@/lib/services';
import { PhotoCapture } from '@/components/partner/PhotoCapture';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const STEPS = [
  { id: 'personal', label: 'Personal', icon: User },
  { id: 'pro', label: 'Professional', icon: Briefcase },
  { id: 'coverage', label: 'Coverage', icon: MapPin },
  { id: 'portfolio', label: 'Portfolio', icon: ImageIcon },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'review', label: 'Review', icon: CheckCircle2 },
];

const GENDERS = ['Male', 'Female', 'Prefer not to say'];
const LANGUAGES = ['English', 'Bahasa Malaysia', 'Mandarin', 'Tamil', 'Cantonese', 'Hokkien'];
const VEHICLES = ['None', 'Motorcycle', 'Car', 'Van', 'Lorry'];
const BANKS = ['Maybank', 'CIMB', 'Public Bank', 'RHB', 'AmBank', 'Hong Leong', 'Bank Islam', 'BSN'];

const EMPTY = {
  full_name: '', phone: '', gender: '', dob: '', bio: '',
  experience_years: 1, skills: [], categories: [], languages: [],
  service_areas: [], coverage_radius_km: 10, vehicle_type: 'Motorcycle', business_name: '',
  portfolio: [], bank_name: '', bank_account: '', ic_number: '', tax_number: '',
};

function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-brand text-white' : 'bg-raised text-ink-secondary hover:text-ink'}`}>
      {children}
    </button>
  );
}
function Field({ label, children }) {
  return <label className="block text-xs font-medium text-ink-secondary">{label}<div className="mt-1">{children}</div></label>;
}
const inputCls = 'w-full rounded-xl bg-raised px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-brand/30';

export default function PartnerOnboarding() {
  const navigate = useNavigate();
  const { data: categories } = useQuery({
    queryKey: ['onboarding-categories'], queryFn: () => servisaku.catalog.getCategories(), staleTime: 5 * 60 * 1000,
  });
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [skillInput, setSkillInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  // Load any saved draft + prefill name/phone from the account.
  useEffect(() => {
    servisaku.onboarding.get().then((d) => {
      setForm({ ...EMPTY, full_name: d.account?.full_name || '', phone: d.account?.phone || '', ...(d.draft || {}) });
      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleIn = (key, val) => set({ [key]: form[key].includes(val) ? form[key].filter((v) => v !== val) : [...form[key], val] });

  const saveDraft = (data) => servisaku.onboarding.saveDraft(data).catch(() => {});
  const next = () => { saveDraft(form); setStep((s) => Math.min(STEPS.length - 1, s + 1)); };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const addSkill = () => { const s = skillInput.trim(); if (s && !form.skills.includes(s)) set({ skills: [...form.skills, s] }); setSkillInput(''); };

  const uploadPortfolio = async (files) => {
    setUploading(true);
    try {
      const added = [];
      for (const file of Array.from(files)) {
        const { file_url } = await servisaku.integrations.Core.UploadFile({ file });
        added.push({ url: file_url });
      }
      set({ portfolio: [...form.portfolio, ...added] });
    } catch (e) { toast.error(e.message || 'Upload failed'); } finally { setUploading(false); }
  };

  const submit = async () => {
    setSaving(true);
    try {
      await servisaku.onboarding.submit(form);
      toast.success('Application submitted 🎉');
      setStep(STEPS.length - 1);
      navigate('/partner');
    } catch (e) { toast.error(e.message || 'Submission failed'); } finally { setSaving(false); }
  };

  if (!ready) return (
    <div className="flex justify-center pt-32"><div className="w-6 h-6 border-2 border-raised border-t-brand rounded-full animate-spin" /></div>
  );

  const progress = (step / (STEPS.length - 1)) * 100;
  const StepIcon = STEPS[step].icon;

  return (
    <div className="min-h-screen bg-bg font-inter" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-ink via-brand to-brand/80 px-5 lg:px-8 pt-14 lg:pt-8 pb-6">
        <p className="text-white/60 text-xs">Partner registration</p>
        <h1 className="text-xl font-bold text-white mt-0.5">Join ServisAku as a Pro</h1>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 flex items-center gap-2 text-white/80 text-xs font-semibold">
          <StepIcon className="h-4 w-4" /> Step {step + 1} of {STEPS.length} · {STEPS[step].label}
        </div>
      </div>

      <div className="px-5 lg:px-8 max-w-xl mx-auto pt-5 space-y-4">
        {/* 0 Personal */}
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Full name (as per MyKad)"><input value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} className={inputCls} /></Field>
            <Field label="Phone"><input value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+60…" className={inputCls} /></Field>
            <div>
              <p className="text-xs font-medium text-ink-secondary mb-1.5">Gender</p>
              <div className="flex gap-2">{GENDERS.map((g) => <Chip key={g} active={form.gender === g} onClick={() => set({ gender: g })}>{g}</Chip>)}</div>
            </div>
            <Field label="Date of birth"><input type="date" value={form.dob} onChange={(e) => set({ dob: e.target.value })} className={inputCls} /></Field>
          </div>
        )}

        {/* 1 Professional */}
        {step === 1 && (
          <div className="space-y-4">
            <Field label="About you"><textarea value={form.bio} onChange={(e) => set({ bio: e.target.value })} rows={3} placeholder="Your experience, specialties…" className={`${inputCls} resize-none`} /></Field>
            <div>
              <div className="flex items-center justify-between mb-1"><p className="text-xs font-medium text-ink-secondary">Years of experience</p><span className="text-sm font-bold text-brand">{form.experience_years}</span></div>
              <input type="range" min="0" max="40" value={form.experience_years} onChange={(e) => set({ experience_years: Number(e.target.value) })} className="w-full accent-brand" />
            </div>
            <div>
              <p className="text-xs font-medium text-ink-secondary mb-1.5">Skills</p>
              <div className="flex gap-2">
                <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())} placeholder="Add a skill" className={inputCls} />
                <Button onClick={addSkill} className="h-auto rounded-xl bg-brand text-white px-4">Add</Button>
              </div>
              {form.skills.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">{form.skills.map((s) => (
                  <span key={s} className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1 text-xs text-ink">{s}<button onClick={() => set({ skills: form.skills.filter((x) => x !== s) })}><X className="h-3 w-3 text-ink-tertiary" /></button></span>
                ))}</div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-ink-secondary mb-1.5">Categories you serve</p>
              <div className="flex flex-wrap gap-2">{(categories || []).map((c) => <Chip key={c.slug} active={form.categories.includes(c.slug)} onClick={() => toggleIn('categories', c.slug)}>{c.name}</Chip>)}</div>
            </div>
            <div>
              <p className="text-xs font-medium text-ink-secondary mb-1.5">Languages</p>
              <div className="flex flex-wrap gap-2">{LANGUAGES.map((l) => <Chip key={l} active={form.languages.includes(l)} onClick={() => toggleIn('languages', l)}>{l}</Chip>)}</div>
            </div>
          </div>
        )}

        {/* 2 Coverage */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-ink-secondary mb-1.5">Service areas</p>
              <div className="flex flex-wrap gap-2">{CITIES.map((c) => <Chip key={c} active={form.service_areas.includes(c)} onClick={() => toggleIn('service_areas', c)}>{c}</Chip>)}</div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1"><p className="text-xs font-medium text-ink-secondary">Coverage radius</p><span className="text-sm font-bold text-brand">{form.coverage_radius_km} km</span></div>
              <input type="range" min="1" max="100" value={form.coverage_radius_km} onChange={(e) => set({ coverage_radius_km: Number(e.target.value) })} className="w-full accent-brand" />
            </div>
            <div>
              <p className="text-xs font-medium text-ink-secondary mb-1.5">Vehicle</p>
              <div className="flex flex-wrap gap-2">{VEHICLES.map((v) => <Chip key={v} active={form.vehicle_type === v} onClick={() => set({ vehicle_type: v })}>{v}</Chip>)}</div>
            </div>
            <Field label="Business name (optional)"><input value={form.business_name} onChange={(e) => set({ business_name: e.target.value })} placeholder="If registered (Sdn Bhd / Enterprise)" className={inputCls} /></Field>
          </div>
        )}

        {/* 3 Portfolio */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">Showcase your work</p>
            <p className="text-xs text-ink-secondary">Add before/after or previous work photos. These appear on your profile.</p>
            <PhotoCapture photos={form.portfolio} uploading={uploading} onFiles={uploadPortfolio} />
          </div>
        )}

        {/* 4 Payments */}
        {step === 4 && (
          <div className="space-y-4">
            <Field label="Bank"><select value={form.bank_name} onChange={(e) => set({ bank_name: e.target.value })} className={inputCls}><option value="">Select bank</option>{BANKS.map((b) => <option key={b} value={b}>{b}</option>)}</select></Field>
            <Field label="Bank account number"><input value={form.bank_account} onChange={(e) => set({ bank_account: e.target.value.replace(/\s/g, '') })} placeholder="Account number" className={inputCls} /></Field>
            <Field label="IC number (MyKad)"><input value={form.ic_number} onChange={(e) => set({ ic_number: e.target.value })} placeholder="900101-14-5567" className={inputCls} /></Field>
            <Field label="Income tax no. (LHDN, optional)"><input value={form.tax_number} onChange={(e) => set({ tax_number: e.target.value })} className={inputCls} /></Field>
            <div className="flex items-start gap-2 rounded-xl bg-brand-tint/40 p-3 text-xs text-brand-ink">
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-brand" />
              Identity documents (MyKad, certificates, insurance) are uploaded in the Verification Center after registration.
            </div>
          </div>
        )}

        {/* 5 Review */}
        {step === 5 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">Review & submit</p>
            {[
              ['Name', form.full_name], ['Phone', form.phone], ['Experience', `${form.experience_years} yrs`],
              ['Categories', form.categories.length], ['Languages', form.languages.join(', ') || '—'],
              ['Service areas', form.service_areas.join(', ') || '—'], ['Vehicle', form.vehicle_type],
              ['Portfolio', `${form.portfolio.length} photos`], ['Bank', form.bank_name || '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-hairline/10 py-2 text-sm last:border-0">
                <span className="text-ink-secondary">{k}</span><span className="font-semibold text-ink text-right max-w-[60%] truncate">{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <div className="max-w-xl mx-auto bg-surface/95 backdrop-blur-xl border-t border-hairline/10 px-5 py-4 flex gap-3"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
          {step > 0 && <Button onClick={back} variant="outline" className="h-12 rounded-2xl px-5"><ArrowLeft className="h-4 w-4" /></Button>}
          {step < STEPS.length - 1 ? (
            <Button onClick={next} className="flex-1 h-12 rounded-2xl bg-brand text-white font-bold hover:bg-brand/90">Continue <ArrowRight className="h-4 w-4 ml-1" /></Button>
          ) : (
            <Button onClick={submit} disabled={saving} className="flex-1 h-12 rounded-2xl bg-brand text-white font-bold hover:bg-brand/90">{saving ? 'Submitting…' : 'Submit application'}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
