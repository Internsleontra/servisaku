import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { servisaku } from '@/api/servisakuClient';
import {
  Clock, Star, ClipboardList, Wrench, Wallet, Banknote, Bell,
  ChevronDown, LifeBuoy, Trophy, CheckCircle2, TrendingUp, ArrowRight, LoaderCircle,
} from 'lucide-react';
import { Button, RING } from '@/components/ds';
import { PageHeader } from '@/components/partner/PageHeader';
import { MetricStat, MoneyValue } from '@/components/partner/money';
import { JobCard } from '@/components/partner/job';
import { OutstandingCommissionBanner } from '@/components/partner/OutstandingCommissionBanner';
import { usePartnerUnread } from '@/apps/partner/PartnerNotifications';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import moment from 'moment';

// Keep the sen. The server splits to 2dp (server/lib/payments/commission.js);
// rounding to whole ringgit here would show a figure the wallet disagrees with.
// Server value only. The `?? price * 0.8` fallback that used to sit here was a
// client-side guess at the commission — it assumed a flat 20% for every partner
// (ignoring tier) and each partner surface rounded it differently. The Booking
// API now returns the canonical split from the escrow row; `null` means the
// figure genuinely is not known yet and must render as "—", not as a guess.
const payoutOf = (j) => j.partner_payout ?? null;
const ONGOING = ['accepted', 'en_route', 'arrived', 'started'];

/* The API returns `date` as a full ISO instant pinned to midnight UTC —
   "2026-07-29T00:00:00.000Z" — because the server stores a calendar date in a
   DateTime column. Comparing that 24-character string to a 10-character
   "YYYY-MM-DD" key is never true, so every strict date equality below silently
   evaluated to zero. Slicing reads the stored calendar date literally and is
   timezone-proof; converting through the browser's zone would shift the day for
   anyone west of UTC. Same helper as PartnerCalendar. */
const dayKey = (d) => (d ? String(d).slice(0, 10) : null);

// Tiny dependency-free sparkline for the earnings trend.
function Sparkline({ data, className = '' }) {
  const w = 120, h = 40;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => [
    data.length > 1 ? (i / (data.length - 1)) * w : w,
    h - ((v - min) / range) * (h - 4) - 2,
  ]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--brand))" stopOpacity="0.28" />
          <stop offset="100%" stopColor="rgb(var(--brand))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <path d={line} fill="none" stroke="rgb(var(--brand))" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const TONE = {
  brand: 'bg-brand-tint text-brand',
  emerald: 'bg-success-tint text-success',
  amber: 'bg-warning-tint text-star',
};

