import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles, Phone, User, MapPin, Wrench, Briefcase, FileText, CreditCard,
  CalendarClock, Package, Camera, ShieldCheck, CheckCircle2, ClipboardCheck,
  ArrowRight, ArrowLeft, X, Check, Upload, TrendingUp, Clock, Wallet,
} from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { CITIES } from '@/lib/services';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/* ── Step definitions ── */
const STEPS = [
  { id: 'welcome', label: 'Welcome', icon: Sparkles },
  { id: 'phone', label: 'Phone', icon: Phone },
  { id: 'basic', label: 'Basic Info', icon: User },
  { id: 'location', label: 'Location', icon: MapPin },
  { id: 'services', label: 'Services', icon: Wrench },
  { id: 'experience', label: 'Experience', icon: Briefcase },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'bank', label: 'Bank', icon: CreditCard },
  { id: 'availability', label: 'Availability', icon: CalendarClock },
  { id: 'equipment', label: 'Equipment', icon: Package },
  { id: 'photo', label: 'Photo', icon: Camera },
  { id: 'agreements', label: 'Agreements', icon: ShieldCheck },
  { id: 'review', label: 'Review', icon: ClipboardCheck },
];

const GENDERS = ['Male', 'Female', 'Prefer not to say'];
const LANGUAGES = ['English', 'Bahasa Malaysia', 'Mandarin', 'Tamil', 'Cantonese'];
const EXAMPLE_SERVICES = ['Cleaning', 'Plumbing', 'Electrical', 'AC Services', 'Beauty', 'Pest Control', 'Handyman', 'Appliance Repair'];
const BANKS = ['Maybank', 'CIMB', 'Public Bank', 'RHB', 'AmBank', 'Hong Leong', 'Bank Islam', 'BSN'];
const EMPLOYMENT = ['Self-employed', 'Company'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EQUIPMENT = ['Own Vehicle', 'Cleaning Equipment', 'Electrical Tools', 'Plumbing Tools', 'AC Equipment', 'Ladder', 'Drill Machine'];

const EMPTY = {
  phone: '', phone_verified: false,
  full_name: '', email: '', dob: '', gender: '', language: '',
  city: '', address: '', postcode: '', gps: null, coverage_radius_km: 15,
  categories: [], services: [],
  experience_years: 2, previous_company: '', employment_type: '', skills: [], certifications: '',
  doc_nric: null, ic_number: '', doc_selfie: null, doc_bank: null,
  doc_insurance: null, insurance_number: '', insurance_expiry: '',
  doc_ssm: null, ssm_number: '', doc_license: null,
  doc_permit: null, permit_number: '', permit_expiry: '',
  doc_cert: null, cert_number: '', cert_expiry: '',
  bank_holder: '', bank_name: '', bank_account: '',
  working_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], work_start: '09:00', work_end: '18:00', vacation_mode: false,
  equipment: [],
  profile_photo: null,
  agree_background: false, agree_partner: false, agree_privacy: false, agree_terms: false,
};

/* ── Mapping to the backend KYC shape ──────────────────────────────────────
 * The wizard form is UI-shaped; the backend expects two different payloads:
 *  1) POST /partners/me/onboarding/submit — the profile (unknown keys are
 *     stripped, so we send exactly its schema fields).
 *  2) POST /partners/me/documents — one call per uploaded KYC document,
 *     as { type, file_url, number }. `mykad` needs the 12-digit IC number and
 *     `ssm` needs the registration number; the rest accept a file alone.
 */
const digitsOnly = (s) => String(s || '').replace(/\D/g, '');
const validIC = (s) => digitsOnly(s).length === 12;
const validSSM = (s) => /^[A-Za-z0-9-]{6,20}$/.test(String(s || '').trim());

function toProfilePayload(f) {
  const p = {
    full_name: f.full_name || undefined,
    phone: f.phone || undefined,
    city: f.city || undefined,
    gender: f.gender || undefined,
    dob: f.dob || undefined,
    bio: f.certifications || undefined,
    experience_years: Number.isFinite(f.experience_years) ? f.experience_years : undefined,
    skills: f.services?.length ? f.services : undefined,
    categories: f.categories?.length ? f.categories : undefined,
    languages: f.language ? [f.language] : undefined,
    service_areas: f.city ? [f.city] : undefined,
    coverage_radius_km: f.coverage_radius_km || undefined,
    vehicle_type: f.equipment?.includes('Own Vehicle') ? 'Car' : 'None',
    business_name: f.employment_type === 'Company' && f.previous_company ? f.previous_company : undefined,
    bank_name: f.bank_name || undefined,
    bank_account: f.bank_account || undefined,
    ic_number: f.ic_number || undefined,
  };
  // Drop undefined so we don't send empty keys.
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));
}

