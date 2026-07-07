import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, MessageSquare, Mail } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { toast } from 'sonner';

const CATEGORIES = ['Bookings', 'Payments', 'Offers', 'Membership', 'Support', 'Promotions', 'App Updates', 'Security'];
const CHANNELS = ['push', 'sms', 'email', 'whatsapp'];
const MUTE = [['off', 'Not muted'], ['1h', '1 hour'], ['8h', '8 hours'], ['24h', '24 hours'], ['until', 'Until I turn on']];

function makeDefault() {
  const o = {};
  for (const c of CATEGORIES) o[c] = { push: true, sms: c === 'Security' || c === 'Bookings', email: c !== 'Promotions', whatsapp: false };
  return o;
}

export default function NotificationSettings() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState(makeDefault());
  const [mute, setMute] = useState('off');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    servisaku.auth.me().then(me => {
      const cp = me.consumerProfile || {};
      if (cp.notifPrefs) setPrefs(p => ({ ...p, ...cp.notifPrefs }));
      if (cp.muteUntil) setMute(cp.muteUntil);
    }).catch(() => {});
  }, []);

  const toggle = (cat, ch) => setPrefs(p => ({ ...p, [cat]: { ...p[cat], [ch]: !p[cat]?.[ch] } }));

  const save = async () => {
    setSaving(true);
    try { await servisaku.auth.updateConsumerProfile({ notifPrefs: prefs, muteUntil: mute }); toast.success('Notification settings saved'); }
    catch (e) { toast.error(e.message || 'Could not save'); }
    setSaving(false);
  };

  return (
    <div className="font-inter min-h-screen bg-bg max-w-lg mx-auto">
      <div className="flex items-center gap-3 px-5 pt-12 pb-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-xl font-bold">Notification settings</h1>
      </div>
      <div className="px-5 space-y-5 pb-10">
        <div>
          <p className="text-[11px] font-bold text-ink-tertiary mb-2">MUTE ALL FOR</p>
          <div className="flex flex-wrap gap-2">
            {MUTE.map(([k, l]) => <button key={k} onClick={() => setMute(k)} className={`text-xs font-semibold rounded-full px-3 py-2 border ${mute === k ? 'bg-brand text-white border-brand' : 'bg-surface text-ink-secondary border-hairline/20'}`}>{l}</button>)}
          </div>
        </div>
        <div className="bg-surface border border-hairline/10 rounded-2xl divide-y divide-hairline/10">
          {CATEGORIES.map(cat => (
            <div key={cat} className="px-4 py-3 space-y-2">
              <p className="text-sm font-semibold">{cat}</p>
              <div className="grid grid-cols-4 gap-2">
                {CHANNELS.map(ch => {
                  const on = !!prefs[cat]?.[ch];
                  return (
                    <button key={ch} onClick={() => toggle(cat, ch)}
                      className={`flex items-center justify-center gap-1 rounded-lg py-2 text-[10px] font-bold capitalize border ${on ? 'border-brand bg-brand-tint text-brand' : 'border-hairline/20 bg-surface text-ink-tertiary'}`}>
                      {ch === 'push' ? <Bell className="h-3 w-3" /> : ch === 'sms' ? <MessageSquare className="h-3 w-3" /> : ch === 'email' ? <Mail className="h-3 w-3" /> : '💬'}
                      {ch === 'whatsapp' ? 'WA' : ch}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <button onClick={save} disabled={saving} className="w-full h-12 rounded-xl bg-brand text-white font-semibold">{saving ? 'Saving…' : 'Save settings'}</button>
      </div>
    </div>
  );
}
