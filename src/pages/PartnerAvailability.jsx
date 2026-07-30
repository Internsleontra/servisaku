import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plane, Zap, CalendarOff, X, Plus } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { CITIES } from '@/lib/services';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import moment from 'moment';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Card({ children, className = '' }) {
  return <div className={`bg-surface rounded-2xl border border-hairline/10 shadow-e1 p-4 ${className}`}>{children}</div>;
}

function Switch({ checked, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-hairline/30'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-brand text-white' : 'bg-raised text-ink-secondary hover:text-ink'}`}>
      {children}
    </button>
  );
}

export default function PartnerAvailability() {
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [categories, setCategories] = useState([]);
  // `form === null` doubles as the loading state, so a failed load has to be
  // tracked separately or the page just spins forever with nothing on screen.
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newDate, setNewDate] = useState('');

  useEffect(() => {
    // availability.get() rejecting (403 for a non-partner account) used to leave
    // `form` null forever, which is the spinner state — surface it instead.
    Promise.all([servisaku.availability.get(), servisaku.catalog.getCategories().catch(() => [])])
      .then(([a, cats]) => { setForm(a); setCategories(cats || []); })
      .catch(e => { setLoadError(e?.message || 'Could not load your availability'); });
  }, []);

  const set = (patch) => setForm(f => ({ ...f, ...patch }));
  const toggleIn = (key, value) => set({
    [key]: form[key].includes(value) ? form[key].filter(v => v !== value) : [...form[key], value],
  });

  const save = async () => {
    setSaving(true);
    try {
      const saved = await servisaku.availability.update(form);
      setForm(saved);
      toast.success('Availability saved');
    } catch (e) {
      toast.error(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return (
    <div className="flex flex-col items-center justify-center pt-32 px-6 text-center">
      <p className="text-sm font-semibold text-ink mb-1">Couldn&apos;t load your availability</p>
      <p className="text-sm text-ink-secondary max-w-xs">{loadError}</p>
    </div>
  );

  if (!form) return (
    <div className="flex justify-center pt-32"><div className="w-6 h-6 border-2 border-raised border-t-brand rounded-full animate-spin" /></div>
  );

  return (
    <div className="min-h-screen bg-bg font-inter" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-ink via-brand to-brand/80 px-5 lg:px-8 pt-14 lg:pt-8 pb-8">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <ArrowLeft className="h-4 w-4 text-white" />
          </button>
          <div>
            <p className="text-white/60 text-xs">Settings</p>
            <h1 className="text-xl font-bold text-white">Availability</h1>
          </div>
        </div>
      </div>

      <div className="px-5 lg:px-8 max-w-2xl mx-auto -mt-4 space-y-4">

        {/* Modes */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-500"><Plane className="h-4 w-4" /></div>
              <div>
                <p className="text-sm font-semibold text-ink">Vacation mode</p>
                <p className="text-[11px] text-ink-secondary">Pause all new job assignments</p>
              </div>
            </div>
            <Switch checked={form.vacation_mode} onChange={(v) => set({ vacation_mode: v })} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-hairline/10 pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-tint text-brand"><Zap className="h-4 w-4" /></div>
              <div>
                <p className="text-sm font-semibold text-ink">Instant booking</p>
                <p className="text-[11px] text-ink-secondary">Auto-accept jobs that match your settings</p>
              </div>
            </div>
            <Switch checked={form.instant_booking} onChange={(v) => set({ instant_booking: v })} />
          </div>
        </Card>

        {/* Working days */}
        <Card>
          <SectionHeader title="Working days" className="mb-3" />
          <div className="flex gap-1.5">
            {DAYS.map((d, i) => (
              <button key={d} type="button" onClick={() => toggleIn('working_days', i)}
                className={`flex-1 rounded-lg py-2 text-[11px] font-bold transition-colors ${form.working_days.includes(i) ? 'bg-brand text-white' : 'bg-raised text-ink-secondary'}`}>
                {d}
              </button>
            ))}
          </div>
        </Card>

        {/* Hours + lunch */}
        <Card className="space-y-4">
          <div>
            <SectionHeader title="Working hours" className="mb-3" />
            <div className="flex items-center gap-3">
              <label className="flex-1 text-xs text-ink-secondary">Start
                <input type="time" value={form.start_time} onChange={(e) => set({ start_time: e.target.value })}
                  className="mt-1 w-full rounded-lg bg-raised px-3 py-2 text-sm text-ink outline-none" />
              </label>
              <label className="flex-1 text-xs text-ink-secondary">End
                <input type="time" value={form.end_time} onChange={(e) => set({ end_time: e.target.value })}
                  className="mt-1 w-full rounded-lg bg-raised px-3 py-2 text-sm text-ink outline-none" />
              </label>
            </div>
          </div>
          <div className="border-t border-hairline/10 pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Lunch break</p>
              <Switch checked={form.lunch.enabled} onChange={(v) => set({ lunch: { ...form.lunch, enabled: v } })} />
            </div>
            {form.lunch.enabled && (
              <div className="mt-3 flex items-center gap-3">
                <input type="time" value={form.lunch.start} onChange={(e) => set({ lunch: { ...form.lunch, start: e.target.value } })}
                  className="flex-1 rounded-lg bg-raised px-3 py-2 text-sm text-ink outline-none" />
                <span className="text-ink-tertiary text-xs">to</span>
                <input type="time" value={form.lunch.end} onChange={(e) => set({ lunch: { ...form.lunch, end: e.target.value } })}
                  className="flex-1 rounded-lg bg-raised px-3 py-2 text-sm text-ink outline-none" />
              </div>
            )}
          </div>
        </Card>

        {/* Capacity + radius */}
        <Card className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-ink">Max daily jobs</p>
              <span className="text-sm font-bold text-brand">{form.max_daily_jobs}</span>
            </div>
            <input type="range" min="1" max="20" value={form.max_daily_jobs} onChange={(e) => set({ max_daily_jobs: Number(e.target.value) })}
              className="w-full accent-brand" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-ink">Coverage radius</p>
              <span className="text-sm font-bold text-brand">{form.coverage_radius_km} km</span>
            </div>
            <input type="range" min="1" max="100" value={form.coverage_radius_km} onChange={(e) => set({ coverage_radius_km: Number(e.target.value) })}
              className="w-full accent-brand" />
          </div>
        </Card>

        {/* Preferred areas */}
        <Card>
          <SectionHeader title="Preferred areas" sub="Where you'd like jobs" className="mb-3" />
          <div className="flex flex-wrap gap-2">
            {CITIES.map((c) => (
              <Chip key={c} active={form.preferred_areas.includes(c)} onClick={() => toggleIn('preferred_areas', c)}>{c}</Chip>
            ))}
          </div>
        </Card>

        {/* Preferred categories */}
        {categories.length > 0 && (
          <Card>
            <SectionHeader title="Preferred categories" className="mb-3" />
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Chip key={c.slug} active={form.preferred_categories.includes(c.slug)} onClick={() => toggleIn('preferred_categories', c.slug)}>{c.name}</Chip>
              ))}
            </div>
          </Card>
        )}

        {/* Unavailable dates */}
        <Card>
          <SectionHeader title="Unavailable dates" action={<CalendarOff className="h-4 w-4 text-ink-tertiary" />} className="mb-3" />
          <div className="flex gap-2">
            <input type="date" value={newDate} min={moment().format('YYYY-MM-DD')} onChange={(e) => setNewDate(e.target.value)}
              className="flex-1 rounded-lg bg-raised px-3 py-2 text-sm text-ink outline-none" />
            <Button
              onClick={() => { if (newDate && !form.unavailable_dates.includes(newDate)) { set({ unavailable_dates: [...form.unavailable_dates, newDate].sort() }); setNewDate(''); } }}
              disabled={!newDate}
              className="h-10 rounded-lg bg-brand text-white hover:bg-brand/90"><Plus className="h-4 w-4" /></Button>
          </div>
          {form.unavailable_dates.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {form.unavailable_dates.map((d) => (
                <span key={d} className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1 text-xs font-medium text-ink">
                  {moment(d).format('D MMM YYYY')}
                  <button onClick={() => set({ unavailable_dates: form.unavailable_dates.filter(x => x !== d) })}><X className="h-3 w-3 text-ink-tertiary" /></button>
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Sticky save */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <div className="max-w-2xl mx-auto bg-surface/95 backdrop-blur-xl border-t border-hairline/10 px-5 py-4"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
          <Button onClick={save} disabled={saving} className="w-full h-12 rounded-2xl bg-brand text-white font-bold hover:bg-brand/90">
            {saving ? 'Saving…' : 'Save availability'}
          </Button>
        </div>
      </div>
    </div>
  );
}