function toDocumentSubmissions(f) {
  const docs = [];
  if (f.doc_nric) docs.push({ type: 'mykad', file_url: f.doc_nric.url, number: digitsOnly(f.ic_number) });
  if (f.doc_selfie) docs.push({ type: 'selfie', file_url: f.doc_selfie.url });
  if (f.doc_bank) docs.push({ type: 'bank', file_url: f.doc_bank.url, number: f.bank_account || undefined });
  if (f.doc_insurance) docs.push({ type: 'insurance', file_url: f.doc_insurance.url, number: f.insurance_number || undefined, expiry_date: f.insurance_expiry || undefined });
  if (f.doc_ssm && validSSM(f.ssm_number)) docs.push({ type: 'ssm', file_url: f.doc_ssm.url, number: f.ssm_number.trim() });
  if (f.doc_license) docs.push({ type: 'driving_licence', file_url: f.doc_license.url });
  if (f.doc_cert) docs.push({ type: 'skill_cert', file_url: f.doc_cert.url, number: f.cert_number || undefined, expiry_date: f.cert_expiry || undefined });
  if (f.doc_permit) docs.push({ type: 'work_permit', file_url: f.doc_permit.url, number: f.permit_number || undefined, expiry_date: f.permit_expiry || undefined });
  return docs;
}

