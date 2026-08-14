import { useState, useEffect, useMemo } from 'react';
import {
  Star, CheckCircle2, XCircle, Repeat, Timer, Gauge, TrendingUp,
  LoaderCircle, TriangleAlert, Clock,
} from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { PageHeader } from '@/components/partner/PageHeader';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { MoneyValue, MetricStat } from '@/components/partner/money';
import { RING } from '@/components/ds';
import { formatMYR, cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { chartColors, chartTooltipStyle } from '@/lib/partner/chartTokens';
import moment from 'moment';

/* ── Data provenance ────────────────────────────────────────────────────────
   Everything here is derived from GET /api/bookings for this partner, plus
   the partner rating from auth/me. There is no analytics endpoint; the counts and
   rates below are computed from the booking list, which is why the note at the
   foot of the page says acceptance rate and per-day breakdowns need server-side
   metrics.

   MONEY: `partner_payout` is the canonical server value, computed by
   split() and stored on the booking's escrow row. It is NEVER re-derived here.
   This page used to fall back to `Math.round(price * 0.8)` — a client-side
   guess that assumed a flat 20% for every partner (ignoring tier) and rounded
   to whole ringgit. A booking with no escrow row now contributes nothing rather
   than a fabricated figure.

   DATES: `date` arrives as a full ISO instant pinned to midnight UTC. The
   month rollup below uses `.startsWith('YYYY-MM')`, which is a prefix match on
   that string and is correct — no dayKey() normalisation is needed here because
   nothing compares a whole calendar day for equality. The moment() calls are
   genuine instants (`lifecycle[].at`) and a clock-time string (`time_slot`),
   both of which moment is the right tool for.
--------------------------------------------------------------------------- */
const payoutOf = (b) => b.partner_payout ?? null;

function jobDurationMin(b) {
  const lc = Array.isArray(b.lifecycle) ? b.lifecycle : [];
  const s = lc.find((e) => e.status === 'started');
  const c = lc.find((e) => e.status === 'completed');
  return s && c ? Math.max(0, moment(c.at).diff(moment(s.at), 'minutes')) : null;
}

const TIME_BUCKETS = [
  { label: 'Morning', test: (h) => h >= 6 && h < 12 },
  { label: 'Afternoon', test: (h) => h >= 12 && h < 17 },
  { label: 'Evening', test: (h) => h >= 17 && h < 21 },
  { label: 'Night', test: (h) => h >= 21 || h < 6 },
];

function Panel({ children, className }) {
  return <div className={cn('rounded-card bg-surface p-5', RING, className)}>{children}</div>;
}

/* A KPI that is a count or a rate, not money — MetricStat covers money. */
function StatTile({ icon: Icon, label, value, caption }) {
  return (
    <div className={cn('rounded-card bg-surface p-4', RING)}>
      <span className="grid size-9 place-items-center rounded-field bg-brand-tint text-brand">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <p className="sa-num mt-3 text-h3 font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-ink-secondary">{label}</p>
      {caption && <p className="mt-0.5 text-[10px] text-ink-tertiary">{caption}</p>}
    </div>
  );
}

export default function PartnerAnalytics() {
  // Recharts needs literal colours; these come from the design tokens rather
  // than the old orange `BRAND` const and Tailwind default greys.
  const chart = chartColors();
  const tooltipStyle = chartTooltipStyle();
  const [user, setUser] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await servisaku.auth.me();
        setUser(me);
        const all = await servisaku.entities.Booking.filter({ partner_email: me.email }, '-created_date', 300);
        setBookings(all);
      } catch (err) {
        // Always drop the spinner — a failed load must not leave the page
        // stuck loading forever with no explanation.
        console.error('[PartnerAnalytics] failed to load bookings:', err);
        setLoadError(err?.message || 'Could not load your analytics');
        setBookings([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const stats = useMemo(() => {
    const completed = bookings.filter((b) => b.status === 'completed');
    const cancelled = bookings.filter((b) => b.status === 'cancelled');
    const finished = completed.length + cancelled.length;
    const completionRate = finished ? Math.round((completed.length / finished) * 100) : null;
    const cancellationRate = finished ? Math.round((cancelled.length / finished) * 100) : null;
    // The real API returns `partnerRating` (camelCase); the demo mockClient
    // returns `partner_rating`. Reading only the snake_case key meant the rating
    // was always undefined against the real backend — the tile showed "—" and
    // the performance score silently fell back to its 80 default, reporting 90
    // for a partner actually rated 5.0. Same both-shapes pattern as
    // `full_name || fullName` elsewhere.
    const rating = user?.partnerRating ?? user?.partner_rating ?? null;

    const repeatCustomers = (() => {
      const counts = {};
      completed.forEach((b) => { const k = b.consumer_name || b.consumer_id; if (k) counts[k] = (counts[k] || 0) + 1; });
      return Object.values(counts).filter((c) => c > 1).length;
    })();

    const durations = completed.map(jobDurationMin).filter((x) => x != null);
    const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

    // Revenue last 6 months
    const revenue = Array.from({ length: 6 }, (_, i) => {
      const m = moment().subtract(5 - i, 'months');
      const key = m.format('YYYY-MM');
      const value = completed.filter((b) => b.date?.startsWith(key)).reduce((s, b) => s + payoutOf(b), 0);
      return { label: m.format('MMM'), value };
    });

    // Top services by revenue
    const svcMap = {};
    completed.forEach((b) => {
      const k = b.service_type || 'Other';
      svcMap[k] = svcMap[k] || { name: k, jobs: 0, revenue: 0 };
      svcMap[k].jobs += 1; svcMap[k].revenue += payoutOf(b);
    });
    const topServices = Object.values(svcMap).sort((a, b) => b.revenue - a.revenue).slice(0, 6);

    // Peak time-of-day (from time_slot)
    const peak = TIME_BUCKETS.map((b) => ({ label: b.label, value: 0 }));
    completed.forEach((b) => {
      const h = moment(b.time_slot, ['h:mm A', 'HH:mm']).hour();
      if (!Number.isNaN(h)) { const idx = TIME_BUCKETS.findIndex((t) => t.test(h)); if (idx >= 0) peak[idx].value += 1; }
    });

    const ratingPct = rating ? (rating / 5) * 100 : null;
    const performanceScore = completed.length
      ? Math.round((ratingPct ?? 80) * 0.5 + (completionRate ?? 100) * 0.3 + (100 - (cancellationRate ?? 0)) * 0.2)
      : null;

    const totalRevenue = revenue.reduce((s, r) => s + r.value, 0);

    return { completed, completionRate, cancellationRate, rating, repeatCustomers, avgDuration, revenue, topServices, peak, performanceScore, totalRevenue };
  }, [bookings, user]);

  const maxRevenue = Math.max(1, ...stats.revenue.map((r) => r.value));
  const maxSvc = Math.max(1, ...stats.topServices.map((s) => s.revenue));
  const hasRevenue = stats.revenue.some((r) => r.value > 0);
  const hasPeak = stats.peak.some((p) => p.value > 0);

  return (
    <div className="px-5 py-6 lg:px-8 lg:py-8" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
      <PageHeader
        eyebrow="Analytics"
        title="Your performance"
        subtitle="Completed jobs, earnings and reliability over time."
        backTo="/partner"
      />

      {loadError && (
        <div className={cn('mb-5 flex items-start gap-3 rounded-card bg-danger-tint p-4', RING)} role="alert">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
          <div>
            <p className="text-caption font-semibold text-danger">Couldn&apos;t load your analytics</p>
            <p className="mt-0.5 text-xs text-ink-secondary">{loadError}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <LoaderCircle className="size-6 animate-spin text-brand" role="status" aria-label="Loading your analytics" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px] lg:items-start">

          {/* ── Charts ──────────────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Revenue trend */}
            <Panel>
              <SectionHeader
                title="Revenue trend"
                sub="Net earnings, last 6 months"
                action={<TrendingUp className="size-4 text-brand" aria-hidden="true" />}
                className="mb-4"
              />
              {!hasRevenue ? (
                <p className="py-8 text-center text-caption text-ink-secondary">
                  No completed jobs in the last 6 months yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={stats.revenue} barCategoryGap="30%">
                    <CartesianGrid vertical={false} stroke={chart.grid} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: chart.axis }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v) => [formatMYR(v, { decimals: true }), 'Earned']}
                      contentStyle={tooltipStyle}
                      cursor={{ fill: chart.track, opacity: 0.35 }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {stats.revenue.map((r, i) => <Cell key={i} fill={r.value === maxRevenue ? chart.brand : chart.track} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            {/* Top services */}
            <Panel>
              <SectionHeader title="Top services" sub="By net earnings" className="mb-3" />
              {stats.topServices.length === 0 ? (
                <p className="py-6 text-center text-caption text-ink-secondary">No completed jobs yet.</p>
              ) : (
                <div className="space-y-3">
                  {stats.topServices.map((s) => (
                    <div key={s.name}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-medium text-ink">{s.name}</span>
                        <span className="sa-num shrink-0 text-ink-secondary">
                          <MoneyValue amount={s.revenue} size="sm" /> · {s.jobs} job{s.jobs === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div
                        className="h-2 w-full overflow-hidden rounded-full bg-raised"
                        role="progressbar"
                        aria-valuenow={Math.round((s.revenue / maxSvc) * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${s.name}: ${formatMYR(s.revenue, { decimals: true })} across ${s.jobs} job${s.jobs === 1 ? '' : 's'}`}
                      >
                        <div className="h-full rounded-full bg-grad-brand" style={{ width: `${(s.revenue / maxSvc) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Peak times */}
            <Panel>
              <SectionHeader
                title="Busiest times"
                sub="When you complete jobs"
                action={<Clock className="size-4 text-ink-tertiary" aria-hidden="true" />}
                className="mb-4"
              />
              {!hasPeak ? (
                <p className="py-8 text-center text-caption text-ink-secondary">
                  Not enough completed jobs to show a pattern yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={stats.peak} barCategoryGap="30%">
                    <CartesianGrid vertical={false} stroke={chart.grid} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: chart.axis }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v) => [v, 'Jobs']}
                      contentStyle={tooltipStyle}
                      cursor={{ fill: chart.track, opacity: 0.35 }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={chart.brand} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <p className="text-center text-[10px] text-ink-tertiary">
              Acceptance rate &amp; per-day breakdowns need server-side metrics (coming soon).
            </p>
          </div>

          {/* ── Rail ────────────────────────────────────────────────────── */}
          <aside className="space-y-5 lg:sticky lg:top-5">
            <MetricStat
              variant="dark"
              label="Performance score"
              value={stats.performanceScore != null ? `${stats.performanceScore}/100` : '—'}
              icon={Gauge}
              caption="Rating, completion & reliability"
            />

            <MetricStat
              label="Net earnings"
              amount={stats.totalRevenue}
              icon={TrendingUp}
              caption="Last 6 months"
            />

            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={Star} label="Avg rating" value={stats.rating ? stats.rating.toFixed(1) : '—'} />
              <StatTile icon={Gauge} label="Jobs done" value={stats.completed.length} />
              <StatTile icon={CheckCircle2} label="Completion" value={stats.completionRate != null ? `${stats.completionRate}%` : '—'} />
              <StatTile icon={XCircle} label="Cancellation" value={stats.cancellationRate != null ? `${stats.cancellationRate}%` : '—'} />
              <StatTile icon={Repeat} label="Repeat clients" value={stats.repeatCustomers} />
              <StatTile
                icon={Timer}
                label="Avg duration"
                value={stats.avgDuration != null ? `${stats.avgDuration}m` : '—'}
                caption={stats.avgDuration == null ? 'Needs job timings' : undefined}
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
