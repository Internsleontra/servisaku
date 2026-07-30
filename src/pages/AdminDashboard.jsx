import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { servisaku } from '@/api/servisakuClient';
import {
  Users, DollarSign, TrendingUp, AlertTriangle, Clock,
  ArrowUpRight, BarChart3, Shield, ChevronRight, Activity,
  Award, Megaphone,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import moment from 'moment';

// Chart data will be dynamically generated

const QUICK_ACTIONS = [
  { icon: Users,    label: 'Users',         to: '/admin/users',          color: 'bg-violet-50 text-violet-600' },
  { icon: Shield,   label: 'Partners',      to: '/admin/users',          color: 'bg-emerald-50 text-emerald-600' },
  { icon: BarChart3,label: 'Bookings',      to: '/admin/bookings',       color: 'bg-sky-50 text-sky-600' },
  { icon: Activity, label: 'Operations',    to: '/admin/operations',     color: 'bg-primary/10 text-primary' },
  { icon: Award,    label: 'Quality',       to: '/admin/quality',        color: 'bg-amber-50 text-amber-600' },
  { icon: Megaphone,label: 'Campaigns',     to: '/admin/communications', color: 'bg-blue-50 text-blue-600' },
  { icon: BarChart3,label: 'Analytics',     to: '/admin/analytics',      color: 'bg-indigo-50 text-indigo-600' },
  { icon: DollarSign,label: 'Finance',      to: '/admin/finance',        color: 'bg-teal-50 text-teal-600' },
];

function KPICard({ label, value, sub, icon: Icon, color, trend }) {
  return (
    <div className="bg-surface rounded-2xl border border-border/60 shadow-sm p-5">
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-4`}>
        <Icon className="h-4.5 w-4.5" style={{ height: '1.125rem', width: '1.125rem' }} />
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-xs font-medium text-muted-foreground mt-1">{label}</p>
      <p className={`text-[10px] mt-1.5 font-semibold ${trend === 'up' ? 'text-emerald-600' : 'text-muted-foreground'}`}>{sub}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const [bookings, setBookings] = useState([]);
  const [users,    setUsers]    = useState([]);
  const [refunds,  setRefunds]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('bookings');

  useEffect(() => {
    Promise.all([
      servisaku.entities.Booking.list('-created_date', 100),
      servisaku.entities.User.list('-created_date', 100),
      servisaku.entities.RefundRequest.list('-created_date', 50),
    ]).then(([b, u, r]) => { setBookings(b); setUsers(u); setRefunds(r); setLoading(false); });
  }, []);

  const revenue          = bookings.filter(b => b.status === 'completed').reduce((s, b) => s + (b.price || 0), 0);
  const partners         = users.filter(u => u.role === 'partner');
  const pendingApprovals = partners.filter(u => !u.partner_verified);
  const pendingRefunds   = refunds.filter(r => r.status === 'pending' || r.status === 'under_review');
  const activeBookings   = bookings.filter(b =>
    ['pending','assigned','accepted','en_route','arrived','started'].includes(b.status)
  );

  // Dynamic Chart Data (Last 7 Days)
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = moment().subtract(6 - i, 'days');
    const dayBookings = bookings.filter(b => moment(b.date).isSame(d, 'day'));
    return { day: d.format('ddd'), bookings: dayBookings.length };
  });

  const kpis = [
    { label: 'Total Revenue',    value: `RM ${revenue.toLocaleString()}`, sub: '+12% this week',         icon: DollarSign,  color: 'bg-emerald-50 text-emerald-700', trend: 'up'     },
    { label: 'Active Bookings',  value: activeBookings.length,             sub: 'Live right now',          icon: Clock,       color: 'bg-sky-50 text-sky-700',         trend: 'up'     },
    { label: 'Partners',         value: partners.length,                   sub: `${pendingApprovals.length} pending`, icon: Users, color: 'bg-violet-50 text-violet-700', trend: 'neutral'},
    { label: 'Consumers',        value: users.filter(u => u.role === 'consumer').length, sub: 'Registered', icon: TrendingUp, color: 'bg-amber-50 text-amber-700',  trend: 'up'     },
  ];

  return (
    <div className="font-inter min-h-screen bg-background" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>

      {/* Header */}
      <div className="bg-[#0a3d28] px-5 lg:px-8 pt-14 lg:pt-8 pb-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-white/50 text-xs font-medium tracking-wide uppercase">ServisAku Admin</p>
          <h1 className="text-2xl font-bold text-white tracking-tight mt-1">Dashboard</h1>
          <p className="text-white/40 text-xs mt-1">{moment().format('dddd, D MMMM YYYY')}</p>
        </div>
      </div>

      <div className="px-5 lg:px-8 max-w-7xl mx-auto">

        {/* KPI grid — pulled up over header */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 -mt-5">
          {kpis.map((k, i) => <KPICard key={i} {...k} />)}
        </div>

        {/* Alert */}
        <div className="space-y-3 mt-5">
          {pendingApprovals.length > 0 && (
            <Link to="/admin/users"
              className="flex items-center gap-3 bg-amber-50 border border-amber-200/70 rounded-2xl p-4 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4.5 w-4.5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-900">{pendingApprovals.length} partners awaiting approval</p>
                <p className="text-xs text-amber-600 mt-0.5">Review documents and verify</p>
              </div>
              <ChevronRight className="h-4 w-4 text-amber-500 shrink-0" />
            </Link>
          )}

          {pendingRefunds.length > 0 && (
            <Link to="/admin/finance"
              className="flex items-center gap-3 bg-red-50 border border-red-200/70 rounded-2xl p-4 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <DollarSign className="h-4.5 w-4.5 text-red-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-red-900">{pendingRefunds.length} refunds requiring action</p>
                <p className="text-xs text-red-600 mt-0.5">Review disputes and process refunds</p>
              </div>
              <ChevronRight className="h-4 w-4 text-red-500 shrink-0" />
            </Link>
          )}
        </div>

        {/* Chart */}
        <div className="bg-surface rounded-2xl border border-border/60 shadow-sm p-5 mt-5 lg:mt-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold">Bookings This Week</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{chartData.reduce((s, d) => s + d.bookings, 0)} total bookings</p>
            </div>
            <div className="flex items-center gap-1 text-xs text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-full">
              <ArrowUpRight className="h-3 w-3" /> +18%
            </div>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={chartData} barCategoryGap="35%">
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 14, border: 'none', boxShadow: '0 8px 32px rgb(0 0 0/0.1)', fontSize: 12 }}
                cursor={{ fill: 'hsl(var(--muted))' }}
              />
              <Bar dataKey="bookings" radius={[6, 6, 3, 3]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={i === 6 ? 'hsl(var(--primary))' : 'hsl(var(--muted))'}  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Quick actions */}
        <div className="mt-6">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Quick Access</h3>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
            {QUICK_ACTIONS.map((item, i) => (
              <Link key={i} to={item.to}
                className="flex flex-col items-center gap-2.5 bg-surface rounded-2xl border border-border/60 py-4 px-2 shadow-xs
                           hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200 text-center">
                <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center`}>
                  <item.icon className="h-4.5 w-4.5" style={{ height: '1.125rem', width: '1.125rem' }} />
                </div>
                <span className="text-[9.5px] font-semibold leading-tight text-foreground/80">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-8">
          <div className="flex gap-2 mb-5">
            {['bookings', 'partners'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  tab === t ? 'bg-primary text-white shadow-sm' : 'bg-surface border border-border/60 text-muted-foreground hover:text-foreground'
                }`}>
                {t === 'bookings' ? `Bookings (${bookings.length})` : `Partners (${partners.length})`}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-[2.5px] border-muted border-t-primary rounded-full animate-spin" />
            </div>
          ) : tab === 'bookings' ? (
            <div className="bg-surface rounded-2xl border border-border/60 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground">Service</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground">Consumer</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground">Date</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground">Status</th>
                      <th className="text-right px-5 py-3.5 font-semibold text-muted-foreground">RM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.slice(0, 15).map(b => (
                      <tr key={b.id} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3.5 font-medium">{b.service_type}</td>
                        <td className="px-5 py-3.5 text-muted-foreground">{b.consumer_name || '—'}</td>
                        <td className="px-5 py-3.5 text-muted-foreground">{moment(b.date).format('D MMM')}</td>
                        <td className="px-5 py-3.5"><StatusBadge status={b.status} /></td>
                        <td className="px-5 py-3.5 text-right font-bold text-primary">{b.price || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {partners.slice(0, 10).map(p => (
                <div key={p.id} className="flex items-center gap-3.5 bg-surface rounded-2xl border border-border/60 p-4 shadow-xs
                                           hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                  <div className="w-11 h-11 rounded-xl bg-primary/8 flex items-center justify-center shrink-0"
                    style={{ background: 'hsl(var(--primary)/0.08)' }}>
                    <span className="text-base font-bold text-primary">{p.full_name?.charAt(0) || '?'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{p.full_name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{p.email}</p>
                  </div>
                  {p.partner_verified
                    ? <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2.5 py-1 rounded-full font-bold shrink-0">Verified</span>
                    : <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200/60 px-2.5 py-1 rounded-full font-bold shrink-0">Pending</span>
                  }
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}