/* ── Reusable bits ── */
const inputCls = 'w-full rounded-xl bg-raised px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-brand/30';
const Field = ({ label, children }) => (
  <label className="block text-xs font-medium text-ink-secondary">{label}<div className="mt-1">{children}</div></label>
);
const Chip = ({ active, onClick, children }) => (
  <button type="button" onClick={onClick}
    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-brand text-white' : 'bg-raised text-ink-secondary hover:text-ink'}`}>
    {children}
  </button>
);
function Toggle({ checked, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-raised'}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-surface shadow-e1 transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}
function Check4({ checked, onChange, children }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-start gap-3 rounded-xl border border-hairline p-3.5 text-left transition-colors hover:bg-raised/40">
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-brand bg-brand text-white' : 'border-hairline'}`}>
        {checked && <Check className="h-3.5 w-3.5" />}
      </span>
      <span className="text-sm text-ink">{children}</span>
    </button>
  );
}
function DocUpload({ label, hint, value, onChange, optional }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const pick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const { file_url } = await servisaku.integrations.Core.UploadFile({ file: f });
      onChange({ url: file_url, name: f.name });
    } catch (err) { toast.error(err.message || 'Upload failed'); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-xl border border-hairline p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{label}{optional && <span className="ml-1 text-xs font-normal text-ink-tertiary">· optional</span>}</p>
          {hint && <p className="mt-0.5 text-xs text-ink-secondary">{hint}</p>}
        </div>
        {value ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600">
            <Check className="h-3.5 w-3.5" /> Uploaded
          </span>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => ref.current?.click()}
            className="shrink-0 rounded-xl border-hairline text-xs">
            {busy ? 'Uploading…' : <><Upload className="mr-1 h-3.5 w-3.5" /> Upload</>}
          </Button>
        )}
        <input ref={ref} type="file" accept="image/*,application/pdf" className="hidden" onChange={pick} />
      </div>
      {value && (
        <div className="mt-2 flex items-center gap-2 text-xs text-ink-secondary">
          <FileText className="h-3.5 w-3.5" /><span className="truncate">{value.name}</span>
          <button type="button" onClick={() => onChange(null)} className="ml-auto text-ink-tertiary hover:text-danger"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
}

export default function PartnerOnboarding() {
  const navigate = useNavigate();
  const { data: categories } = useQuery({
    queryKey: ['onboarding-categories'], queryFn: () => servisaku.catalog.getCategories(), staleTime: 5 * 60 * 1000,
  });
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // OTP local state
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(0);
  // Surfaced only when the backend has no SMS provider configured.
  const [devCode, setDevCode] = useState(null);
  // E.164 number the current code was sent to.
  const [otpPhone, setOtpPhone] = useState(null);

  useEffect(() => {
    servisaku.onboarding.get().then((d) => {
      setForm((f) => ({
        ...f,
        full_name: d.account?.full_name || d.account?.fullName || '',
        phone: d.account?.phone || '',
        email: d.account?.email || '',
        ...(d.draft || {}),
      }));
      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleIn = (key, val) => set({ [key]: form[key].includes(val) ? form[key].filter((v) => v !== val) : [...form[key], val] });

  const serviceOptions = (categories && categories.length ? categories.map((c) => c.name) : EXAMPLE_SERVICES);

  // The +60 is a fixed prefix rendered beside the field, so `form.phone` holds
  // only the local part (e.g. "123456789"). The old check demanded the number
  // itself start with 60, so every normally-typed number was rejected and the
  // button did nothing. Normalise here instead.
  const e164Phone = () => {
    const local = String(form.phone || '').replace(/\D/g, '').replace(/^0+/, '');
    return local.length >= 8 && local.length <= 10 ? `+60${local}` : null;
  };

  const sendOtp = async () => {
    const phone = e164Phone();
    if (!phone) { toast.error('Enter a valid Malaysian mobile number'); return; }
    try {
      const res = await servisaku.onboarding.requestPhoneOtp(phone);
      setOtpSent(true);
      // Verify against the number the code actually went to, not whatever the
      // field holds later — the two drift apart if the form reloads from its
      // saved draft or the user edits the number after requesting a code.
      setOtpPhone(phone);
      setCountdown(res?.resend_in ?? 60);
      setDevCode(res?.dev_code || null);
      toast.success(res?.dev_code ? `Demo mode — your code is ${res.dev_code}` : 'Verification code sent');
    } catch (e) {
      toast.error(e?.message || 'Could not send the code');
    }
  };

  const verifyOtp = async () => {
    const phone = otpPhone || e164Phone();
    if (otp.length !== 6) { toast.error('Enter the 6-digit code'); return; }
    if (!phone) { toast.error('Please request a code first'); return; }
    try {
      await servisaku.onboarding.verifyPhoneOtp(phone, otp);
      set({ phone_verified: true });
      setDevCode(null);
      toast.success('Phone verified ✓');
    } catch (e) {
      toast.error(e?.message || 'Incorrect code');
    }
  };

  const canProceed = () => {
    const f = form;
    switch (STEPS[step].id) {
      case 'phone': return f.phone_verified;
      case 'basic': return f.full_name && f.email && f.dob && f.gender && f.language;
      case 'location': return f.city && f.address && f.postcode;
      case 'services': return f.categories.length > 0;
      case 'experience': return !!f.employment_type;
      case 'documents': return f.doc_nric && validIC(f.ic_number) && f.doc_selfie && f.doc_bank;
      case 'bank': return f.bank_holder && f.bank_name && f.bank_account;
      case 'availability': return f.working_days.length > 0;
      case 'photo': return !!f.profile_photo;
      case 'agreements': return f.agree_background && f.agree_partner && f.agree_privacy && f.agree_terms;
      default: return true;
    }
  };

  const saveDraft = () => servisaku.onboarding.saveDraft(form).catch(() => {});
  const next = () => {
    if (!canProceed()) { toast.error('Please complete the required fields'); return; }
    saveDraft();
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const back = () => { setStep((s) => Math.max(0, s - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const goTo = (i) => { setStep(i); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const submit = async () => {
    if (!validIC(form.ic_number)) {
      toast.error('Enter a valid 12-digit IC number');
      goTo(STEPS.findIndex((s) => s.id === 'documents'));
      return;
    }
    setSaving(true);
    try {
      // 1) Profile → onboarding submit (maps to the backend's KYC/profile shape).
      await servisaku.onboarding.submit(toProfilePayload(form));
      // 2) KYC documents → the documents endpoint, one per uploaded doc.
      let failed = 0;
      for (const doc of toDocumentSubmissions(form)) {
        try { await servisaku.documents.submit(doc); } catch { failed += 1; }
      }
      if (failed) toast(`Application submitted — ${failed} document(s) need review in the Verification Center.`);
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { toast.error(e.message || 'Submission failed'); }
    finally { setSaving(false); }
  };

  const uploadProfile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { file_url } = await servisaku.integrations.Core.UploadFile({ file });
      set({ profile_photo: { url: file_url, name: file.name } });
    } catch (err) { toast.error(err.message || 'Upload failed'); }
  };

  if (!ready) return (
    <div className="flex justify-center pt-32"><div className="h-6 w-6 animate-spin rounded-full border-2 border-raised border-t-brand" /></div>
  );

  /* ── Success screen ── */
  if (submitted) return (
    <div className="min-h-screen bg-bg px-5 py-10 font-inter lg:px-8">
      <div className="mx-auto max-w-lg text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold text-ink">Application submitted successfully</h1>
        <p className="mt-2 text-sm text-ink-secondary">Thanks, {form.full_name?.split(' ')[0] || 'partner'}! We've received your application.</p>

        <div className="mt-6 space-y-3 rounded-2xl border border-hairline bg-surface p-5 text-left shadow-e1">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Clock className="h-4 w-4" /></span>
            <div><p className="text-sm font-semibold text-ink">Verification in progress</p><p className="text-xs text-ink-secondary">Estimated approval: 24–48 hours</p></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-tint text-brand"><Phone className="h-4 w-4" /></span>
            <div><p className="text-sm font-semibold text-ink">We'll notify you</p><p className="text-xs text-ink-secondary">You'll get an SMS, email, or app notification once approved.</p></div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-hairline bg-surface p-5 text-left shadow-e1">
          <p className="text-sm font-bold text-ink">Once approved, you'll be able to:</p>
          <ol className="mt-3 space-y-2.5">
            {['Complete your profile', 'Set your service pricing', 'Watch onboarding & training videos', 'Go online to receive bookings'].map((t, i) => (
              <li key={t} className="flex items-center gap-3 text-sm text-ink-secondary">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-bold text-brand">{i + 1}</span>{t}
              </li>
            ))}
          </ol>
        </div>

        <Button onClick={() => navigate('/partner')} className="mt-6 h-12 w-full rounded-2xl bg-brand font-bold text-white hover:bg-brand-ink">
          Go to dashboard
        </Button>
      </div>
    </div>
  );

  const progress = (step / (STEPS.length - 1)) * 100;
  const StepIcon = STEPS[step].icon;
  const id = STEPS[step].id;

  return (
    <div className="min-h-screen bg-bg font-inter" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-ink via-brand to-brand/80 px-5 pb-6 pt-10 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs text-white/60">Partner registration</p>
          <h1 className="mt-0.5 text-xl font-bold text-white">Join ServisAku as a Pro</h1>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-surface transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-white/85">
            <StepIcon className="h-4 w-4" /> Step {step + 1} of {STEPS.length} · {STEPS[step].label}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-5 pt-5 lg:px-8">
        {/* 0 · Welcome */}
        {id === 'welcome' && (
          <div className="space-y-5">
            <div>
              <h2 className="font-display text-2xl font-bold text-ink">Welcome to ServisAku Partner</h2>
              <p className="mt-1.5 text-sm text-ink-secondary">Earn on your own schedule serving customers across Malaysia. Registration takes about 10 minutes.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { icon: Wallet, t: 'RM 3,000–6,000', s: 'avg. monthly earnings' },
                { icon: Clock, t: 'Flexible hours', s: 'work when you want' },
                { icon: TrendingUp, t: 'Steady jobs', s: 'demand in your area' },
              ].map((b) => (
                <div key={b.t} className="rounded-2xl border border-hairline bg-surface p-4 shadow-e1">
                  <b.icon className="h-6 w-6 text-brand" />
                  <p className="mt-2 text-base font-extrabold text-ink">{b.t}</p>
                  <p className="text-xs text-ink-secondary">{b.s}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-hairline bg-brand-tint p-4">
              <p className="text-sm font-bold text-ink">What you'll need</p>
              <ul className="mt-2 space-y-1.5 text-sm text-ink-secondary">
                {['MyKad / Passport & a selfie', 'Bank account for payouts', 'Your skills & service areas'].map((x) => (
                  <li key={x} className="flex items-center gap-2"><Check className="h-4 w-4 text-brand" />{x}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* 1 · Phone verification */}
        {id === 'phone' && (
          <div className="space-y-4">
            <p className="text-sm text-ink-secondary">We'll verify your Malaysian mobile number so customers and dispatch can reach you.</p>
            <Field label="Mobile number">
              <div className="flex gap-2">
                <span className="flex items-center rounded-xl bg-raised px-3 text-sm font-semibold text-ink-secondary">+60</span>
                <input value={form.phone} onChange={(e) => set({ phone: e.target.value, phone_verified: false })} placeholder="12 345 6789" className={inputCls} disabled={form.phone_verified} />
              </div>
            </Field>

            {form.phone_verified ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-600">
                <CheckCircle2 className="h-5 w-5" /> Phone verified
              </div>
            ) : !otpSent ? (
              <Button onClick={sendOtp} className="h-12 w-full rounded-2xl bg-brand font-bold text-white hover:bg-brand-ink">Send verification code</Button>
            ) : (
              <div className="space-y-3">
                <Field label="Enter the 6-digit code">
                  <input value={otp} inputMode="numeric" maxLength={6} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="••••••" className={`${inputCls} tracking-[0.5em]`} />
                </Field>
                <div className="flex items-center justify-between">
                  <button onClick={sendOtp} disabled={countdown > 0} className="text-xs font-semibold text-brand disabled:text-ink-tertiary">
                    {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
                  </button>
                  <Button onClick={verifyOtp} className="rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand-ink">Verify</Button>
                </div>
                {devCode
                  ? <p className="text-xs text-ink-tertiary">Demo mode — no SMS was sent. Your code is <span className="font-mono font-bold text-ink">{devCode}</span>. Set <span className="font-mono">SMS_DEV_MODE=false</span> (with Twilio configured) to send real texts.</p>
                  : <p className="text-xs text-ink-tertiary">Enter the 6-digit code we sent to your phone.</p>}
              </div>
            )}
          </div>
        )}

        {/* 2 · Basic info */}
        {id === 'basic' && (
          <div className="space-y-4">
            <Field label="Full name (as per MyKad)"><input value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} className={inputCls} /></Field>
            <Field label="Email address"><input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="you@example.com" className={inputCls} /></Field>
            <Field label="Date of birth"><input type="date" value={form.dob} onChange={(e) => set({ dob: e.target.value })} className={inputCls} /></Field>
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-secondary">Gender</p>
              <div className="flex flex-wrap gap-2">{GENDERS.map((g) => <Chip key={g} active={form.gender === g} onClick={() => set({ gender: g })}>{g}</Chip>)}</div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-secondary">Preferred language</p>
              <div className="flex flex-wrap gap-2">{LANGUAGES.map((l) => <Chip key={l} active={form.language === l} onClick={() => set({ language: l })}>{l}</Chip>)}</div>
            </div>
          </div>
        )}

        {/* 3 · Location */}
        {id === 'location' && (
          <div className="space-y-4">
            <Field label="Current city">
              <select value={form.city} onChange={(e) => set({ city: e.target.value })} className={inputCls}>
                <option value="">Select city</option>{CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Full address"><textarea value={form.address} onChange={(e) => set({ address: e.target.value })} rows={2} placeholder="Street, unit, area" className={`${inputCls} resize-none`} /></Field>
            <Field label="Postcode"><input value={form.postcode} inputMode="numeric" maxLength={5} onChange={(e) => set({ postcode: e.target.value.replace(/\D/g, '') })} placeholder="50000" className={inputCls} /></Field>
            <Button type="button" variant="outline" onClick={() => {
              if (!navigator.geolocation) { toast.error('Geolocation not available'); return; }
              navigator.geolocation.getCurrentPosition(
                (pos) => { set({ gps: { lat: pos.coords.latitude, lng: pos.coords.longitude } }); toast.success('Location captured'); },
                () => toast.error('Could not get location'),
              );
            }} className="w-full rounded-xl border-hairline">
              <MapPin className="mr-1.5 h-4 w-4" />{form.gps ? 'GPS location captured ✓' : 'Use my GPS location (optional)'}
            </Button>
            <div>
              <div className="mb-1 flex items-center justify-between"><p className="text-xs font-medium text-ink-secondary">Service radius</p><span className="text-sm font-bold text-brand">{form.coverage_radius_km} km</span></div>
              <input type="range" min="5" max="50" step="5" value={form.coverage_radius_km} onChange={(e) => set({ coverage_radius_km: Number(e.target.value) })} className="w-full accent-brand" />
            </div>
          </div>
        )}

        {/* 4 · Services */}
        {id === 'services' && (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-secondary">Categories you serve</p>
              <div className="flex flex-wrap gap-2">{serviceOptions.map((c) => <Chip key={c} active={form.categories.includes(c)} onClick={() => toggleIn('categories', c)}>{c}</Chip>)}</div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-secondary">Specific services you can perform</p>
              <div className="flex flex-wrap gap-2">
                {['Deep cleaning', 'Pipe repair', 'Wiring & sockets', 'AC servicing', 'Haircut', 'Fumigation', 'Furniture assembly', 'Fridge repair', 'Painting', 'Grouting'].map((sv) => (
                  <Chip key={sv} active={form.services.includes(sv)} onClick={() => toggleIn('services', sv)}>{sv}</Chip>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-tertiary">Pick everything you're confident doing — you can refine this later in My Services.</p>
            </div>
          </div>
        )}

        {/* 5 · Experience */}
        {id === 'experience' && (
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between"><p className="text-xs font-medium text-ink-secondary">Years of experience</p><span className="text-sm font-bold text-brand">{form.experience_years} yrs</span></div>
              <input type="range" min="0" max="40" value={form.experience_years} onChange={(e) => set({ experience_years: Number(e.target.value) })} className="w-full accent-brand" />
            </div>
            <Field label="Previous company (optional)"><input value={form.previous_company} onChange={(e) => set({ previous_company: e.target.value })} placeholder="Where you worked before" className={inputCls} /></Field>
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-secondary">Employment type</p>
              <div className="flex gap-2">{EMPLOYMENT.map((t) => <Chip key={t} active={form.employment_type === t} onClick={() => set({ employment_type: t })}>{t}</Chip>)}</div>
            </div>
            <Field label="Skills & certifications"><textarea value={form.certifications} onChange={(e) => set({ certifications: e.target.value })} rows={3} placeholder="e.g. CIDB Green Card, ST wiring licence, 5 yrs AC servicing" className={`${inputCls} resize-none`} /></Field>
          </div>
        )}

        {/* 6 · Documents */}
        {id === 'documents' && (
          <div className="space-y-3">
            <p className="text-sm text-ink-secondary">Required for Malaysia partner verification. Uploads are reviewed by our team.</p>
            <DocUpload label="NRIC / MyKad or Passport" hint="Front & back, or passport photo page" value={form.doc_nric} onChange={(v) => set({ doc_nric: v })} />
            <Field label="IC number (MyKad)">
              <input value={form.ic_number} inputMode="numeric" onChange={(e) => set({ ic_number: e.target.value })} placeholder="900101-14-5567" className={inputCls} />
              {form.ic_number && !validIC(form.ic_number) && <p className="mt-1 text-xs text-danger">IC number must be 12 digits.</p>}
            </Field>
            <DocUpload label="Selfie for verification" hint="A clear photo of your face" value={form.doc_selfie} onChange={(v) => set({ doc_selfie: v })} />
            <DocUpload label="Bank account proof" hint="Bank statement or card showing name & number" value={form.doc_bank} onChange={(v) => set({ doc_bank: v })} />
            <DocUpload label="Public liability insurance" hint="Covers accidental damage during jobs" value={form.doc_insurance} onChange={(v) => set({ doc_insurance: v })} />
            {form.doc_insurance && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Policy number"><input value={form.insurance_number} onChange={(e) => set({ insurance_number: e.target.value })} placeholder="Policy no." className={inputCls} /></Field>
                <Field label="Expiry date"><input type="date" value={form.insurance_expiry} onChange={(e) => set({ insurance_expiry: e.target.value })} className={inputCls} /></Field>
              </div>
            )}
            <DocUpload label="Business registration (SSM)" hint="If registered as a business" value={form.doc_ssm} onChange={(v) => set({ doc_ssm: v })} optional />
            {form.doc_ssm && (
              <Field label="SSM registration number">
                <input value={form.ssm_number} onChange={(e) => set({ ssm_number: e.target.value })} placeholder="202301012345" className={inputCls} />
                {form.ssm_number && !validSSM(form.ssm_number) && <p className="mt-1 text-xs text-danger">Enter a valid SSM number.</p>}
              </Field>
            )}
            <DocUpload label="Driving licence" hint="If your services require driving" value={form.doc_license} onChange={(v) => set({ doc_license: v })} optional />
            <DocUpload label="Work permit" hint="Required for foreign workers" value={form.doc_permit} onChange={(v) => set({ doc_permit: v })} optional />
            {form.doc_permit && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Permit number"><input value={form.permit_number} onChange={(e) => set({ permit_number: e.target.value })} placeholder="PLKS / EP no." className={inputCls} /></Field>
                <Field label="Expiry date"><input type="date" value={form.permit_expiry} onChange={(e) => set({ permit_expiry: e.target.value })} className={inputCls} /></Field>
              </div>
            )}
            <DocUpload label="Professional certificates" hint="CIDB / ST / trade certificates" value={form.doc_cert} onChange={(v) => set({ doc_cert: v })} optional />
            {form.doc_cert && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Certificate / licence no."><input value={form.cert_number} onChange={(e) => set({ cert_number: e.target.value })} placeholder="CIDB / ST / SPAN no." className={inputCls} /></Field>
                <Field label="Expiry date"><input type="date" value={form.cert_expiry} onChange={(e) => set({ cert_expiry: e.target.value })} className={inputCls} /></Field>
              </div>
            )}
          </div>
        )}

        {/* 7 · Bank */}
        {id === 'bank' && (
          <div className="space-y-4">
            <Field label="Account holder name"><input value={form.bank_holder} onChange={(e) => set({ bank_holder: e.target.value })} placeholder="As per bank records" className={inputCls} /></Field>
            <Field label="Bank"><select value={form.bank_name} onChange={(e) => set({ bank_name: e.target.value })} className={inputCls}><option value="">Select bank</option>{BANKS.map((b) => <option key={b} value={b}>{b}</option>)}</select></Field>
            <Field label="Account number"><input value={form.bank_account} inputMode="numeric" onChange={(e) => set({ bank_account: e.target.value.replace(/\s/g, '') })} placeholder="Account number" className={inputCls} /></Field>
            <div className="flex items-start gap-2 rounded-xl bg-brand-tint/40 p-3 text-xs text-brand-ink">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> Payouts are sent to this account after each completed job. Details are encrypted.
            </div>
          </div>
        )}

        {/* 8 · Availability */}
        {id === 'availability' && (
          <div className="space-y-5">
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-secondary">Working days</p>
              <div className="flex flex-wrap gap-2">{DAYS.map((d) => <Chip key={d} active={form.working_days.includes(d)} onClick={() => toggleIn('working_days', d)}>{d}</Chip>)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start time"><input type="time" value={form.work_start} onChange={(e) => set({ work_start: e.target.value })} className={inputCls} /></Field>
              <Field label="End time"><input type="time" value={form.work_end} onChange={(e) => set({ work_end: e.target.value })} className={inputCls} /></Field>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-hairline p-3.5">
              <div><p className="text-sm font-semibold text-ink">Vacation mode</p><p className="text-xs text-ink-secondary">Start paused — turn off when you're ready for jobs</p></div>
              <Toggle checked={form.vacation_mode} onChange={(v) => set({ vacation_mode: v })} />
            </div>
          </div>
        )}

        {/* 9 · Equipment */}
        {id === 'equipment' && (
          <div className="space-y-3">
            <p className="text-sm text-ink-secondary">Tell us what you already have. This helps us match you to the right jobs.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {EQUIPMENT.map((eq) => (
                <Check4 key={eq} checked={form.equipment.includes(eq)} onChange={() => toggleIn('equipment', eq)}>{eq}</Check4>
              ))}
            </div>
          </div>
        )}

        {/* 10 · Profile photo */}
        {id === 'photo' && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-ink-secondary">A friendly, clear photo builds trust with customers.</p>
            <div className="mx-auto flex h-32 w-32 items-center justify-center overflow-hidden rounded-3xl border border-hairline bg-raised">
              {form.profile_photo
                ? <img src={form.profile_photo.url} alt="Profile" className="h-full w-full object-cover" />
                : <Camera className="h-8 w-8 text-ink-tertiary" />}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-ink">
              <Upload className="h-4 w-4" />{form.profile_photo ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/*" className="hidden" onChange={uploadProfile} />
            </label>
          </div>
        )}

        {/* 11 · Agreements */}
        {id === 'agreements' && (
          <div className="space-y-3">
            <p className="text-sm text-ink-secondary">Please review and accept to continue. We run a background check on every partner.</p>
            <Check4 checked={form.agree_background} onChange={(v) => set({ agree_background: v })}>I consent to a background check on my identity and records.</Check4>
            <Check4 checked={form.agree_partner} onChange={(v) => set({ agree_partner: v })}>I accept the <span className="font-semibold text-brand">Partner Agreement</span>.</Check4>
            <Check4 checked={form.agree_privacy} onChange={(v) => set({ agree_privacy: v })}>I accept the <span className="font-semibold text-brand">Privacy Policy</span>.</Check4>
            <Check4 checked={form.agree_terms} onChange={(v) => set({ agree_terms: v })}>I accept the <span className="font-semibold text-brand">Terms &amp; Conditions</span>.</Check4>
          </div>
        )}

        {/* 12 · Review */}
        {id === 'review' && (
          <div className="space-y-4">
            <p className="text-sm text-ink-secondary">Review your details before submitting. Tap edit to change a section.</p>
            {[
              { label: 'Personal details', to: 2, rows: [['Name', form.full_name], ['Email', form.email], ['Phone', `+60 ${form.phone}`], ['Gender', form.gender], ['Language', form.language]] },
              { label: 'Location', to: 3, rows: [['City', form.city], ['Postcode', form.postcode], ['Radius', `${form.coverage_radius_km} km`]] },
              { label: 'Services', to: 4, rows: [['Categories', form.categories.join(', ') || '—'], ['Services', `${form.services.length} selected`]] },
              { label: 'Experience', to: 5, rows: [['Years', `${form.experience_years} yrs`], ['Type', form.employment_type || '—']] },
              { label: 'Documents', to: 6, rows: [['NRIC/Passport', form.doc_nric ? '✓' : '—'], ['IC number', form.ic_number ? `••••${digitsOnly(form.ic_number).slice(-4)}` : '—'], ['Selfie', form.doc_selfie ? '✓' : '—'], ['Bank proof', form.doc_bank ? '✓' : '—']] },
              { label: 'Bank details', to: 7, rows: [['Holder', form.bank_holder || '—'], ['Bank', form.bank_name || '—'], ['Account', form.bank_account ? `••••${form.bank_account.slice(-4)}` : '—']] },
              { label: 'Availability', to: 8, rows: [['Days', form.working_days.join(', ')], ['Hours', `${form.work_start}–${form.work_end}`]] },
            ].map((sec) => (
              <div key={sec.label} className="rounded-2xl border border-hairline bg-surface p-4 shadow-e1">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-bold text-ink">{sec.label}</p>
                  <button onClick={() => goTo(sec.to)} className="text-xs font-bold text-brand hover:text-brand-ink">Edit</button>
                </div>
                <div className="space-y-1.5">
                  {sec.rows.map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="text-ink-secondary">{k}</span><span className="max-w-[60%] truncate text-right font-semibold text-ink">{String(v || '—')}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="fixed bottom-0 left-0 right-0 z-40 lg:pl-64">
        <div className="mx-auto flex max-w-2xl gap-3 border-t border-hairline bg-surface/95 px-5 py-4 backdrop-blur-xl"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
          {step > 0 && <Button onClick={back} variant="outline" className="h-12 rounded-2xl px-5"><ArrowLeft className="h-4 w-4" /></Button>}
          {id === 'welcome' ? (
            <Button onClick={next} className="h-12 flex-1 rounded-2xl bg-brand font-bold text-white hover:bg-brand-ink">Get Started <ArrowRight className="ml-1 h-4 w-4" /></Button>
          ) : id === 'review' ? (
            <Button onClick={submit} disabled={saving} className="h-12 flex-1 rounded-2xl bg-brand font-bold text-white hover:bg-brand-ink">{saving ? 'Submitting…' : 'Submit application'}</Button>
          ) : (
            <Button onClick={next} className="h-12 flex-1 rounded-2xl bg-brand font-bold text-white hover:bg-brand-ink">Continue <ArrowRight className="ml-1 h-4 w-4" /></Button>
          )}
        </div>
      </div>
    </div>
  );
}
