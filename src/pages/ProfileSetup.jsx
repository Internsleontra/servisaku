import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, MapPin, Globe, ArrowRight, Check } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { Button } from '@/components/ds';
import { CITIES } from '@/lib/services';
import { useLanguage, normaliseLang } from '@/lib/LanguageContext';
import { useTranslation } from '@/lib/useTranslation';
import { toast } from 'sonner';

export default function ProfileSetup() {
  const navigate = useNavigate();
  const { lang, setLang } = useLanguage();
  const { t } = useTranslation();
  const [_user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [language, setLanguage] = useState(lang);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    servisaku.auth.me().then(u => {
      setUser(u);
      setName(u.full_name || '');
      if (u.city) setCity(u.city);
      // Reflects the saved preference in the control without overriding the
      // live app language (see ConsumerProfile for the same reasoning).
      if (normaliseLang(u.language)) setLanguage(normaliseLang(u.language));
    });
  }, []);

  const handleSave = async () => {
    if (!name.trim() || !city) {
      toast.error(t('Please fill in all fields'));
      return;
    }
    setSaving(true);
    await servisaku.auth.updateMe({ city, language });
    toast.success(t('Profile saved!'));
    navigate('/');
    setSaving(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-grad-hero px-6 py-14">
      <div className="w-full max-w-md rounded-card bg-surface p-6 shadow-e3 md:p-8">
      <div className="mb-8">
        <div className="w-14 h-14 bg-brand/10 rounded-2xl flex items-center justify-center mb-4">
          <User className="h-7 w-7 text-brand" />
        </div>
        <h1 className="text-xl font-semibold">{t('Complete your profile')}</h1>
        <p className="text-sm text-ink-secondary mt-1">{t('A few details to get you started')}</p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-brand" /> {t('Full Name')}
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('e.g. Ahmad Bin Abdullah')} aria-label={t('Full name')}
            className="w-full bg-raised rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ring-brand/20"
          />
        </div>

        <div>
          <label className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-brand" /> {t('Your Area')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {CITIES.map(c => (
              <button
                key={c}
                onClick={() => setCity(c)}
                className={`text-xs py-2.5 px-3 rounded-xl border text-left transition-all ${city === c ? 'border-brand bg-brand-tint text-brand font-semibold' : 'border-hairline bg-surface text-ink-secondary'}`}
              >
                {city === c && <Check className="h-3 w-3 inline mr-1" />}{c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-brand" /> {t('Language')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[{ id: 'ms', label: 'Bahasa Malaysia' }, { id: 'en', label: 'English' }].map(l => (
              <button
                key={l.id}
                // Applies the language immediately as well as storing it for
                // save — this control previously only set local state.
                onClick={() => { setLanguage(l.id); setLang(l.id); }}
                className={`text-xs py-3 rounded-xl border transition-all ${language === l.id ? 'border-brand bg-brand-tint text-brand font-semibold' : 'border-hairline bg-surface text-ink-secondary'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button onClick={handleSave} loading={saving} block size="lg" className="mt-8">
        {saving ? t('Saving...') : t('Continue to ServisAku')} <ArrowRight className="h-4 w-4 ml-1" />
      </Button>
      </div>
    </div>
  );
}