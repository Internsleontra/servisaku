import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CalendarDays, LoaderCircle, TriangleAlert } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { PageHeader } from '@/components/partner/PageHeader';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { JobCard, JobStatusBadge } from '@/components/partner/job';
import { Button, RING } from '@/components/ds';
import { cn } from '@/lib/utils';
import moment from 'moment';
import { toast } from 'sonner';

/* Calendar shows SCHEDULED JOBS and when they happen. It is not availability:
   availability is when a partner is willing to work and lives on its own page.
   Nothing here changes availability, online/offline state, or job acceptance. */

/* ── Date handling ──────────────────────────────────────────────────────────
   The API returns `date` as a full ISO instant pinned to midnight UTC —
   "2026-07-29T00:00:00.000Z" — because the server stores a calendar date in a
   DateTime column. It is a DATE, not a moment in time; the time of day lives
   separately in `time_slot` ("9:00 AM").

   So the only correct read is the literal calendar date. Taking the first ten
   characters does that and is timezone-proof: converting through the browser's
   zone would shift the day for anyone west of UTC.

   This replaces `j.date === selectedDate`, which compared a 24-character ISO
   string to a 10-character day key and therefore never matched — the calendar
   showed zero jobs on every date. */
const dayKey = (d) => (d ? String(d).slice(0, 10) : null);

const WEEKDAYS = [
  { short: 'Su', full: 'Sunday' }, { short: 'Mo', full: 'Monday' },
  { short: 'Tu', full: 'Tuesday' }, { short: 'We', full: 'Wednesday' },
  { short: 'Th', full: 'Thursday' }, { short: 'Fr', full: 'Friday' },
  { short: 'Sa', full: 'Saturday' },
];

function Panel({ children, className }) {
  return <div className={cn('rounded-card bg-surface p-5', RING, className)}>{children}</div>;
}

