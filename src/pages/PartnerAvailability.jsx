import { useState, useEffect } from 'react';
import {
  Plane, Zap, CalendarOff, X, Plus, Clock, CalendarDays, MapPin,
  LoaderCircle, TriangleAlert, Info,
} from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { CITIES } from '@/lib/services';
import { PageHeader } from '@/components/partner/PageHeader';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { Button, Chip, RING } from '@/components/ds';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import moment from 'moment';

/* Availability is the partner's STANDING SCHEDULE — when they are willing to be
   given work. It is not the same thing as:
     · online/offline    a live presence flag, owned by the dashboard
     · active jobs       work already assigned
     · job acceptance    the per-job accept/decline decision
   Nothing on this page changes any of those. The shape below mirrors
   `availabilitySchema` in server/routes/partners.js exactly; PATCH is a partial
   merge, and the whole form is sent so a field is never silently dropped. */

const DAYS = [
  { i: 0, short: 'Sun', full: 'Sunday' },
  { i: 1, short: 'Mon', full: 'Monday' },
  { i: 2, short: 'Tue', full: 'Tuesday' },
  { i: 3, short: 'Wed', full: 'Wednesday' },
  { i: 4, short: 'Thu', full: 'Thursday' },
  { i: 5, short: 'Fri', full: 'Friday' },
  { i: 6, short: 'Sat', full: 'Saturday' },
];

function Panel({ children, className }) {
  return <div className={cn('rounded-card bg-surface p-5', RING, className)}>{children}</div>;
}

/* Switch — the visible track stays 24px, but the hit area is a full 44px so the
   control is reachable on touch without changing how it looks. */
function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative grid min-h-11 w-11 shrink-0 place-items-center rounded-field transition',
        'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]',
      )}
    >
      <span className={cn('relative block h-6 w-11 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-raised')}>
        <span className={cn('absolute top-0.5 size-5 rounded-full bg-surface shadow-e1 transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

/* A labelled row with a switch. The whole row reads as one control. */
function ToggleRow({ icon: Icon, tone = 'brand', title, sub, checked, onChange }) {
  const tones = { brand: 'bg-brand-tint text-brand', warning: 'bg-warning-tint text-star' };
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-field', tones[tone])}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-caption font-semibold text-ink">{title}</p>
          <p className="text-[11px] text-ink-secondary">{sub}</p>
        </div>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

function TimeField({ id, label, value, onChange }) {
  return (
    <label htmlFor={id} className="flex-1 text-xs text-ink-secondary">
      {label}
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('sa-num mt-1 min-h-11 w-full rounded-field bg-raised px-3 text-caption text-ink outline-none',
          'focus-visible:shadow-[shadow:var(--focus-ring)]', RING)}
      />
    </label>
  );
}

function RangeField({ id, label, value, display, min, max, onChange }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={id} className="text-caption font-semibold text-ink">{label}</label>
        <span className="sa-num text-caption font-semibold text-brand">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full accent-brand focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]"
      />
    </div>
  );
}

