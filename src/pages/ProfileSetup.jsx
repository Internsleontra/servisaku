import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, MapPin, Globe, ArrowRight, Check } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { Button } from '@/components/ds';
import { CITIES } from '@/lib/services';
import { toast } from 'sonner';

export default function ProfileSetup() {
  const navigate = useNavigate();
  const [_user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [language, setLanguage] = useState('en');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    servisaku.auth.me().then(u => {
      setUser(u);
      setName(u.full_name || '');
      if (u.city) setCity(u.city);
      if (u.language) setLanguage(u.language);
    });
  }, []);

  const handleSave = async () => {
    if (!name.trim() || !city) {
      toast.error('Please fill in all fields');
      return;
    }
    setSaving(true);
    await servisaku.auth.updateMe({ city, language });
    toast.success('Profile saved!');
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
        <h1 className="text-xl font-semibold">Complete your profile</h1>
        <p className="text-sm text-ink-secondary mt-1">A few details to get you started</p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-brand" /> Full Name
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Ahmad Bin Abdullah" aria-label="Full name"
            className="w-full bg-raised rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ring-brand/20"
          />
        </div>

        <div>
          <label className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-brand" /> Your Area
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
            <Globe className="h-3.5 w-3.5 text-brand" /> Language
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[{ id: 'en', label: 'English' }, { id: 'ms', label: 'Bahasa Malaysia' }].map(l => (
              <button
                key={l.id}
                onClick={() => setLanguage(l.id)}
                className={`text-xs py-3 rounded-xl border transition-all ${language === l.id ? 'border-brand bg-brand-tint text-brand font-semibold' : 'border-hairline bg-surface text-ink-secondary'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button onClick={handleSave} loading={saving} block size="lg" className="mt-8">
        {saving ? 'Saving...' : 'Continue to FixMate'} <ArrowRight className="h-4 w-4 ml-1" />
      </Button>
      </div>
    </div>
  );
}