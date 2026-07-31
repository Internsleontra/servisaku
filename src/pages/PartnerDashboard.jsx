import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { servisaku } from '@/api/servisakuClient';
import {
  Clock, MapPin, Star, ClipboardList, Wrench, Wallet, Banknote, Bell,
  ChevronDown, LifeBuoy, Trophy, CheckCircle2, TrendingUp, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OutstandingCommissionBanner } from '@/components/partner/OutstandingCommissionBanner';
import { toast } from 'sonner';
import moment from 'moment';

// Keep the sen. The server splits to 2dp (server/lib/payments/commission.js);
// rounding to whole ringgit here would show a figure the wallet disagrees with.
const payoutOf = (j) => j.partner_payout ?? Math.round((j.price || 0) * 0.8 * 100) / 100;
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const ONGOING = ['accepted', 'en_route', 'arrived', 'started'];

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
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className}>
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity="0.28" />
          <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <path d={line} fill="none" stroke="hsl(var(--brand))" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const TONE = {
  brand: 'bg-brand-tint text-brand',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
};

export default function PartnerDashboard() {
  const [user, setUser] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(() => localStorage.getItem('partner_online') !== 'false');

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
  const todayJobs = jobs.filter(j => j.date === today && j.status !== 'pending');
  const ongoingJobs = jobs.filter(j => ONGOING.includes(j.status));
  const completedJobs = jobs.filter(j => j.status === 'completed');

  // ── Earnings ──
  const todayEarn = completedJobs.filter(j => j.date === today).reduce((s, j) => s + payoutOf(j), 0);
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
    return completedJobs.filter(j => j.date === d).reduce((s, j) => s + payoutOf(j), 0);
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

  const stats = [
    { icon: ClipboardList, value: todayJobs.length, label: 'Bookings Today' },
    { icon: Clock, value: ongoingJobs.length, label: 'Ongoing Jobs' },
    { icon: Banknote, value: `RM ${fmt(todayEarn)}`, label: 'Earnings Today' },
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
  if (completedJobs[0]) recentNotifs.push({ icon: CheckCircle2, tone: 'emerald', title: `Your payout of RM ${fmt(payoutOf(completedJobs[0]))} was successful`, sub: `Wallet · ${moment(completedJobs[0].date).format('D MMM YYYY')}`, time: '1h ago' });
  if (completedJobs[1]) recentNotifs.push({ icon: Star, tone: 'amber', title: 'Customer review received', sub: `${completedJobs[1].service_type} · ${moment(completedJobs[1].date).format('D MMM YYYY')}`, time: '2h ago' });

  if (!user) return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-raised border-t-brand" />
    </div>
  );

  return (
    <div className="font-inter min-h-screen bg-bg px-5 py-6 text-ink lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl">

        {/* Header */}
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink lg:text-[28px]">
              {greeting}, {firstName}! <span className="align-middle">👋</span>
            </h1>
            <p className="mt-0.5 text-sm text-ink-secondary">Ready to serve your customers today?</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleOnline}
              className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-surface px-4 py-2.5 text-sm font-semibold text-ink shadow-e1 transition-colors hover:bg-raised"
            >
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-ink-tertiary'}`} />
              You are {online ? 'Online' : 'Offline'}
              <ChevronDown className="h-4 w-4 text-ink-tertiary" />
            </button>

            <Link
              to="/notifications"
              aria-label="Notifications"
              className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-hairline bg-surface text-ink shadow-e1 transition-colors hover:bg-raised"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">3</span>
            </Link>

            <Link to="/profile" className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface py-1.5 pl-1.5 pr-3 shadow-e1 transition-colors hover:bg-raised">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-tint text-sm font-bold text-brand">
                {firstName.charAt(0).toUpperCase()}
              </span>
              <span className="hidden text-sm font-semibold text-ink sm:block">{fullName || 'Partner'}</span>
              <ChevronDown className="hidden h-4 w-4 text-ink-tertiary sm:block" />
            </Link>
          </div>
        </header>

        {/* Outstanding cash commission / freeze warning. Self-hiding when there
            is nothing to report. */}
        <div className="mt-6">
          <OutstandingCommissionBanner />
        </div>

        {/* Body grid */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">

          {/* Main column */}
          <div className="space-y-5">

            {/* Today's Overview */}
            <section className="rounded-2xl border border-hairline bg-surface p-5 shadow-e1">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-ink">Today's Overview</h2>
                <Link to="/partner/analytics" className="inline-flex items-center gap-1 text-sm font-bold text-brand hover:text-brand-ink">
                  View all stats <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {stats.map((s) => (
                  <div key={s.label} className="rounded-xl border border-hairline p-4 text-center">
                    <s.icon className="mx-auto h-6 w-6 text-brand" strokeWidth={1.75} />
                    <p className="mt-2 text-2xl font-extrabold tracking-tight text-ink">{s.value}</p>
                    <p className="mt-0.5 text-xs font-medium text-ink-secondary">{s.label}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* New Booking Requests */}
            <section className="rounded-2xl border border-hairline bg-surface p-5 shadow-e1">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-ink">New Booking Requests</h2>
                <Link to="/partner/calendar" className="inline-flex items-center gap-1 text-sm font-bold text-brand hover:text-brand-ink">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {loading ? (
                <div className="h-24 animate-pulse rounded-xl bg-raised" />
              ) : pendingJobs.length === 0 ? (
                <div className="flex flex-col items-center rounded-xl border border-dashed border-hairline py-10 text-center">
                  <ClipboardList className="h-7 w-7 text-ink-tertiary" />
                  <p className="mt-2 text-sm font-semibold text-ink">No new requests</p>
                  <p className="text-xs text-ink-secondary">New booking requests will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingJobs.slice(0, 3).map((job) => (
                    <div key={job.id} className="rounded-xl border border-hairline p-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                          <Wrench className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">New</span>
                            <p className="truncate font-bold text-ink">{job.service_type}</p>
                          </div>
                          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-secondary">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />{job.city || 'Kuala Lumpur'}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-secondary">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            {moment(job.date).calendar(null, { sameDay: '[Today]', nextDay: '[Tomorrow]', nextWeek: 'ddd', sameElse: 'D MMM' })}
                            {job.time_slot ? `, ${job.time_slot}` : ''}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-ink">
                            <Banknote className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" />RM {fmt(payoutOf(job))}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span className="text-xs font-semibold text-brand">2.3 km away</span>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => declineJob(job)}
                              className="h-9 rounded-xl border-hairline px-4 text-xs text-ink-secondary hover:border-danger/30 hover:bg-danger-tint hover:text-danger">
                              Decline
                            </Button>
                            <Button size="sm" onClick={() => acceptJob(job)}
                              className="h-9 rounded-xl bg-brand px-4 text-xs text-white hover:bg-brand/90">
                              Accept
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Quick Actions */}
            <section>
              <h2 className="mb-3 text-base font-bold text-ink">Quick Actions</h2>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {quickActions.map((a) => (
                  <Link key={a.label} to={a.to}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-hairline bg-surface p-4 text-center shadow-e1 transition-colors hover:border-brand/40 hover:bg-raised">
                    <a.icon className="h-6 w-6 text-brand" strokeWidth={1.75} />
                    <span className="text-[11px] font-semibold leading-tight text-ink-secondary">{a.label}</span>
                  </Link>
                ))}
              </div>
            </section>

            {/* Tip banner */}
            <section className="flex items-center gap-4 rounded-2xl border border-hairline bg-brand-tint p-5">
              <Trophy className="h-9 w-9 shrink-0 text-brand" />
              <div className="flex-1">
                <p className="font-bold text-ink">Maintain 4.5+ rating</p>
                <p className="mt-0.5 text-sm text-ink-secondary">Maintain a high rating to get priority in search results and more bookings.</p>
              </div>
              <Button variant="outline" className="shrink-0 rounded-xl border-brand/40 bg-surface text-brand hover:bg-brand hover:text-white">
                View Tips
              </Button>
            </section>
          </div>

          {/* Right rail */}
          <div className="space-y-5">

            {/* Turn on notifications */}
            <section className="rounded-2xl border border-hairline bg-brand-tint p-5 shadow-e1">
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-brand shadow-e1">
                  <Bell className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-bold text-ink">Turn on notifications</p>
                  <p className="mt-0.5 text-xs text-ink-secondary">Get real-time updates for new bookings and messages.</p>
                </div>
              </div>
              <Button className="mt-4 w-full rounded-xl bg-brand text-white hover:bg-brand-ink">Enable Notifications</Button>
            </section>

            {/* Earnings Summary */}
            <section className="rounded-2xl border border-hairline bg-surface p-5 shadow-e1">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-ink">Earnings Summary</h2>
                <Link to="/partner/earnings" className="inline-flex items-center gap-1 text-sm font-bold text-brand hover:text-brand-ink">
                  View details <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-ink-secondary">This Week</p>
                  <p className="mt-0.5 text-2xl font-extrabold tracking-tight text-ink">RM {fmt(weekEarn)}</p>
                  {weekDelta != null && (
                    <p className={`mt-1 flex items-center gap-1 text-xs font-bold ${weekDelta >= 0 ? 'text-emerald-600' : 'text-danger'}`}>
                      <TrendingUp className="h-3.5 w-3.5" />{weekDelta >= 0 ? '+' : ''}{weekDelta}% vs last week
                    </p>
                  )}
                </div>
                <Sparkline data={series} className="h-12 w-28" />
              </div>

              <div className="mt-4 border-t border-hairline pt-4">
                <p className="text-xs font-medium text-ink-secondary">This Month</p>
                <p className="mt-0.5 text-2xl font-extrabold tracking-tight text-ink">RM {fmt(monthEarn)}</p>
                {monthDelta != null && (
                  <p className={`mt-1 flex items-center gap-1 text-xs font-bold ${monthDelta >= 0 ? 'text-emerald-600' : 'text-danger'}`}>
                    <TrendingUp className="h-3.5 w-3.5" />{monthDelta >= 0 ? '+' : ''}{monthDelta}% vs last month
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-hairline pt-4">
                <div>
                  <p className="text-xs font-medium text-ink-secondary">Wallet Balance</p>
                  <p className="mt-0.5 text-xl font-bold text-ink">RM {fmt(walletBalance)}</p>
                </div>
                <Link to="/partner/earnings">
                  <Button className="rounded-xl bg-brand text-white hover:bg-brand-ink">Withdraw</Button>
                </Link>
              </div>
            </section>

            {/* Recent Notifications */}
            <section className="rounded-2xl border border-hairline bg-surface p-5 shadow-e1">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-ink">Recent Notifications</h2>
                <Link to="/notifications" className="inline-flex items-center gap-1 text-sm font-bold text-brand hover:text-brand-ink">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {recentNotifs.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-secondary">No recent activity</p>
              ) : (
                <div className="space-y-4">
                  {recentNotifs.map((n, i) => (
                    <div key={i} className="flex gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TONE[n.tone]}`}>
                        <n.icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-ink">{n.title}</p>
                        <p className="mt-0.5 text-xs text-ink-secondary">{n.sub}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-ink-tertiary">{n.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
