import { Field } from '../fields';
import { SLOT_GROUPS } from '@/lib/bookingEngine';
import { isAfterHours, isUrgent } from '../scheduleRules';
import { Zap, Moon } from 'lucide-react';
import { useMemo } from 'react';
import { TimeSlotPicker } from '@/components/ds';
import { useTranslation } from '@/lib/useTranslation';

/**
 * Step C — Date & time.
 *
 * Rebuilt on the design system's TimeSlotPicker: a horizontal day strip (active
 * day carries the brand gradient + brand glow) over a 3-up slot grid (active
 * slot is a brand-tint fill with a 1.5px inset ring). Replaces the previous
 * native date input + grouped slot lists.
 *
 * Same-day booking is still supported, and after-hours / urgent are still
 * flagged so the live quote and Step F reflect the surcharge before payment.
 */

/* Next 14 days as a day strip. Sundays are marked full — the seed treats them
   as non-operating; adjust when real availability lands. */
function buildDays(count, locale) {
  const out = [];
  const today = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({
      id: d.toISOString().slice(0, 10),
      dow: d.toLocaleDateString(locale, { weekday: 'short' }),
      date: d.getDate(),
      full: d.getDay() === 0,
    });
  }
  return out;
}

/* Flatten the engine's slot groups into the picker's flat list, preserving
   order (morning → afternoon → evening). */
const SLOTS = Object.values(SLOT_GROUPS).flatMap((g) =>
  g.slots.map((s) => ({ id: s, label: s })),
);

export default function StepC({ schedule, setSchedule }) {
  const { t, locale } = useTranslation();
  const afterHours = isAfterHours(schedule.timeSlot);
  const urgent = isUrgent(schedule.date);

  // Weekday abbreviations come from the locale, so the strip reads Isn/Sel/Rab
  // in Malay rather than Mon/Tue/Wed. Rebuilt when the language changes.
  const days = useMemo(() => buildDays(14, locale), [locale]);

  return (
    <div className="flex flex-col gap-6">
      <Field label={t('Date & time')} required>
        <TimeSlotPicker
          days={days}
          slots={SLOTS}
          day={schedule.date}
          slot={schedule.timeSlot}
          onDayChange={(id) => setSchedule((s) => ({ ...s, date: id }))}
          onSlotChange={(id) => setSchedule((s) => ({ ...s, timeSlot: id }))}
        />
      </Field>

      {(afterHours || urgent) && (
        <div className="flex flex-col gap-1.5 rounded-field bg-warning/5 px-4 py-3 text-caption font-normal text-ink shadow-[inset_0_0_0_1px_rgb(var(--warning)/0.3)]">
          {urgent && (
            <div className="flex items-center gap-2">
              <Zap className="size-4 shrink-0 text-warning" /> {t('Same-day booking — an urgent surcharge applies.')}
            </div>
          )}
          {afterHours && (
            <div className="flex items-center gap-2">
              <Moon className="size-4 shrink-0 text-warning" /> {t('After-hours slot — an after-hours surcharge applies.')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