export default function PartnerCalendar() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(moment().startOf('month'));
  const [selectedDate, setSelectedDate] = useState(moment().format('YYYY-MM-DD'));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await servisaku.auth.me();
        // Fetch all jobs for this partner (not cancelled/rejected)
        const allJobs = await servisaku.entities.Booking.filter({ partner_email: me.email }, '-date', 200);
        setJobs(allJobs.filter(j => j.status !== 'cancelled' && j.status !== 'rejected'));
      } catch (err) {
        // Without this the spinner span forever on any failure, with nothing on
        // screen to say why — the page just looked permanently broken.
        console.error('[PartnerCalendar] failed to load jobs:', err);
        setLoadError(err?.message || 'Could not load your calendar');
        toast.error(err?.message || 'Could not load your calendar');
        setJobs([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Index jobs by calendar day once, rather than filtering the list per cell.
  const jobsByDay = useMemo(() => {
    const map = new Map();
    for (const j of jobs) {
      const k = dayKey(j.date);
      if (!k) continue;                       // a booking with no date is skipped, not crashed on
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(j);
    }
    return map;
  }, [jobs]);

  const calendarDays = useMemo(() => {
    const days = [];
    const firstDayOfWeek = currentMonth.day();   // 0 = Sunday
    for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= currentMonth.daysInMonth(); i++) {
      days.push(moment(currentMonth).date(i).format('YYYY-MM-DD'));
    }
    return days;
  }, [currentMonth]);

  const prevMonth = () => setCurrentMonth(moment(currentMonth).subtract(1, 'month'));
  const nextMonth = () => setCurrentMonth(moment(currentMonth).add(1, 'month'));
  const goToday = () => {
    const today = moment();
    setCurrentMonth(today.clone().startOf('month'));
    setSelectedDate(today.format('YYYY-MM-DD'));
  };

  const jobsOnSelectedDate = jobsByDay.get(selectedDate) || [];
  const todayKey = moment().format('YYYY-MM-DD');
  const monthJobCount = calendarDays.reduce((n, d) => n + (d ? (jobsByDay.get(d)?.length || 0) : 0), 0);
  const selectedIsToday = selectedDate === todayKey;

  return (
    <div className="px-5 py-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        subtitle="Your scheduled jobs and when they happen."
        backTo="/partner"
        actions={<Button variant="outline" onClick={goToday}>Today</Button>}
      />

      {loadError && (
        <div className={cn('mb-5 flex items-start gap-3 rounded-card bg-danger-tint p-4', RING)} role="alert">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
          <div>
            <p className="text-caption font-semibold text-danger">Couldn&apos;t load your calendar</p>
            <p className="mt-0.5 text-xs text-ink-secondary">{loadError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px] lg:items-start">

        {/* ── Month grid ────────────────────────────────────────────────── */}
        <Panel>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-h4 text-ink" aria-live="polite">{currentMonth.format('MMMM YYYY')}</h2>
              <p className="sa-num mt-0.5 text-xs text-ink-secondary">
                {monthJobCount === 0 ? 'No jobs this month' : `${monthJobCount} job${monthJobCount === 1 ? '' : 's'} this month`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={prevMonth}
                aria-label={`Previous month, ${moment(currentMonth).subtract(1, 'month').format('MMMM YYYY')}`}
                className={cn('grid size-11 place-items-center rounded-field bg-surface text-ink transition hover:bg-raised',
                  'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]', RING)}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                aria-label={`Next month, ${moment(currentMonth).add(1, 'month').format('MMMM YYYY')}`}
                className={cn('grid size-11 place-items-center rounded-field bg-surface text-ink transition hover:bg-raised',
                  'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]', RING)}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((d) => (
              <div key={d.short} className="sa-caps text-center text-[10px] text-ink-tertiary" aria-hidden="true">
                {d.short}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label={`${currentMonth.format('MMMM YYYY')} calendar`}>
            {calendarDays.map((date, idx) => {
              if (!date) return <div key={`empty-${idx}`} aria-hidden="true" />;

              const dayJobs = jobsByDay.get(date) || [];
              const isSelected = date === selectedDate;
              const isToday = date === todayKey;
              const label = `${moment(date).format('dddd, D MMMM YYYY')}`
                + (dayJobs.length ? `, ${dayJobs.length} job${dayJobs.length === 1 ? '' : 's'}` : ', no jobs');

              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  aria-label={label}
                  aria-pressed={isSelected}
                  {...(isToday ? { 'aria-current': 'date' } : {})}
                  className={cn(
                    'relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-field transition',
                    'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]',
                    isSelected
                      ? 'bg-grad-brand text-white shadow-brand'
                      : isToday
                        ? cn('bg-brand-tint text-brand', RING)
                        : 'text-ink hover:bg-raised',
                  )}
                >
                  <span className={cn('sa-num text-caption', (isSelected || isToday) && 'font-semibold')}>
                    {moment(date).date()}
                  </span>
                  {/* Count, not just a dot — job presence must not be colour-only. */}
                  {dayJobs.length > 0 && (
                    <span
                      className={cn('sa-num rounded-full px-1 text-[9px] font-semibold leading-tight',
                        isSelected ? 'bg-white/25 text-white' : 'bg-brand text-white')}
                    >
                      {dayJobs.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Panel>

        {/* ── Selected day ──────────────────────────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-5">
          <SectionHeader
            title={moment(selectedDate).format('dddd, D MMMM')}
            sub={selectedIsToday ? 'Today' : moment(selectedDate).format('YYYY')}
            action={<CalendarDays className="size-4 text-ink-tertiary" aria-hidden="true" />}
          />

          <div aria-live="polite">
            {loading ? (
              <div className="flex justify-center py-10">
                <LoaderCircle className="size-6 animate-spin text-brand" role="status" aria-label="Loading your jobs" />
              </div>
            ) : jobsOnSelectedDate.length === 0 ? (
              <Panel className="py-10 text-center">
                <p className="text-caption text-ink-secondary">
                  {jobs.length === 0 && !loadError
                    ? 'You have no scheduled jobs yet.'
                    : 'No jobs scheduled for this day.'}
                </p>
              </Panel>
            ) : (
              <div className="space-y-3">
                {jobsOnSelectedDate.map((job) => (
                  <JobCard
                    key={job.id}
                    to={`/partner/job/${job.id}`}
                    job={{
                      id: job.id,
                      status: job.status,
                      service_name: job.service_type,
                      scheduled_at: job.time_slot,
                      address: job.city,
                      total_amount: job.price,
                      // Server-computed split; never recalculated on the client.
                      payout_amount: job.partner_payout,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Month-at-a-glance by status, so a partner can see the shape of their
              workload without opening each day. Partner vocabulary throughout. */}
          {!loading && monthJobCount > 0 && (
            <Panel>
              <SectionHeader title="This month" className="mb-3" />
              <ul className="space-y-2">
                {Object.entries(
                  calendarDays.filter(Boolean).flatMap((d) => jobsByDay.get(d) || [])
                    .reduce((acc, j) => { acc[j.status] = (acc[j.status] || 0) + 1; return acc; }, {}),
                ).map(([status, count]) => (
                  <li key={status} className="flex items-center justify-between gap-3">
                    <JobStatusBadge status={status} />
                    <span className="sa-num text-caption font-semibold text-ink">{count}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
