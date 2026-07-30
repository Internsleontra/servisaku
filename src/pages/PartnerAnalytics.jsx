import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, CheckCircle2, XCircle, Repeat, Timer, Gauge } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { MetricCard } from '@/components/partner/MetricCard';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { formatRM } from '@/lib/paymentEngine';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import moment from 'moment';

const BRAND = 'hsl(24 95% 53%)';
const payoutOf = (b) => b.partner_payout ?? Math.round((b.price || 0) * 0.8);

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

function Card({ children, className = '' }) {
  return <div className={`bg-surface rounded-2xl border border-hairline/10 shadow-e1 p-4 ${className}`}>{children}</div>;
}

export default function PartnerAnalytics() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

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
    const rating = user?.partner_rating || null;

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

    return { completed, completionRate, cancellationRate, rating, repeatCustomers, avgDuration, revenue, topServices, peak, performanceScore };
  }, [bookings, user]);

  const maxRevenue = Math.max(1, ...stats.revenue.map((r) => r.value));
  const maxSvc = Math.max(1, ...stats.topServices.map((s) => s.revenue));

  return (
    <div className="min-h-screen bg-bg font-inter" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-ink via-brand to-brand/80 px-5 lg:px-8 pt-14 lg:pt-8 pb-10">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <ArrowLeft className="h-4 w-4 text-white" />
          </button>
          <div>
            <p className="text-white/60 text-xs">Analytics</p>
            <h1 className="text-xl font-bold text-white">Your performance</h1>
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Gauge className="h-7 w-7 text-white" />
          </div>
          <div>
            <p className="text-white/50 text-xs font-medium">Performance score</p>
            <p className="text-3xl font-bold text-white tracking-tight">{stats.performanceScore ?? '—'}<span className="text-lg text-white/50">/100</span></p>
            <p className="text-white/45 text-[10px] mt-0.5">Rating, completion & reliability</p>
          </div>
        </div>
      </div>

      <div className="px-5 lg:px-8 max-w-2xl mx-auto -mt-5 space-y-5">
        {loading ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-raised border-t-brand rounded-full animate-spin" /></div>
        ) : (
          <>
            {/* KPI tiles */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <MetricCard icon={Star} tone="amber" label="Avg rating" value={stats.rating ? stats.rating.toFixed(1) : '—'} />
              <MetricCard icon={CheckCircle2} tone="emerald" label="Completion" value={stats.completionRate != null ? `${stats.completionRate}%` : '—'} />
              <MetricCard icon={XCircle} tone="rose" label="Cancellation" value={stats.cancellationRate != null ? `${stats.cancellationRate}%` : '—'} />
              <MetricCard icon={Repeat} tone="violet" label="Repeat clients" value={stats.repeatCustomers} />
              <MetricCard icon={Timer} tone="sky" label="Avg duration" value={stats.avgDuration != null ? `${stats.avgDuration}m` : '—'} />
              <MetricCard icon={Gauge} tone="brand" label="Jobs done" value={stats.completed.length} />
            </div>

            {/* Revenue trend */}
            <Card>
              <SectionHeader title="Revenue trend" sub="Net earnings, last 6 months" className="mb-4" />
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={stats.revenue} barCategoryGap="30%">
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => [formatRM(v), 'Earned']} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {stats.revenue.map((r, i) => <Cell key={i} fill={r.value === maxRevenue ? BRAND : '#e5e7eb'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Top services */}
            <Card>
              <SectionHeader title="Top services" sub="By net earnings" className="mb-3" />
              {stats.topServices.length === 0 ? (
                <p className="text-xs text-ink-tertiary">No completed jobs yet.</p>
              ) : (
                <div className="space-y-3">
                  {stats.topServices.map((s) => (
                    <div key={s.name}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-ink truncate">{s.name}</span>
                        <span className="font-bold text-brand shrink-0 ml-2">{formatRM(s.revenue)} · {s.jobs}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-raised">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${(s.revenue / maxSvc) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Peak times */}
            <Card>
              <SectionHeader title="Busiest times" sub="When you complete jobs" className="mb-4" />
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={stats.peak} barCategoryGap="30%">
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => [v, 'Jobs']} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={BRAND} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <p className="text-center text-[10px] text-ink-tertiary">Acceptance rate & per-day breakdowns need server-side metrics (coming soon).</p>
          </>
        )}
      </div>
    </div>
  );
}