/* Section card — inset ring, never border + shadow; canonical 20px radius. */
function Panel({ title, action, children, className }) {
  return (
    <section className={cn('rounded-card bg-surface p-5', RING, className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-md font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/* "View all" style link — 44px tap target and a visible focus ring. */
function PanelLink({ to, children }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center gap-1 rounded-field text-caption font-semibold text-brand transition-colors hover:text-brand-ink focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]"
    >
      {children} <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

export default function PartnerDashboard() {
  const [user, setUser] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(() => localStorage.getItem('partner_online') !== 'false');
  const unread = usePartnerUnread();

  useEffect(() => {
    const load = async () => {
      const me = await servisaku.auth.me();
      setUser(me);
      const [myJobs, pool] = await Promise.all([
        servisaku.entities.Booking.filter({ partner_email: me.email }, '-created_date', 50),
        servisaku.entities.Booking.filter({ available: true }, '-created_date', 50),
      ]);
      const merged = [...pool, ...myJobs].filter((j, i, a) => a.findIndex(x => x.id === j.id) === i);
      setJobs(merged);
      setLoading(false);
    };
    load();
  }, []);

  const today = moment().format('YYYY-MM-DD');
  const pendingJobs = jobs.filter(j => j.status === 'pending');
  const todayJobs = jobs.filter(j => dayKey(j.date) === today && j.status !== 'pending');
  const ongoingJobs = jobs.filter(j => ONGOING.includes(j.status));
  const completedJobs = jobs.filter(j => j.status === 'completed');

  // ── Earnings ──
  const todayEarn = completedJobs.filter(j => dayKey(j.date) === today).reduce((s, j) => s + payoutOf(j), 0);
  const weekEarn = completedJobs.filter(j => moment(j.date).isAfter(moment().subtract(7, 'days'))).reduce((s, j) => s + payoutOf(j), 0);
  const monthEarn = completedJobs.filter(j => moment(j.date).isSame(moment(), 'month')).reduce((s, j) => s + payoutOf(j), 0);
  const walletBalance = completedJobs.reduce((s, j) => s + payoutOf(j), 0);

  const prevWeekEarn = completedJobs.filter(j => {
    const m = moment(j.date);
    return m.isAfter(moment().subtract(14, 'days')) && m.isSameOrBefore(moment().subtract(7, 'days'));
  }).reduce((s, j) => s + payoutOf(j), 0);
  const weekDelta = prevWeekEarn > 0 ? Math.round((weekEarn - prevWeekEarn) / prevWeekEarn * 100) : null;
  const prevMonthEarn = completedJobs.filter(j => moment(j.date).isSame(moment().subtract(1, 'month'), 'month')).reduce((s, j) => s + payoutOf(j), 0);
  const monthDelta = prevMonthEarn > 0 ? Math.round((monthEarn - prevMonthEarn) / prevMonthEarn * 100) : null;

  // 7-day earnings series for the sparkline.
  const series = [...Array(7)].map((_, i) => {
    const d = moment().subtract(6 - i, 'days').format('YYYY-MM-DD');
    return completedJobs.filter(j => dayKey(j.date) === d).reduce((s, j) => s + payoutOf(j), 0);
  });

  const rating = user?.partner_rating ? user.partner_rating.toFixed(1) : '4.8';

  const toggleOnline = () => {
    const next = !online;
    setOnline(next);
    localStorage.setItem('partner_online', String(next));
    toast.success(next ? 'You are now online!' : 'You are now offline');
  };

  const updateStatus = async (id, status) => {
    await servisaku.entities.Booking.update(id, { status });
    setJobs(jobs.map(j => j.id === id ? { ...j, status } : j));
  };

  const acceptJob = async (job) => {
    try {
      if (!job.partner_id) {
        const res = await servisaku.entities.Booking.claim(job.id);
        setJobs(prev => prev.map(j => j.id === job.id
          ? { ...j, status: 'accepted', partner_id: res?.partner_id, partner_email: res?.partner_email } : j));
      } else {
        await servisaku.entities.Booking.update(job.id, { status: 'accepted' });
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'accepted' } : j));
      }
      toast.success('Job accepted');
    } catch (e) {
      toast.error(e.message || 'Could not accept job');
    }
  };

  const declineJob = async (job) => {
    if (!job.partner_id) { setJobs(prev => prev.filter(j => j.id !== job.id)); return; }
    await updateStatus(job.id, 'cancelled');
  };

  const hour = moment().hour();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  // Mock backend returns `full_name`; the real Express backend returns `fullName`.
  const fullName = user?.full_name || user?.fullName || '';
  const firstName = fullName.split(' ')[0] || 'Partner';

  // Counts stay plain numbers; money goes through the money primitives.
  const counts = [
    { icon: ClipboardList, value: todayJobs.length, label: 'Bookings Today' },
    { icon: Clock, value: ongoingJobs.length, label: 'Ongoing Jobs' },
    { icon: Star, value: rating, label: 'Rating' },
  ];

  const quickActions = [
    { icon: ClipboardList, label: 'My Bookings', to: '/partner/calendar' },
    { icon: Wrench, label: 'My Services', to: '/partner/inventory' },
    { icon: Clock, label: 'Availability', to: '/partner/availability' },
    { icon: Wallet, label: 'Earnings', to: '/partner/earnings' },
    { icon: Star, label: 'Reviews', to: '/partner/reviews' },
    { icon: LifeBuoy, label: 'Help & Support', to: '/partner/support' },
  ];

  // Recent notifications derived from real job activity.
  const recentNotifs = [];
  if (pendingJobs[0]) recentNotifs.push({ icon: Bell, tone: 'brand', title: 'New booking request received', sub: `${pendingJobs[0].service_type} · ${pendingJobs[0].time_slot || 'Today'}`, time: '2m ago' });
  if (completedJobs[0]) recentNotifs.push({ icon: CheckCircle2, tone: 'emerald', title: 'Payout successful', sub: `Wallet · ${moment(completedJobs[0].date).format('D MMM YYYY')}`, amount: payoutOf(completedJobs[0]), time: '1h ago' });
  if (completedJobs[1]) recentNotifs.push({ icon: Star, tone: 'amber', title: 'Customer review received', sub: `${completedJobs[1].service_type} · ${moment(completedJobs[1].date).format('D MMM YYYY')}`, time: '2h ago' });

  if (!user) return (
    <div className="flex min-h-[60vh] items-center justify-center">
      {/* Canonical loader — the same lucide spinner ds/Button uses. Avoids a
          border-2 ring, which the design system does not sanction. */}
      <LoaderCircle className="size-6 animate-spin text-brand" role="status" aria-label="Loading dashboard" />
    </div>
  );

  return (
    <div className="px-5 py-6 text-ink lg:px-8 lg:py-8">
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle="Ready to serve your customers today?"
        actions={
          <>
            <button
              type="button"
              onClick={toggleOnline}
              aria-pressed={online}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-field bg-surface px-4 text-caption font-semibold text-ink transition hover:bg-raised',
                'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]',
                RING,
              )}
            >
              <span className={cn('size-2 rounded-full', online ? 'bg-success' : 'bg-ink-tertiary')} />
              You are {online ? 'Online' : 'Offline'}
              <ChevronDown className="size-4 text-ink-tertiary" aria-hidden="true" />
            </button>

            <Link
              to="/notifications"
              aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
              className={cn(
                'relative grid size-11 place-items-center rounded-field bg-surface text-ink transition hover:bg-raised',
                'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]',
                RING,
              )}
            >
              <Bell className="size-5" aria-hidden="true" />
              {unread > 0 && (
                <span className="sa-num absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>

            <Link
              to="/profile"
              className={cn(
                'flex min-h-11 items-center gap-2.5 rounded-field bg-surface py-1.5 pl-1.5 pr-3 transition hover:bg-raised',
                'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]',
                RING,
              )}
            >
              {/* rounded-field, not rounded-sm — the config only extends
                  card/field/sheet, so `sm` falls back to Tailwind's 2px. */}
              <span className="grid size-8 place-items-center rounded-field bg-brand-tint text-caption font-semibold text-brand">
                {firstName.charAt(0).toUpperCase()}
              </span>
              <span className="hidden text-caption font-semibold text-ink sm:block">{fullName || 'Partner'}</span>
              <ChevronDown className="hidden size-4 text-ink-tertiary sm:block" aria-hidden="true" />
            </Link>
          </>
        }
      />

      {/* Outstanding cash commission / freeze warning. Self-hiding when there
          is nothing to report. */}
      <OutstandingCommissionBanner />

      {/* Body grid */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">

        {/* Main column */}
        <div className="space-y-5">

          {/* Today's Overview */}
          <Panel title="Today's Overview" action={<PanelLink to="/partner/analytics">View all stats</PanelLink>}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {counts.map((s) => (
                <div key={s.label} className={cn('rounded-field p-4 text-center', RING)}>
                  <s.icon className="mx-auto size-6 text-brand" strokeWidth={1.75} aria-hidden="true" />
                  <p className="sa-num mt-2 text-h3 font-semibold text-ink">{s.value}</p>
                  <p className="mt-0.5 text-xs font-medium text-ink-secondary">{s.label}</p>
                </div>
              ))}
              <div className={cn('rounded-field p-4 text-center', RING)}>
                <Banknote className="mx-auto size-6 text-brand" strokeWidth={1.75} aria-hidden="true" />
                <p className="mt-2"><MoneyValue amount={todayEarn} decimals={false} size="lg" /></p>
                <p className="mt-0.5 text-xs font-medium text-ink-secondary">Earnings Today</p>
              </div>
            </div>
          </Panel>

          {/* New Booking Requests */}
          <Panel title="New Booking Requests" action={<PanelLink to="/partner/calendar">View all</PanelLink>}>
            {loading ? (
              <div className="h-24 animate-pulse rounded-field bg-raised" />
            ) : pendingJobs.length === 0 ? (
              <div className={cn('flex flex-col items-center rounded-field py-10 text-center', RING)}>
                <ClipboardList className="size-7 text-ink-tertiary" aria-hidden="true" />
                <p className="mt-2 text-caption font-semibold text-ink">No new requests</p>
                <p className="text-xs text-ink-secondary">New booking requests will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingJobs.slice(0, 3).map((job) => (
                  <JobCard
                    key={job.id}
                    job={{
                      id: job.id,
                      status: job.status,
                      service_name: job.service_type,
                      scheduled_at: `${moment(job.date).calendar(null, { sameDay: '[Today]', nextDay: '[Tomorrow]', nextWeek: 'ddd', sameElse: 'D MMM' })}${job.time_slot ? `, ${job.time_slot}` : ''}`,
                      address: job.city || 'Kuala Lumpur',
                      total_amount: job.price,
                      payout_amount: payoutOf(job),
                    }}
                    actions={
                      <>
                        {/* Accept/Decline are the primary actions on this card —
                            kept at the 44px default, not `sm` (36px). */}
                        <Button variant="outline" onClick={() => declineJob(job)}>Decline</Button>
                        <Button onClick={() => acceptJob(job)}>Accept</Button>
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </Panel>

          {/* Quick Actions */}
          <section>
            <h2 className="mb-3 text-md font-semibold text-ink">Quick Actions</h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {quickActions.map((a) => (
                <Link
                  key={a.label}
                  to={a.to}
                  className={cn(
                    'flex min-h-11 flex-col items-center gap-2 rounded-card bg-surface p-4 text-center transition hover:bg-raised',
                    'focus-visible:outline-none focus-visible:shadow-[shadow:var(--focus-ring)]',
                    RING,
                  )}
                >
                  <a.icon className="size-6 text-brand" strokeWidth={1.75} aria-hidden="true" />
                  <span className="text-[11px] font-semibold leading-tight text-ink-secondary">{a.label}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Tip banner */}
          <section className="flex items-center gap-4 rounded-card bg-brand-tint p-5">
            <Trophy className="size-9 shrink-0 text-brand" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold text-ink">Maintain 4.5+ rating</p>
              <p className="mt-0.5 text-caption text-ink-secondary">Maintain a high rating to get priority in search results and more bookings.</p>
            </div>
            <Button variant="outline" className="shrink-0">View Tips</Button>
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-5">

          {/* Turn on notifications */}
          <section className="rounded-card bg-brand-tint p-5">
            <div className="flex items-start gap-3">
              <span className={cn('grid size-12 shrink-0 place-items-center rounded-card bg-surface text-brand', RING)}>
                <Bell className="size-6" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold text-ink">Turn on notifications</p>
                <p className="mt-0.5 text-xs text-ink-secondary">Get real-time updates for new bookings and messages.</p>
              </div>
            </div>
            <Button block className="mt-4">Enable Notifications</Button>
          </section>

          {/* Earnings Summary */}
          <div className="space-y-3">
            <MetricStat
              variant="dark"
              label="This Week"
              amount={weekEarn}
              decimals={false}
              delta={weekDelta ?? undefined}
              icon={Banknote}
              caption="Net of the platform fee"
            />

            <Panel title="Earnings Summary" action={<PanelLink to="/partner/earnings">View details</PanelLink>}>
              {/* The weekly figure is the dark hero above; this is its 7-day shape. */}
              <div className="flex items-end justify-between gap-3">
                <p className="text-xs font-medium text-ink-secondary">Last 7 days</p>
                <Sparkline data={series} className="h-12 w-28" />
              </div>

              <div className="mt-4 pt-4 shadow-[inset_0_1px_0_rgb(var(--hairline))]">
                <p className="text-xs font-medium text-ink-secondary">This Month</p>
                <p className="mt-0.5"><MoneyValue amount={monthEarn} decimals={false} size="xl" /></p>
                {monthDelta != null && (
                  <p className={cn('sa-num mt-1 flex items-center gap-1 text-xs font-semibold', monthDelta >= 0 ? 'text-success' : 'text-danger')}>
                    <TrendingUp className="size-3.5" aria-hidden="true" />{monthDelta >= 0 ? '+' : ''}{monthDelta}% vs last month
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 pt-4 shadow-[inset_0_1px_0_rgb(var(--hairline))]">
                <div>
                  <p className="text-xs font-medium text-ink-secondary">Wallet Balance</p>
                  <p className="mt-0.5"><MoneyValue amount={walletBalance} size="lg" /></p>
                </div>
                <Link to="/partner/earnings" className="shrink-0">
                  <Button>Withdraw</Button>
                </Link>
              </div>
            </Panel>
          </div>

          {/* Recent Notifications */}
          <Panel title="Recent Notifications" action={<PanelLink to="/notifications">View all</PanelLink>}>
            {recentNotifs.length === 0 ? (
              <p className="py-6 text-center text-caption text-ink-secondary">No recent activity</p>
            ) : (
              <div className="space-y-4">
                {recentNotifs.map((n, i) => (
                  <div key={i} className="flex gap-3">
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', TONE[n.tone])}>
                      <n.icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-caption font-semibold leading-snug text-ink">
                        {n.title}
                        {n.amount != null && <> · <MoneyValue amount={n.amount} size="sm" /></>}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-secondary">{n.sub}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-ink-tertiary">{n.time}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
