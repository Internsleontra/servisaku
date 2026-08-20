import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, MapPin, Globe, Shield, ShieldCheck, ChevronRight, Plus, Trash2, Star,
  Bell, Receipt, BadgeCheck,
} from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage, normaliseLang } from '@/lib/LanguageContext';

import { CITIES } from '@/lib/services';
import { toast } from 'sonner';
import AccountShell from '@/components/account/AccountShell';
import { SegmentedTabs, RING, Button } from '@/components/ds';

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'addresses', label: 'Addresses', icon: MapPin },
  { id: 'security', label: 'Security', icon: Shield },
];

export default function ConsumerProfile() {
  const navigate = useNavigate();
  const { lang, setLang } = useLanguage();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('profile');
  const [addresses, setAddresses] = useState([]);
  const [city, setCity] = useState('');
  // Seeded from the live app language so the control opens on what is actually
  // rendering, not a hardcoded 'en' that contradicted the screen.
  const [language, setLanguage] = useState(lang);
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [marketing, setMarketing] = useState({ push: true, sms: false, email: true, whatsapp: false });
  const [saving, setSaving] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddr, setNewAddr] = useState({ label: '', street: '', area: '', city: '', postcode: '' });

  useEffect(() => {
    const load = async () => {
      const me = await servisaku.auth.me();
      setUser(me);
      setCity(me.city || '');
      setFullName(me.fullName || me.full_name || '');
      const cp = me.consumerProfile || {};
      setGender(cp.gender || '');
      setDob(cp.birthday || '');
      // Deliberately does NOT override the live app language. Most existing
      // profiles carry 'en' from when that was the hardcoded default, so
      // adopting it here would flip every returning customer out of Malay.
      // The device choice (localStorage) wins; this control edits what gets
      // saved back to the profile.
      setLanguage(normaliseLang(cp.language || me.language) || lang);
      setMarketing({
        push: cp.comms?.marketing?.push ?? true,
        sms: cp.comms?.marketing?.sms ?? false,
        email: cp.comms?.marketing?.email ?? true,
        whatsapp: cp.comms?.marketing?.whatsapp ?? false,
      });
      try { setAddresses(await servisaku.addresses.list()); } catch { setAddresses([]); }
    };
    load();
  }, []);

  const { checkUserAuth } = useAuth(); // Needs import or destructured from existing

  const handleSaveProfile = async () => {
    if (fullName.trim().length < 2 || /[0-9]/.test(fullName)) return toast.error('Enter a valid name (letters only)');
    setSaving(true);
    try {
      await servisaku.auth.updateMe({ full_name: fullName.trim(), city });
      await servisaku.auth.updateConsumerProfile({
        gender: gender || null,
        birthday: dob || null,
        language,
        comms: { marketing, transactional: { push: true, sms: true, email: true } },
      });
      if (checkUserAuth) await checkUserAuth();
      toast.success('Profile updated!');
    } catch (e) {
      toast.error(e.message || 'Could not save changes');
    }
    setSaving(false);
  };

  const handleAddAddress = async () => {
    if (!newAddr.street || !newAddr.city) return toast.error('Please fill address details');
    try {
      await servisaku.addresses.add({ label: newAddr.label || 'Home', street: newAddr.street, area: newAddr.area, city: newAddr.city, postal: newAddr.postcode });
      setAddresses(await servisaku.addresses.list());
      setNewAddr({ label: '', street: '', area: '', city: '', postcode: '' });
      setShowAddAddress(false);
      toast.success('Address added!');
    } catch (e) { toast.error(e.message || 'Could not add address'); }
  };

  const handleDeleteAddress = async (id) => {
    try { await servisaku.addresses.remove(id); setAddresses(await servisaku.addresses.list()); toast.success('Address removed'); }
    catch (e) { toast.error(e.message || 'Could not remove'); }
  };

  const handleSetDefault = async (id) => {
    try { await servisaku.addresses.update(id, { is_default: true }); setAddresses(await servisaku.addresses.list()); toast.success('Default address updated'); }
    catch (e) { toast.error(e.message || 'Could not update'); }
  };

  if (!user) return <div className="flex justify-center pt-32"><div className="w-6 h-6 shadow-[inset_0_0_0_1px_rgb(var(--hairline))] border-raised border-t-brand rounded-full animate-spin" /></div>;

  return (
    <AccountShell user={user} title="Profile & addresses" subtitle={user.email || user.phone || ''}>
      {/* Account status */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-semibold capitalize text-brand-ink">
          {user.role}
        </span>
        {user.phone_verified && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-tint px-2.5 py-1 text-xs font-semibold text-success">
            <BadgeCheck className="size-3" /> Verified
          </span>
        )}
      </div>

      {/* Tabs — design-system underline pattern, replacing the pill row. */}
      <SegmentedTabs
        items={TABS.map((t) => ({ id: t.id, label: t.label }))}
        value={tab}
        onChange={setTab}
      />

      {tab === 'profile' && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-brand" /> Full Name
            </label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" aria-label="Full name"
              className="w-full bg-raised rounded-xl px-4 py-3 text-sm outline-none text-ink placeholder:text-ink-tertiary" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1.5 block">Gender</label>
              <select value={gender} aria-label="Gender" onChange={e => setGender(e.target.value)}
                className="w-full bg-raised rounded-xl px-4 py-3 text-sm outline-none text-ink">
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1.5 block">Birthday</label>
              <input type="date" aria-label="Date of birth" value={dob} onChange={e => setDob(e.target.value)}
                className="w-full bg-raised rounded-xl px-4 py-3 text-sm outline-none text-ink" />
            </div>
          </div>

          <div className="bg-surface border border-hairline/10 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-semibold text-ink-secondary">CONTACT</p>
            {[['Phone', user.phone, 'Change needs OTP'], ['Email', user.email || 'Not added', 'Change needs verification']].map(([k, v, note]) => (
              <div key={k} className="flex items-center justify-between">
                <div><p className="text-[11px] text-ink-tertiary">{k}</p><p className="text-sm font-semibold">{v}</p></div>
                <button onClick={() => toast.info(note)} className="text-xs text-brand font-semibold border border-hairline/20 rounded-lg px-3 py-1.5">Change</button>
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-brand" /> Your Area
            </label>
            <select value={city} aria-label="City" onChange={e => setCity(e.target.value)}
              className="w-full bg-raised rounded-xl px-4 py-3 text-sm outline-none text-ink">
              <option value="">Select area</option>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-brand" /> Language
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[{ id: 'ms', label: '🇲🇾 Melayu' }, { id: 'en', label: '🇬🇧 English' }].map(l => (
                // Drives BOTH the saved profile preference and the live app
                // language — previously this only set local state, so the app
                // stayed in English whatever the customer picked.
                <button key={l.id} onClick={() => { setLanguage(l.id); setLang(l.id); }}
                  className={`text-xs py-3 rounded-xl border transition-all ${language === l.id ? 'border-brand bg-brand-tint text-brand-ink font-semibold' : 'border-hairline/10 bg-surface text-ink-secondary'}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5 text-brand" /> Marketing communications
            </label>
            <div className="bg-surface border border-hairline/10 rounded-2xl divide-y divide-hairline/10">
              {[['push', 'Push'], ['sms', 'SMS'], ['email', 'Email'], ['whatsapp', 'WhatsApp']].map(([key, label]) => (
                <button key={key} onClick={() => setMarketing(m => ({ ...m, [key]: !m[key] }))}
                  className="w-full flex items-center justify-between px-4 py-3 text-left">
                  <span className="text-sm">{label}</span>
                  <span className={`w-10 h-6 rounded-full flex items-center transition-colors px-0.5 ${marketing[key] ? 'bg-brand justify-end' : 'bg-raised justify-start'}`}>
                    <span className="w-5 h-5 rounded-full bg-surface shadow-sm" />
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-ink-secondary mt-1.5">Transactional messages (booking updates, receipts) are always sent.</p>
          </div>

          <Button onClick={handleSaveProfile} disabled={saving} block size="lg" className="mt-2">
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}

      {/* Addresses Tab */}
      {tab === 'addresses' && (
        <div>
          <div className="space-y-3 mb-4">
            {addresses.map(addr => (
              <div key={addr.id} className="bg-surface border border-hairline/10 rounded-2xl p-4 flex items-start justify-between hover:bg-raised/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-sm">{addr.label || 'Address'}</p>
                    {addr.is_default && <span className="text-[9px] bg-brand/10 text-brand px-2 py-0.5 rounded-full font-semibold">Default</span>}
                  </div>
                  <p className="text-xs text-ink-secondary">{[addr.house_number, addr.building, addr.street].filter(Boolean).join(', ')}</p>
                  <p className="text-xs text-ink-secondary">{[addr.area, addr.city, addr.state, addr.postal || addr.postcode].filter(Boolean).join(', ')}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {!addr.is_default && (
                    <button onClick={() => handleSetDefault(addr.id)} title="Set as default" className="text-ink-secondary hover:text-brand transition-colors p-1">
                      <Star className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => handleDeleteAddress(addr.id)} title="Delete" className="text-ink-secondary hover:text-danger transition-colors p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {addresses.length === 0 && (
              <div className="text-center py-8 text-ink-secondary">
                <MapPin className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No saved addresses</p>
              </div>
            )}
          </div>

          {showAddAddress ? (
            <div className="bg-surface border border-hairline/10 rounded-2xl p-4 space-y-3 hover:bg-raised/30 transition-colors">
              <h4 className="text-sm font-semibold">New address</h4>
              {[
                { key: 'label', placeholder: 'Label (e.g. Home, Office)' },
                { key: 'street', placeholder: 'Street & unit number *' },
                { key: 'area', placeholder: 'Area / neighbourhood' },
                { key: 'postcode', placeholder: 'Postcode' },
              ].map(f => (
                <input key={f.key} value={newAddr[f.key]} onChange={e => setNewAddr(a => ({ ...a, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full bg-raised rounded-xl px-4 py-3 text-sm outline-none text-ink placeholder:text-ink-tertiary" />
              ))}
              <select value={newAddr.city} onChange={e => setNewAddr(a => ({ ...a, city: e.target.value }))}
                className="w-full bg-raised rounded-xl px-4 py-3 text-sm outline-none text-ink">
                <option value="">Select city *</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex gap-2">
                <Button onClick={handleAddAddress} className="flex-1">Save</Button>
                <Button onClick={() => setShowAddAddress(false)} variant="outline" className="flex-1">Cancel</Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddAddress(true)}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-xl shadow-[inset_0_0_0_1px_rgb(var(--hairline))] border-dashed border-hairline/10 text-sm text-ink-secondary hover:border-brand hover:text-brand transition-colors">
              <Plus className="h-4 w-4" /> Add New Address
            </button>
          )}
        </div>
      )}

      {/* Security Tab */}
      {tab === 'security' && (
        <div className="space-y-3">
          {[
            { icon: Bell, label: 'Notification preferences', desc: 'Per-category push, SMS, email, WhatsApp', action: () => navigate('/notification-settings') },
            { icon: ShieldCheck, label: 'Two-factor authentication', desc: 'OTP via SMS is enabled', action: () => {} },
            { icon: Receipt, label: 'Refunds & disputes', desc: 'Track a request', action: () => navigate('/refunds') },
            { icon: Shield, label: 'Legal & policies', desc: 'Terms, privacy, refund policy', action: () => navigate('/legal') },
          ].map((item, i) => (
            <button key={i} onClick={item.action}
              className={`w-full flex min-h-11 items-center gap-3 rounded-card bg-surface p-4 text-left transition-colors hover:bg-raised ${RING}`}>
              <div className="grid size-10 shrink-0 place-items-center rounded-sm bg-grad-brand-soft text-brand-ink">
                <item.icon className="size-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-caption font-semibold text-ink">{item.label}</p>
                <p className="text-xs text-ink-secondary">{item.desc}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-ink-tertiary" />
            </button>
          ))}

        </div>
      )}
    </AccountShell>
  );
}