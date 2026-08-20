import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MessageSquare, Mail, Smartphone } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { toast } from 'sonner';
import AccountShell from '@/components/account/AccountShell';
import { Button, Chip, RING, RING_BRAND } from '@/components/ds';
import { useTranslation } from '@/lib/useTranslation';

/* WhatsApp had no Lucide glyph and was rendering a 💬 emoji — the design system
   forbids emoji as icons, so it uses the phone glyph. */
const CHANNEL_ICON = { push: Bell, sms: MessageSquare, email: Mail, whatsapp: Smartphone };

const CATEGORIES = ['Bookings', 'Payments', 'Offers', 'Membership', 'Support', 'Promotions', 'App Updates', 'Security'];
const CHANNELS = ['push', 'sms', 'email', 'whatsapp'];
/* Display copy for the channel chips — the stored values stay lowercase
   ids. WhatsApp keeps its brand casing and is not translated. */
const CHANNEL_LABEL = { push: 'Push', sms: 'SMS', email: 'Email' };
const MUTE = [['off', 'Not muted'], ['1h', '1 hour'], ['8h', '8 hours'], ['24h', '24 hours'], ['until', 'Until I turn on']];

function makeDefault() {
  const o = {};
  for (const c of CATEGORIES) o[c] = { push: true, sms: c === 'Security' || c === 'Bookings', email: c !== 'Promotions', whatsapp: false };
  return o;
}

export default function NotificationSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState(makeDefault());
  const [mute, setMute] = useState('off');
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    servisaku.auth.me().then(me => {
      setUser(me);
      const cp = me.consumerProfile || {};
      if (cp.notifPrefs) setPrefs(p => ({ ...p, ...cp.notifPrefs }));
      if (cp.muteUntil) setMute(cp.muteUntil);
    }).catch(() => {});
  }, []);

  const toggle = (cat, ch) => setPrefs(p => ({ ...p, [cat]: { ...p[cat], [ch]: !p[cat]?.[ch] } }));

  const save = async () => {
    setSaving(true);
    try { await servisaku.auth.updateConsumerProfile({ notifPrefs: prefs, muteUntil: mute }); toast.success(t('Notification settings saved')); }
    catch (e) { toast.error(e.message || t('Could not save')); }
    setSaving(false);
  };

  return (
    <AccountShell user={user} title={t('Notification settings')} subtitle={t('Choose what reaches you, and how')}>
      {/* Mute */}
      <div className={`flex flex-col gap-3 rounded-card bg-surface p-5 ${RING}`}>
        <h2 className="sa-caps text-ink-tertiary">{t('Mute all for')}</h2>
        <div className="flex flex-wrap gap-2">
          {MUTE.map(([k, l]) => (
            <Chip key={k} selected={mute === k} onClick={() => setMute(k)}>{t(l)}</Chip>
          ))}
        </div>
      </div>

      {/* Per-category channels */}
      <div className={`overflow-hidden rounded-card bg-surface ${RING}`}>
        {CATEGORIES.map((cat) => (
          <div key={cat} className="space-y-2 px-5 py-4 shadow-[inset_0_-1px_0_rgb(var(--hairline))] last:shadow-none">
            <p className="text-caption font-semibold text-ink">{t(cat)}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CHANNELS.map((ch) => {
                const on = !!prefs[cat]?.[ch];
                const Icon = CHANNEL_ICON[ch];
                return (
                  <button
                    key={ch}
                    onClick={() => toggle(cat, ch)}
                    aria-pressed={on}
                    className={`flex min-h-11 items-center justify-center gap-1.5 rounded-field text-xs font-semibold transition ${
                      on ? `bg-brand-tint text-brand-ink ${RING_BRAND}` : `bg-surface text-ink-tertiary hover:bg-raised ${RING}`
                    }`}
                  >
                    <Icon className="size-3.5" />
                    {ch === 'whatsapp' ? 'WhatsApp' : t(CHANNEL_LABEL[ch] || ch)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Button onClick={save} loading={saving} size="lg" block>
        {saving ? t('Saving…') : t('Save settings')}
      </Button>
    </AccountShell>
  );
}
