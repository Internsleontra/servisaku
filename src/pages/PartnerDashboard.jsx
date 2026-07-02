import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { servisaku } from '@/api/servisakuClient';
import {
  Clock, MapPin, ToggleLeft, ToggleRight, Star, Calendar, Wallet,
  GraduationCap, SlidersHorizontal, CheckCircle2, XCircle, Repeat, Gauge, ShieldCheck, ChevronRight,
  BarChart3, LifeBuoy, Package,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { MetricCard } from '@/components/partner/MetricCard';
import { QuickActions } from '@/components/partner/QuickActions';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import moment from 'moment';

const payoutOf = (j) => j.partner_payout ?? Math.round((j.price || 0) * 0.8);

export default function PartnerDashboard() {
  const [user, setUser]       = useState(null);
  const [jobs, setJobs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline]   = useState(() => localStorage.getItem('partner_online') !== 'false');
  const [tab, setTab]         = useState('today');
  const [verification, setVerification] = useState(null);

  useEffect(() => {
    const load = async () => {
      const me = await servisaku.auth.me();
      setUser(me);
      servisaku.documents.list().then(setVerification).catch(() => {});
      // Assigned jobs + the open pool (unassigned, pending) the partner can claim.
      const [myJobs, pool] = await Promise.all([
        servisaku.entities.Booking.filter({ partner_email: me.email }, '-created_date', 50),
        servisaku.entities.Booking.filter({ available: true }, '-created_date', 50),
      ]);
      const merged = [...pool, ...myJobs].filter((j, i, a) => a.findIndex(x => x.id === j.id) === i);
      setJobs(merged);
      setLoading(false);

      if (merged.some(j => j.status === 'pending')) {
        setTab('requests');
      }
    };
    load();
  }, []);

  const today         = moment().format('YYYY-MM-DD');
  const pendingJobs   = jobs.filter(j => j.status === 'pending');
  const todayJobs     = jobs.filter(j => j.date === today && j.status !== 'pending');
  const upcomingJobs  = jobs.filter(j => j.date > today && !['pending', 'cancelled', 'completed'].includes(j.status));
  const completedJobs = jobs.filter(j => j.status === 'completed');
  const cancelledJobs = jobs.filter(j => j.status === 'cancelled');

  // ── Earnings ──
  const todayEarn = completedJobs.filter(j => j.date === today).reduce((s, j) => s + payoutOf(j), 0);
  const weekEarn  = completedJobs.filter(j => moment(j.date).isAfter(moment().subtract(7, 'days'))).reduce((s, j) => s + payoutOf(j), 0);
  const monthEarn = completedJobs.filter(j => moment(j.date).isSame(moment(), 'month')).reduce((s, j) => s + payoutOf(j), 0);
  const walletBalance = completedJobs.reduce((s, j) => s + payoutOf(j), 0);
  const pendingPayout = jobs
    .filter(j => ['accepted', 'en_route', 'arrived', 'started'].includes(j.status))
    .reduce((s, j) => s + payoutOf(j), 0);

  // ── Performance (computed from available booking data) ──
  const finished = completedJobs.length + cancelledJobs.length;
  const completionRate   = finished ? Math.round((completedJobs.length / finished) * 100) : null;
  const cancellationRate = finished ? Math.round((cancelledJobs.length / finished) * 100) : null;
  const repeatCustomers = (() => {
    const counts = {};
    completedJobs.forEach(j => { const k = j.consumer_name || j.consumer_id; if (k) counts[k] = (counts[k] || 0) + 1; });
    return Object.values(counts).filter(c => c > 1).length;
  })();
  const rating = user?.partner_rating ? user.partner_rating.toFixed(1) : '—';

  const displayJobs = tab === 'requests' ? pendingJobs : tab === 'today' ? todayJobs : tab === 'upcoming' ? upcomingJobs : completedJobs.slice(0, 10);

  const toggleOnline = () => {
    const next = !online;
    setOnline(next);
    localStorage.setItem('partner_online', String(next));
    toast.success(next ? 'You are now online!' : 'You are now offline');
  };

  const updateStatus = async (id, status) => {
    await servisaku.entities.Booking.update(id, { status });
    setJobs(jobs.map(j => j.id === id ? { ...j, status } : j));
    toast.success(`Job ${status.replace('_', ' ')}`);
  };

  // Accept: claim from the pool if unassigned, otherwise advance the assigned job.
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

  // Decline: pool jobs just disappear from this partner's view; assigned jobs cancel.
  const declineJob = async (job) => {
    if (!job.partner_id) { setJobs(prev => prev.filter(j => j.id !== job.id)); return; }
    await updateStatus(job.id, 'cancelled');
  };

  const QUICK_ACTIONS = [
    { icon: Calendar, label: 'Schedule', to: '/partner/calendar' },
    { icon: Wallet, label: 'Wallet', to: '/partner/earnings' },
    { icon: SlidersHorizontal, label: 'Availability', to: '/partner/availability' },
    { icon: GraduationCap, label: 'Training', to: '/partner/training' },
  ];

  const PERF = [
    { icon: Star, tone: 'amber', label: 'Avg rating', value: rating },
    { icon: CheckCircle2, tone: 'emerald', label: 'Completion', value: completionRate != null ? `${completionRate}%` : '—' },
    { icon: XCircle, tone: 'rose', label: 'Cancellation', value: cancellationRate != null ? `${cancellationRate}%` : '—' },
    { icon: Repeat, tone: 'violet', label: 'Repeat clients', value: repeatCustomers },
  ];

  const TABS = [
    { id: 'requests',  label: 'Requests', count: pendingJobs.length },
    { id: 'today',     label: 'Today',    count: todayJobs.length    },
    { id: 'upcoming',  label: 'Upcoming', count: upcomingJobs.length },
    { id: 'completed', label: 'History',  count: null               },
  ];

  if (!user) return (
    <div className="flex justify-center items-center min-h-screen bg-bg">
      <div className="w-6 h-6 border-2 border-raised border-t-brand rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="font-inter min-h-screen bg-bg text-ink" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>

      {/* Header */}
      <div className="bg-gradient-to-br from-brand-ink via-brand to-brand/80 px-5 lg:px-8 pt-14 lg:pt-8 pb-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-white/50 text-xs font-medium tracking-wide">Partner Dashboard</p>
            <h1 className="text-2xl font-bold text-white tracking-tight mt-0.5">
              {user.full_name?.split(' ')[0]}
            </h1>
          </div>
          <button
            onClick={toggleOnline}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              online ? 'bg-surface text-brand shadow-e1' : 'bg-white/15 text-white/60'
            }`}>
            {online ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
            {online ? 'Online' : 'Offline'}
          </button>
        </div>

        {/* Earnings card */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5">
          <p className="text-white/50 text-xs font-medium mb-1.5">Today's Earnings</p>
          <p className="text-3xl font-bold text-white tracking-tight">RM {todayEarn.toFixed(0)}</p>
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/10">
            {[
              { label: 'This week', value: `RM ${weekEarn.toFixed(0)}` },
              { label: 'This month', value: `RM ${monthEarn.toFixed(0)}` },
              { label: 'Pending payout', value: `RM ${pendingPayout.toFixed(0)}` },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-white font-bold text-base">{s.value}</p>
                <p className="text-white/45 text-[10px] font-medium mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 lg:px-8 -mt-5 space-y-5">

        {/* Offline warning */}
        {!online && (
          <div className="bg-amber-50 border border-amber-200/60 rounded-2xl p-4 flex items-center gap-3">
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse shrink-0" />
            <p className="text-sm text-amber-700 font-medium">You're offline — no new jobs will be assigned</p>
          </div>
        )}

        {/* Verification status */}
        {verification && !verification.activated && (
          <Link to="/partner/verification" className="block">
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200/60 bg-amber-50 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-800">Get verified to start earning</p>
                <p className="text-[11px] text-amber-700">{verification.required_verified} of {verification.required_total} required documents verified · {verification.progress}%</p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-amber-200/60">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${verification.progress}%` }} />
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-amber-600" />
            </div>
          </Link>
        )}

        {/* Quick actions */}
        <div className="bg-surface rounded-2xl border border-hairline/10 shadow-e1 p-4">
          <QuickActions actions={QUICK_ACTIONS} />
        </div>

        {/* Wallet snapshot */}
        <div className="grid grid-cols-2 gap-3">
          <MetricCard icon={Wallet} tone="brand" label="Wallet balance" value={`RM ${walletBalance.toFixed(0)}`} sub="Lifetime completed" to="/partner/earnings" />
          <MetricCard icon={Gauge} tone="sky" label="Acceptance rate" value="—" sub="Needs backend metric" />
        </div>

        {/* Performance */}
        <div className="space-y-3">
          <SectionHeader title="Performance" sub="Based on your completed jobs"
            action={<Link to="/partner/analytics" className="text-xs font-bold text-brand hover:text-brand-ink">View analytics</Link>} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PERF.map((p) => (
              <MetricCard key={p.label} icon={p.icon} tone={p.tone} label={p.label} value={p.value} />
            ))}
          </div>
        </div>

        {/* More */}
        <div className="bg-surface rounded-2xl border border-hairline/10 shadow-e1 divide-y divide-hairline/10">
          {[
            { icon: Star, label: 'Reviews', to: '/partner/reviews' },
            { icon: BarChart3, label: 'Analytics', to: '/partner/analytics' },
            { icon: ShieldCheck, label: 'Verification', to: '/partner/verification' },
            { icon: Package, label: 'Inventory', to: '/partner/inventory' },
            { icon: LifeBuoy, label: 'Support', to: '/partner/support' },
          ].map((m) => (
            <Link key={m.label} to={m.to} className="flex items-center gap-3 px-4 py-3 hover:bg-raised/40 transition-colors first:rounded-t-2xl last:rounded-b-2xl">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-tint text-brand"><m.icon className="h-4 w-4" /></div>
              <span className="flex-1 text-sm font-semibold text-ink">{m.label}</span>
              <ChevronRight className="h-4 w-4 text-ink-tertiary" />
            </Link>
          ))}
        </div>

        {/* Jobs */}
        <div className="space-y-3">
          <SectionHeader
            title="Your jobs"
            action={<Link to="/partner/calendar" className="text-xs font-bold text-brand hover:text-brand-ink">View calendar</Link>}
          />

          {/* Tab bar */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center whitespace-nowrap gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  tab === t.id ? 'bg-brand text-white shadow-e1' : 'bg-surface border border-hairline/10 text-ink-secondary hover:text-ink'
                }`}>
                {t.label}
                {t.count !== null && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${tab === t.id ? 'bg-white/20 text-white' : 'bg-raised text-ink-secondary'}`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-surface rounded-2xl border border-hairline/10 p-5 animate-pulse space-y-3">
                  <div className="flex justify-between">
                    <div className="space-y-1.5">
                      <div className="h-4 w-28 bg-raised rounded-full" />
                      <div className="h-3 w-20 bg-raised rounded-full" />
                    </div>
                    <div className="h-6 w-16 bg-raised rounded-full" />
                  </div>
                  <div className="h-3 w-full bg-raised rounded-full" />
                  <div className="h-3 w-1/2 bg-raised rounded-full" />
                </div>
              ))}
            </div>
          ) : displayJobs.length === 0 ? (
            <div className="flex flex-col items-center text-center py-14 bg-surface rounded-2xl border border-hairline/10 shadow-e1">
              <div className="w-14 h-14 bg-raised rounded-2xl flex items-center justify-center mb-4">
                <Calendar className="h-6 w-6 text-ink-secondary" />
              </div>
              <p className="font-bold text-sm text-ink">No {tab} jobs</p>
              <p className="text-xs text-ink-secondary mt-1">
                {tab === 'today' ? 'No jobs scheduled today' : tab === 'requests' ? 'No incoming requests' : 'Check back later'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayJobs.map(job => (
                <Link
                  key={job.id}
                  to={`/partner/job/${job.id}`}
                  className="block bg-surface rounded-2xl border border-hairline/10 shadow-e1 p-5 hover:shadow-e2 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-sm text-ink">{job.service_type}</p>
                      <p className="text-xs text-ink-secondary mt-0.5">{job.consumer_name}</p>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-ink-secondary mb-4">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      {moment(job.date).format('D MMM')} · {job.time_slot}
                    </span>
                    <span className="flex items-center gap-1.5 truncate">
                      <MapPin className="h-3 w-3 shrink-0" />{job.city}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-hairline/10">
                    <span className="font-bold text-brand text-base">RM {payoutOf(job)}</span>

                    {job.status === 'pending' ? (
                      <div className="flex gap-2" onClick={(e) => e.preventDefault()}>
                        <Button size="sm" variant="outline" onClick={() => declineJob(job)}
                          className="rounded-xl text-xs h-9 px-4 border-hairline/10 text-ink-secondary hover:text-danger hover:border-danger/30 hover:bg-danger-tint">
                          Decline
                        </Button>
                        <Button size="sm" onClick={() => acceptJob(job)}
                          className="rounded-xl text-xs h-9 px-4 bg-brand text-white hover:bg-brand/90">
                          Accept
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2" onClick={(e) => e.preventDefault()}>
                        {job.status === 'accepted' && (
                          <Button size="sm" onClick={() => updateStatus(job.id, 'en_route')}
                            className="rounded-xl text-xs h-9 px-4 bg-brand text-white hover:bg-brand/90">Start Travel</Button>
                        )}
                        {job.status === 'en_route' && (
                          <Button size="sm" onClick={() => updateStatus(job.id, 'arrived')}
                            className="rounded-xl text-xs h-9 px-4 bg-brand text-white hover:bg-brand/90">Arrived</Button>
                        )}
                        {job.status === 'arrived' && (
                          <Button size="sm" onClick={() => updateStatus(job.id, 'started')}
                            className="rounded-xl text-xs h-9 px-4 bg-brand text-white hover:bg-brand/90">Start Job</Button>
                        )}
                        {job.status === 'started' && (
                          <Button size="sm" onClick={() => updateStatus(job.id, 'completed')}
                            className="rounded-xl text-xs h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white">Complete</Button>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
