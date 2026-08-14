import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';
import {
  User, Briefcase, CalendarClock, Wallet, ShieldCheck, Wrench, Bell, Lock,
  Globe, Gauge, GraduationCap, Package, LifeBuoy, Scale, SlidersHorizontal,
  Info, UserCog, ChevronRight, Camera, LogOut, Trash2, RefreshCw, Star,
  Share2, KeyRound, Smartphone,
} from 'lucide-react';

/* ── Local, persisted settings state (no backend needed in demo) ── */
const KEY = 'partner_settings';
const loadSettings = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
};
const DEFAULTS = {
  notif_booking: true, notif_payment: true, notif_chat: true, notif_promo: false,
  notif_email: true, notif_sms: true, notif_whatsapp: false,
  sec_fingerprint: false, sec_faceid: false, sec_2fa: false,
  vacation: false, auto_accept: false,
  pref_sound: true, pref_vibration: true,
  perm_location: true, perm_camera: true, perm_microphone: false, perm_storage: true,
  language: 'en', timezone: 'Asia/Kuala_Lumpur', units: 'metric', font_size: 'default',
  payment_schedule: 'weekly', max_daily: 6, service_radius: 10,
};

/* ── Reusable presentational bits ── */
function Toggle({ checked, onChange }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-raised'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-surface shadow-e1 transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

function Row({ label, desc, children, last }) {
  return (
    <div className={`flex items-center gap-4 py-3.5 ${last ? '' : 'border-b border-hairline/70'}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{label}</p>
        {desc && <p className="mt-0.5 text-xs text-ink-secondary">{desc}</p>}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}
const ToggleRow = ({ label, desc, value, onChange, last }) => (
  <Row label={label} desc={desc} last={last}><Toggle checked={value} onChange={onChange} /></Row>
);
const SelectRow = ({ label, desc, value, onChange, options, last }) => (
  <Row label={label} desc={desc} last={last}>
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm font-medium text-ink outline-none focus:border-brand">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </Row>
);
const InputRow = ({ label, value, onChange, placeholder, type = 'text', last }) => (
  <Row label={label} last={last}>
    <input type={type} value={value} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder}
      className="w-44 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-brand sm:w-56" />
  </Row>
);
function LinkRow({ icon: Icon, label, desc, to, status, last }) {
  return (
    <Link to={to} className={`flex items-center gap-3 py-3.5 ${last ? '' : 'border-b border-hairline/70'}`}>
      {Icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand"><Icon className="h-4 w-4" /></span>}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{label}</p>
        {desc && <p className="mt-0.5 text-xs text-ink-secondary">{desc}</p>}
      </div>
      {status && <StatusChip status={status} />}
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-tertiary" />
    </Link>
  );
}
function ActionRow({ icon: Icon, label, desc, onClick, danger, last, value }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex w-full items-center gap-3 py-3.5 text-left ${last ? '' : 'border-b border-hairline/70'}`}>
      {Icon && <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${danger ? 'bg-danger-tint text-danger' : 'bg-raised text-ink-secondary'}`}><Icon className="h-4 w-4" /></span>}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${danger ? 'text-danger' : 'text-ink'}`}>{label}</p>
        {desc && <p className="mt-0.5 text-xs text-ink-secondary">{desc}</p>}
      </div>
      {value && <span className="shrink-0 text-sm text-ink-secondary">{value}</span>}
    </button>
  );
}
const STATUS = {
  verified: 'bg-success-tint text-success', pending: 'bg-warning-tint text-warning',
  missing: 'bg-raised text-ink-secondary', clear: 'bg-success-tint text-success',
};
const StatusChip = ({ status }) => (
  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS[status] || STATUS.missing}`}>{status}</span>
);

function Section({ id, icon: Icon, title, desc, children }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-hairline bg-surface p-5 shadow-e1 lg:p-6">
      <div className="mb-1 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-tint text-brand"><Icon className="h-4 w-4" /></span>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
      </div>
      {desc && <p className="mb-3 text-xs text-ink-secondary">{desc}</p>}
      <div className={desc ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'business', label: 'Business', icon: Briefcase },
  { id: 'availability', label: 'Availability', icon: CalendarClock },
  { id: 'earnings', label: 'Earnings & Payments', icon: Wallet },
  { id: 'documents', label: 'Documents & Verification', icon: ShieldCheck },
  { id: 'services', label: 'Services', icon: Wrench },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'region', label: 'Language & Region', icon: Globe },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'training', label: 'Training & Learning', icon: GraduationCap },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'support', label: 'Support', icon: LifeBuoy },
  { id: 'legal', label: 'Legal', icon: Scale },
  { id: 'preferences', label: 'App Preferences', icon: SlidersHorizontal },
  { id: 'about', label: 'About', icon: Info },
  { id: 'account', label: 'Account', icon: UserCog },
];

export default function PartnerSettings() {
  const { user, logout } = useAuth();
  const [s, setS] = useState({ ...DEFAULTS, ...loadSettings() });
  const set = (k, v) => setS((prev) => { const next = { ...prev, [k]: v }; localStorage.setItem(KEY, JSON.stringify(next)); return next; });

  const [online, setOnline] = useState(() => localStorage.getItem('partner_online') !== 'false');
  const toggleOnline = (v) => { setOnline(v); localStorage.setItem('partner_online', String(v)); };

  const [profile, setProfile] = useState({
    full_name: user?.full_name || user?.fullName || '', email: user?.email || '', phone: user?.phone || '',
    dob: user?.dob || '', gender: user?.gender || '', bio: user?.bio || '',
    experience: user?.years_experience || '', business_name: user?.business_name || '',
    company: user?.company_details || '', ssm: user?.ssm_number || '', city: user?.city || 'Kuala Lumpur',
  });
  const setP = (k, v) => setProfile((p) => ({ ...p, [k]: v }));

  const initial = (user?.full_name || user?.fullName || 'P').charAt(0).toUpperCase();

  const NOTIFS = [
    ['notif_booking', 'Booking notifications', 'New requests, confirmations, reminders'],
    ['notif_payment', 'Payment notifications', 'Payouts, wallet activity'],
    ['notif_chat', 'Chat notifications', 'Messages from customers'],
    ['notif_promo', 'Promotions', 'Offers and partner campaigns'],
    ['notif_email', 'Email notifications', null],
    ['notif_sms', 'SMS notifications', null],
    ['notif_whatsapp', 'WhatsApp notifications', null],
  ];
  const PERMS = [
    ['perm_location', 'Location', 'Show jobs near you and share live ETA'],
    ['perm_camera', 'Camera', 'Upload documents and job photos'],
    ['perm_microphone', 'Microphone', 'Voice notes in chat'],
    ['perm_storage', 'Storage', 'Save receipts and downloads'],
  ];
  const DOCS = [
    ['NRIC / Passport (Malaysia)', 'verified'], ['Driving License', 'verified'],
    ['Work Permit', 'missing'], ['Business License (SSM)', 'pending'],
    ['Certifications (CIDB / ST)', 'pending'], ['Insurance', 'missing'],
    ['Police Verification', 'pending'], ['Background Check', 'clear'],
  ];
  const SERVICES = [
    ['Active Services', 'Manage the services you offer'], ['Pricing', 'Set base rates per service'],
    ['Add-ons', 'Optional extras customers can pick'], ['Packages', 'Bundled service deals'],
    ['Required Materials', 'What you bring vs customer provides'], ['Service Duration', 'Default time per job'],
    ['Travel Charges', 'Distance-based surcharge'],
  ];
  const TRAINING = [
    ['Training Videos', GraduationCap], ['Certification Courses', GraduationCap],
    ['Skill Assessments', Gauge], ['Partner Guidelines', Scale], ['Best Practices', Star],
  ];
  const INVENTORY = [
    ['Tools Checklist', 'Track your standard toolkit'], ['Equipment Status', 'Condition and service dates'],
    ['Consumables', 'Stock levels for materials'], ['Uniform Status', 'Branded uniform issue'],
  ];
  const SUPPORT = [
    ['Help Center', LifeBuoy, '/partner/support'], ['FAQs', Info, '/partner/support'],
    ['Contact Support', Bell, '/partner/support'], ['Live Chat', Bell, '/partner/support'],
    ['Report an Issue', ShieldCheck, '/partner/support'], ['Emergency Support', LifeBuoy, '/partner/support'],
  ];
  const LEGAL = ['Terms & Conditions', 'Privacy Policy', 'Partner Agreement', 'Cancellation Policy', 'Refund Policy'];
  const PERF = [
    ['Rating', user?.partner_rating ? user.partner_rating.toFixed(1) : '4.8'],
    ['Reviews', '128'], ['Acceptance Rate', '94%'], ['Completion Rate', '98%'],
    ['Cancellation Rate', '2%'], ['Customer Compliments', '41'],
  ];

  return (
    <div className="font-inter min-h-screen bg-bg px-5 py-6 text-ink lg:px-8 lg:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink lg:text-[28px]">Settings</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">Manage your profile, business, payments and preferences.</p>
        </header>

        <div className="lg:grid lg:grid-cols-[190px_1fr] lg:gap-8">
          {/* Section index */}
          <nav className="sticky top-6 mb-6 hidden self-start lg:block">
            <ul className="space-y-0.5">
              {SECTIONS.map((sec) => (
                <li key={sec.id}>
                  <a href={`#${sec.id}`} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-raised hover:text-ink">
                    <sec.icon className="h-4 w-4 shrink-0" />{sec.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Sections */}
          <div className="space-y-5">
            {/* 1. Profile */}
            <Section id="profile" icon={User} title="Profile">
              <div className="mb-4 flex items-center gap-4">
                <div className="relative">
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-tint text-2xl font-semibold text-brand">{initial}</span>
                  <button className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgb(var(--hairline))] border-surface bg-brand text-white"><Camera className="h-3.5 w-3.5" /></button>
                </div>
                <div>
                  <p className="font-semibold text-ink">{profile.full_name || 'Your name'}</p>
                  <p className="text-xs text-ink-secondary">Partner ID · {user?.id || 'partner-0000'}</p>
                </div>
              </div>
              <InputRow label="Full name (as per MyKad)" value={profile.full_name} onChange={(v) => setP('full_name', v)} placeholder="Full name" />
              <InputRow label="Phone number" value={profile.phone} onChange={(v) => setP('phone', v)} placeholder="+60…" type="tel" />
              <InputRow label="Email address" value={profile.email} onChange={(v) => setP('email', v)} placeholder="you@example.com" type="email" />
              <InputRow label="Date of birth" value={profile.dob} onChange={(v) => setP('dob', v)} type="date" />
              <SelectRow label="Gender" value={profile.gender} onChange={(v) => setP('gender', v)} options={[{ value: '', label: 'Prefer not to say' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
              <InputRow label="Languages spoken" value={profile.languages} onChange={(v) => setP('languages', v)} placeholder="English, Bahasa Malaysia" />
              <InputRow label="Years of experience" value={profile.experience} onChange={(v) => setP('experience', v)} placeholder="5" type="number" />
              <Row label="Bio / About me" last>
                <textarea value={profile.bio} onChange={(e) => setP('bio', e.target.value)} rows={2} placeholder="Tell customers about yourself"
                  className="w-56 resize-none rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-brand sm:w-72" />
              </Row>
            </Section>

            {/* 2. Business Information */}
            <Section id="business" icon={Briefcase} title="Business Information">
              <InputRow label="Business name" value={profile.business_name} onChange={(v) => setP('business_name', v)} placeholder="Optional" />
              <SelectRow label="Working city" value={profile.city} onChange={(v) => setP('city', v)} options={['Kuala Lumpur', 'Petaling Jaya', 'Subang Jaya', 'Shah Alam', 'Cheras', 'Klang'].map((c) => ({ value: c, label: c }))} />
              <SelectRow label="Service radius" value={String(s.service_radius)} onChange={(v) => set('service_radius', Number(v))} options={[5, 10, 15, 20, 30, 50].map((n) => ({ value: String(n), label: `${n} km` }))} />
              <InputRow label="GST / Business registration (SSM)" value={profile.ssm} onChange={(v) => setP('ssm', v)} placeholder="Optional · 202301012345" />
              <LinkRow icon={Wrench} label="Services offered" desc="Categories & subcategories you serve" to="/partner/inventory" />
              <Row label="Company details" last>
                <textarea value={profile.company} onChange={(e) => setP('company', e.target.value)} rows={2} placeholder="Company address, SSM details"
                  className="w-56 resize-none rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-brand sm:w-72" />
              </Row>
            </Section>

            {/* 3. Availability */}
            <Section id="availability" icon={CalendarClock} title="Availability">
              <ToggleRow label="Online" desc={online ? 'You are receiving new jobs' : 'You are offline — no new jobs'} value={online} onChange={toggleOnline} />
              <ToggleRow label="Vacation mode" desc="Pause bookings while you're away" value={s.vacation} onChange={(v) => set('vacation', v)} />
              <ToggleRow label="Auto-accept bookings" desc="Accept matching jobs automatically" value={s.auto_accept} onChange={(v) => set('auto_accept', v)} />
              <SelectRow label="Maximum daily bookings" value={String(s.max_daily)} onChange={(v) => set('max_daily', Number(v))} options={[2, 4, 6, 8, 10, 12].map((n) => ({ value: String(n), label: String(n) }))} />
              <LinkRow icon={CalendarClock} label="Working days & hours" desc="Set your weekly schedule and break time" to="/partner/availability" last />
            </Section>

            {/* 4. Earnings & Payments */}
            <Section id="earnings" icon={Wallet} title="Earnings & Payments">
              <LinkRow icon={Wallet} label="Total earnings & wallet balance" desc="View balance and withdraw" to="/partner/earnings" />
              <LinkRow icon={Wallet} label="Bank account" desc="Payout destination" to="/partner/earnings" />
              <LinkRow icon={Wallet} label="Payout history" desc="Past withdrawals and statements" to="/partner/earnings" />
              <SelectRow label="Payment schedule" value={s.payment_schedule} onChange={(v) => set('payment_schedule', v)} options={[{ value: 'weekly', label: 'Weekly' }, { value: 'biweekly', label: 'Bi-weekly' }, { value: 'monthly', label: 'Monthly' }]} />
              <LinkRow icon={Scale} label="Tax documents" desc="Statements for filing" to="/partner/earnings" />
              <LinkRow icon={Star} label="Incentives, bonuses & referrals" desc="Rewards you've earned" to="/partner/earnings" last />
            </Section>

            {/* 5. Documents & Verification */}
            <Section id="documents" icon={ShieldCheck} title="Documents & Verification" desc="Malaysia KYC — keep these current to stay active.">
              {DOCS.map(([label, status], i) => (
                <Link key={label} to="/partner/verification" className={`flex items-center gap-3 py-3.5 ${i === DOCS.length - 1 ? '' : 'border-b border-hairline/70'}`}>
                  <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{label}</span>
                  <StatusChip status={status} />
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-tertiary" />
                </Link>
              ))}
            </Section>

            {/* 6. Services Management */}
            <Section id="services" icon={Wrench} title="Services Management">
              {SERVICES.map(([label, desc], i) => (
                <LinkRow key={label} label={label} desc={desc} to="/partner/inventory" last={i === SERVICES.length - 1} />
              ))}
            </Section>

            {/* 7. Notifications */}
            <Section id="notifications" icon={Bell} title="Notifications">
              {NOTIFS.map(([k, label, desc], i) => (
                <ToggleRow key={k} label={label} desc={desc} value={s[k]} onChange={(v) => set(k, v)} last={i === NOTIFS.length - 1} />
              ))}
            </Section>

            {/* 8. Security */}
            <Section id="security" icon={Lock} title="Security">
              <ActionRow icon={KeyRound} label="Change password" onClick={() => (window.location.href = '/reset-password')} />
              <ActionRow icon={KeyRound} label="Change PIN" onClick={() => {}} />
              <ToggleRow label="Fingerprint login" value={s.sec_fingerprint} onChange={(v) => set('sec_fingerprint', v)} />
              <ToggleRow label="Face ID" value={s.sec_faceid} onChange={(v) => set('sec_faceid', v)} />
              <ToggleRow label="Two-factor authentication" desc="Extra code at login" value={s.sec_2fa} onChange={(v) => set('sec_2fa', v)} />
              <ActionRow icon={Smartphone} label="Trusted devices" desc="Devices allowed to sign in" onClick={() => {}} />
              <ActionRow icon={Gauge} label="Login activity" desc="Recent sign-ins" onClick={() => {}} last />
            </Section>

            {/* 9. Language & Region */}
            <Section id="region" icon={Globe} title="Language & Region">
              <SelectRow label="Language" value={s.language} onChange={(v) => set('language', v)} options={[{ value: 'en', label: 'English' }, { value: 'ms', label: 'Bahasa Malaysia' }, { value: 'zh', label: '中文' }, { value: 'ta', label: 'தமிழ்' }]} />
              <Row label="Currency"><span className="text-sm font-medium text-ink-secondary">MYR (RM)</span></Row>
              <SelectRow label="Time zone" value={s.timezone} onChange={(v) => set('timezone', v)} options={[{ value: 'Asia/Kuala_Lumpur', label: 'Kuala Lumpur (GMT+8)' }, { value: 'Asia/Kuching', label: 'Kuching (GMT+8)' }]} />
              <SelectRow label="Measurement units" value={s.units} onChange={(v) => set('units', v)} options={[{ value: 'metric', label: 'Metric (km)' }, { value: 'imperial', label: 'Imperial (mi)' }]} last />
            </Section>

            {/* 10. Performance */}
            <Section id="performance" icon={Gauge} title="Performance">
              <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {PERF.map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-hairline p-3 text-center">
                    <p className="text-lg font-semibold text-ink">{value}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-ink-secondary">{label}</p>
                  </div>
                ))}
              </div>
              <LinkRow icon={Gauge} label="Performance insights" desc="Trends and detailed analytics" to="/partner/analytics" />
              <LinkRow icon={Star} label="Reviews & customer compliments" desc="What customers say about you" to="/partner/reviews" last />
            </Section>

            {/* 11. Training & Learning */}
            <Section id="training" icon={GraduationCap} title="Training & Learning">
              {TRAINING.map(([label, icon], i) => (
                <LinkRow key={label} icon={icon} label={label} to="/partner/training" last={i === TRAINING.length - 1} />
              ))}
            </Section>

            {/* 12. Inventory */}
            <Section id="inventory" icon={Package} title="Inventory">
              {INVENTORY.map(([label, desc], i) => (
                <LinkRow key={label} icon={Package} label={label} desc={desc} to="/partner/inventory" last={i === INVENTORY.length - 1} />
              ))}
            </Section>

            {/* 13. Support */}
            <Section id="support" icon={LifeBuoy} title="Support">
              {SUPPORT.map(([label, icon, to], i) => (
                <LinkRow key={label} icon={icon} label={label} to={to} last={i === SUPPORT.length - 1} />
              ))}
            </Section>

            {/* 14. Legal */}
            <Section id="legal" icon={Scale} title="Legal">
              {LEGAL.map((label, i) => (
                <LinkRow key={label} icon={Scale} label={label} to="/partner/support" last={i === LEGAL.length - 1} />
              ))}
            </Section>

            {/* 15. App Preferences */}
            <Section id="preferences" icon={SlidersHorizontal} title="App Preferences">
              <div className="border-b border-hairline/70 py-3.5">
                <p className="mb-2.5 text-sm font-semibold text-ink">Theme</p>
                <ThemeToggle />
              </div>
              <SelectRow label="Font size" value={s.font_size} onChange={(v) => set('font_size', v)} options={[{ value: 'small', label: 'Small' }, { value: 'default', label: 'Default' }, { value: 'large', label: 'Large' }]} />
              <ToggleRow label="Sound" value={s.pref_sound} onChange={(v) => set('pref_sound', v)} />
              <ToggleRow label="Vibration" value={s.pref_vibration} onChange={(v) => set('pref_vibration', v)} />
              <p className="pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Permissions</p>
              {PERMS.map(([k, label, desc], i) => (
                <ToggleRow key={k} label={label} desc={desc} value={s[k]} onChange={(v) => set(k, v)} last={i === PERMS.length - 1} />
              ))}
            </Section>

            {/* 16. About */}
            <Section id="about" icon={Info} title="About">
              <ActionRow icon={Info} label="App version" value="1.0.0" onClick={() => {}} />
              <ActionRow icon={RefreshCw} label="Check for updates" onClick={() => {}} />
              <ActionRow icon={Scale} label="Open source licenses" onClick={() => {}} />
              <ActionRow icon={Star} label="Rate the app" onClick={() => {}} />
              <ActionRow icon={Share2} label="Share app" onClick={() => { if (navigator.share) navigator.share({ title: 'ServisAku Partner', url: location.origin }); }} last />
            </Section>

            {/* 17. Account */}
            <Section id="account" icon={UserCog} title="Account">
              <ActionRow icon={RefreshCw} label="Switch account" desc="Sign in to a different account" onClick={() => logout()} />
              <ActionRow icon={LogOut} label="Log out" onClick={() => logout()} />
              <ActionRow icon={Trash2} label="Delete account" desc="Permanently remove your account and data" danger
                onClick={() => { if (window.confirm('Delete your account? This cannot be undone.')) { /* wire to backend when available */ } }} last />
            </Section>

            <p className="pb-6 pt-2 text-center text-xs text-ink-tertiary">ServisAku Partner · v1.0.0</p>
          </div>
        </div>
      </div>
    </div>
  );
}