export default function PartnerAvailability() {
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

  const addDate = () => {
    if (newDate && !form.unavailable_dates.includes(newDate)) {
      set({ unavailable_dates: [...form.unavailable_dates, newDate].sort() });
      setNewDate('');
    }
  };

  if (loadError) return (
    <div className="px-5 py-6 lg:px-8 lg:py-8">
      <PageHeader eyebrow="Schedule" title="Availability" backTo="/partner" />
      <div className={cn('flex items-start gap-3 rounded-card bg-danger-tint p-4', RING)} role="alert">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
        <div>
          <p className="text-caption font-semibold text-danger">Couldn&apos;t load your availability</p>
          <p className="mt-0.5 text-xs text-ink-secondary">{loadError}</p>
        </div>
      </div>
    </div>
  );

  if (!form) return (
    <div className="flex justify-center pt-32">
      <LoaderCircle className="size-6 animate-spin text-brand" role="status" aria-label="Loading availability" />
    </div>
  );

  // Conflicts are surfaced, never enforced — the server accepts these values and
  // blocking save here would change existing behaviour.
  const hoursInverted = form.start_time >= form.end_time;
  const lunchOutside = form.lunch.enabled
    && (form.lunch.start < form.start_time || form.lunch.end > form.end_time || form.lunch.start >= form.lunch.end);
  const noDays = form.working_days.length === 0;

  const saveButton = (
    <Button block onClick={save} loading={saving} disabled={saving}>
      {saving ? 'Saving…' : 'Save availability'}
    </Button>
  );

  return (
    <div
      className="px-5 py-6 lg:px-8 lg:py-8"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
    >
      <PageHeader
        eyebrow="Schedule"
        title="Availability"
        subtitle="When you're willing to be given work. Separate from going online and from accepting individual jobs."
        backTo="/partner"
        actions={<div className="hidden lg:block">{saveButton}</div>}
      />

      {form.vacation_mode && (
        <div className={cn('mb-5 flex items-start gap-3 rounded-card bg-warning-tint p-4', RING)} role="status">
          <Plane className="mt-0.5 size-5 shrink-0 text-star" aria-hidden="true" />
          <div>
            <p className="text-caption font-semibold text-star">Vacation mode is on</p>
            <p className="mt-0.5 text-xs text-ink-secondary">
              You won&apos;t be given new jobs while this is on. Your schedule below is kept
              and takes effect again when you turn it off.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px] lg:items-start">

        {/* ── Schedule workspace ────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Working days */}
          <Panel>
            <SectionHeader title="Working days" sub="The days you normally take jobs" className="mb-3" />
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((d) => {
                const on = form.working_days.includes(d.i);
                return (
                  <button
                    key={d.i}
                    type="button"
                    aria-pressed={on}
                    aria-label={d.full}
                    onClick={() => toggleIn('working_days', d.i)}
                    className={cn(
                      'min-h-11 rounded-field text-[11px] font-semibold transition',
                      'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]',
                      on ? 'bg-grad-brand text-white shadow-brand' : cn('bg-surface text-ink-secondary hover:bg-raised', RING),
                    )}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
            {noDays && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-star">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                No working days selected — you won&apos;t be matched to any jobs.
              </p>
            )}
          </Panel>

          {/* Working hours + lunch */}
          <Panel className="space-y-5">
            <div>
              <SectionHeader title="Working hours" action={<Clock className="size-4 text-ink-tertiary" aria-hidden="true" />} className="mb-3" />
              <div className="flex items-end gap-3">
                <TimeField id="start-time" label="Start" value={form.start_time} onChange={(v) => set({ start_time: v })} />
                <TimeField id="end-time" label="End" value={form.end_time} onChange={(v) => set({ end_time: v })} />
              </div>
              {hoursInverted && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-danger">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  Your end time is not after your start time.
                </p>
              )}
            </div>

            <div className="pt-5 shadow-[inset_0_1px_0_rgb(var(--hairline))]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-caption font-semibold text-ink">Lunch break</p>
                  <p className="text-[11px] text-ink-secondary">Kept free of jobs</p>
                </div>
                <Switch
                  checked={form.lunch.enabled}
                  onChange={(v) => set({ lunch: { ...form.lunch, enabled: v } })}
                  label="Lunch break"
                />
              </div>
              {form.lunch.enabled && (
                <>
                  <div className="mt-3 flex items-end gap-3">
                    <TimeField id="lunch-start" label="From" value={form.lunch.start} onChange={(v) => set({ lunch: { ...form.lunch, start: v } })} />
                    <TimeField id="lunch-end" label="To" value={form.lunch.end} onChange={(v) => set({ lunch: { ...form.lunch, end: v } })} />
                  </div>
                  {lunchOutside && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-star">
                      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      Your lunch break sits outside your working hours.
                    </p>
                  )}
                </>
              )}
            </div>
          </Panel>

          {/* Unavailable dates */}
          <Panel>
            <SectionHeader
              title="Unavailable dates"
              sub="One-off days you can't work"
              action={<CalendarOff className="size-4 text-ink-tertiary" aria-hidden="true" />}
              className="mb-3"
            />
            <div className="flex gap-2">
              <label htmlFor="new-date" className="sr-only">Add an unavailable date</label>
              <input
                id="new-date"
                type="date"
                value={newDate}
                min={moment().format('YYYY-MM-DD')}
                onChange={(e) => setNewDate(e.target.value)}
                className={cn('sa-num min-h-11 flex-1 rounded-field bg-raised px-3 text-caption text-ink outline-none',
                  'focus-visible:shadow-[shadow:var(--focus-ring)]', RING)}
              />
              <Button onClick={addDate} disabled={!newDate} aria-label="Add unavailable date">
                <Plus className="size-4" aria-hidden="true" />
              </Button>
            </div>
            {form.unavailable_dates.length === 0 ? (
              <p className="mt-3 text-xs text-ink-tertiary">No dates blocked.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {form.unavailable_dates.map((d) => (
                  <span key={d} className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-full bg-raised px-3 text-xs font-medium text-ink')}>
                    <span className="sa-num">{moment(d).format('D MMM YYYY')}</span>
                    <button
                      type="button"
                      onClick={() => set({ unavailable_dates: form.unavailable_dates.filter(x => x !== d) })}
                      aria-label={`Remove ${moment(d).format('D MMM YYYY')}`}
                      className={cn('relative grid size-8 place-items-center rounded-full text-ink-tertiary transition hover:bg-surface hover:text-ink',
                        // 44px touch target. The visible control stays 32px so the pill's
                        // height and width are untouched; the pseudo-element widens only
                        // the hit region, 6px on each side (32 + 12 = 44). Growing the
                        // button itself to size-11 would have pushed the pill 12px wider.
                        // `before:absolute` already emits `content: var(--tw-content)`,
                        // which preflight defaults to "" — so no content utility is needed.
                        'before:absolute before:-inset-1.5',
                        'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]')}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Panel>

          {/* Preferred areas */}
          <Panel>
            <SectionHeader
              title="Preferred areas"
              sub="Where you'd like jobs"
              action={<MapPin className="size-4 text-ink-tertiary" aria-hidden="true" />}
              className="mb-3"
            />
            <div className="flex flex-wrap gap-2">
              {CITIES.map((c) => (
                <Chip
                  key={c}
                  selected={form.preferred_areas.includes(c)}
                  onClick={() => toggleIn('preferred_areas', c)}
                  aria-pressed={form.preferred_areas.includes(c)}
                  className="md:min-h-11"
                >
                  {c}
                </Chip>
              ))}
            </div>
          </Panel>

          {/* Preferred categories */}
          {categories.length > 0 && (
            <Panel>
              <SectionHeader title="Preferred categories" sub="The work you want to be matched to" className="mb-3" />
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <Chip
                    key={c.slug}
                    selected={form.preferred_categories.includes(c.slug)}
                    onClick={() => toggleIn('preferred_categories', c.slug)}
                    aria-pressed={form.preferred_categories.includes(c.slug)}
                    className="md:min-h-11"
                  >
                    {c.name}
                  </Chip>
                ))}
              </div>
            </Panel>
          )}
        </div>

        {/* ── Rail ──────────────────────────────────────────────────────── */}
        <aside className="space-y-5 lg:sticky lg:top-5">
          <Panel className="space-y-4">
            <SectionHeader title="Job matching" className="mb-0" />
            <ToggleRow
              icon={Plane}
              tone="warning"
              title="Vacation mode"
              sub="Pause all new job assignments"
              checked={form.vacation_mode}
              onChange={(v) => set({ vacation_mode: v })}
            />
            <div className="pt-4 shadow-[inset_0_1px_0_rgb(var(--hairline))]">
              <ToggleRow
                icon={Zap}
                title="Instant booking"
                sub="Auto-accept jobs that match your settings"
                checked={form.instant_booking}
                onChange={(v) => set({ instant_booking: v })}
              />
            </div>
          </Panel>

          <Panel className="space-y-5">
            <SectionHeader title="Capacity" action={<CalendarDays className="size-4 text-ink-tertiary" aria-hidden="true" />} className="mb-0" />
            <RangeField
              id="max-daily-jobs"
              label="Max daily jobs"
              value={form.max_daily_jobs}
              display={form.max_daily_jobs}
              min={1}
              max={20}
              onChange={(v) => set({ max_daily_jobs: v })}
            />
            <RangeField
              id="coverage-radius"
              label="Coverage radius"
              value={form.coverage_radius_km}
              display={`${form.coverage_radius_km} km`}
              min={1}
              max={100}
              onChange={(v) => set({ coverage_radius_km: v })}
            />
          </Panel>
        </aside>
      </div>

      {/* Sticky save — mobile only; desktop keeps it in the header. */}
      <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
        <div
          className="bg-surface/95 px-5 py-4 backdrop-blur-xl shadow-[inset_0_1px_0_rgb(var(--hairline))]"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          {saveButton}
        </div>
      </div>
    </div>
  );
}
