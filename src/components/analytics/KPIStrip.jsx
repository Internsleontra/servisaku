import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

function GrowthBadge({ value }) {
  if (value === undefined || value === null) return null;
  const positive = value > 0;
  const neutral = value === 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
      neutral ? 'bg-muted text-muted-foreground' :
      positive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
    }`}>
      {neutral ? <Minus className="h-2.5 w-2.5" /> : positive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {Math.abs(value)}%
    </span>
  );
}

export default function KPIStrip({ kpis, loading }) {
  if (loading) return (
    <div className="grid grid-cols-2 gap-3">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="bg-surface rounded-2xl border border-border p-4 animate-pulse">
          <div className="h-3 bg-muted rounded w-2/3 mb-2" />
          <div className="h-6 bg-muted rounded w-1/2 mb-1" />
          <div className="h-3 bg-muted rounded w-1/3" />
        </div>
      ))}
    </div>
  );

  const cards = [
    { label: 'GMV', value: `RM${(kpis.gmv || 0).toLocaleString()}`, growth: kpis.gmvGrowth, color: 'bg-emerald-50 text-emerald-700' },
    { label: 'Platform Revenue', value: `RM${(kpis.revenue || 0).toLocaleString()}`, growth: kpis.revenueGrowth, color: 'bg-blue-50 text-blue-700' },
    { label: 'Total Bookings', value: kpis.totalBookings || 0, sub: `${kpis.completedBookings || 0} completed`, color: 'bg-violet-50 text-violet-700' },
    { label: 'Avg Booking Value', value: `RM${kpis.avgBookingValue || 0}`, color: 'bg-amber-50 text-amber-700' },
    { label: 'Active Consumers', value: kpis.activeConsumers || 0, color: 'bg-pink-50 text-pink-700' },
    { label: 'Active Partners', value: kpis.activePartners || 0, sub: `of ${kpis.totalPartners || 0} total`, color: 'bg-indigo-50 text-indigo-700' },
    { label: 'Completion Rate', value: `${kpis.completionRate || 0}%`, color: kpis.completionRate >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600' },
    { label: 'Repeat Rate', value: `${kpis.repeatRate || 0}%`, color: 'bg-teal-50 text-teal-700' },
    { label: 'Cancellation Rate', value: `${kpis.cancellationRate || 0}%`, color: kpis.cancellationRate > 15 ? 'bg-red-50 text-red-600' : 'bg-raised text-ink-secondary' },
    { label: 'Avg Rating', value: kpis.avgRating ? `${kpis.avgRating}★` : 'N/A', color: 'bg-amber-50 text-amber-700' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c, i) => (
        <div key={i} className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-3.5">
          <div className={`inline-flex items-center justify-center w-8 h-8 rounded-xl ${c.color} mb-2`}>
            <span className="text-base">{['💰','🏦','📋','🎯','👥','🔧','✅','🔁','❌','⭐'][i]}</span>
          </div>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <p className="font-bold text-base leading-tight">{c.value}</p>
            {c.growth !== undefined && <GrowthBadge value={c.growth} />}
          </div>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{c.label}</p>
          {c.sub && <p className="text-[9px] text-muted-foreground mt-0.5">{c.sub}</p>}
        </div>
      ))}
    </div>
  );
}