import { Download } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell
} from 'recharts';
import { buildBookingTrend, buildCategoryPerformance, buildPeakHours, exportToCSV } from '@/lib/analyticsEngine';

const COLORS = ['hsl(151,58%,20%)', '#6366f1', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6'];

const TT = ({ active, payload, label }) => active && payload?.length ? (
  <div className="bg-surface border border-border rounded-xl shadow-lg px-3 py-2 text-xs">
    <p className="font-bold mb-1">{label}</p>
    {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>)}
  </div>
) : null;

export default function BookingAnalytics({ bookings, period }) {
  const days = { '7d': 7, '30d': 30, '90d': 90, '365d': 30 }[period] || 30;
  const trend = buildBookingTrend(bookings, Math.min(days, 30));
  const categories = buildCategoryPerformance(bookings);
  const peakHours = buildPeakHours(bookings);

  const cancellationReasons = bookings
    .filter(b => b.status === 'cancelled' && b.cancellation_reason)
    .reduce((acc, b) => {
      acc[b.cancellation_reason] = (acc[b.cancellation_reason] || 0) + 1;
      return acc;
    }, {});
  const cancelData = Object.entries(cancellationReasons)
    .map(([reason, count]) => ({ reason: reason.slice(0, 18), count }))
    .sort((a, b) => b.count - a.count).slice(0, 6);

  return (
    <div className="space-y-5">
      {/* Booking Trend */}
      <div className="bg-surface rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold">Booking Trend</h3>
            <p className="text-xs text-muted-foreground">Daily bookings &amp; completions</p>
          </div>
          <button onClick={() => exportToCSV(trend, 'booking_trend')}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary border border-border rounded-lg px-2 py-1">
            <Download className="h-3 w-3" /> CSV
          </button>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={trend}>
            <defs>
              <linearGradient id="bGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(151,58%,20%)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="hsl(151,58%,20%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} interval={Math.floor(trend.length / 6)} />
            <Tooltip content={<TT />} />
            <Area type="monotone" dataKey="bookings" stroke="hsl(151,58%,20%)" strokeWidth={2} fill="url(#bGrad)" name="Bookings" />
            <Area type="monotone" dataKey="completed" stroke="#6366f1" strokeWidth={1.5} fill="none" name="Completed" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Service Category */}
      <div className="bg-surface rounded-2xl border border-border p-4">
        <h3 className="text-sm font-bold mb-1">Category Performance</h3>
        <p className="text-xs text-muted-foreground mb-4">Revenue by service type</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={categories} layout="vertical" barCategoryGap="30%">
            <XAxis type="number" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => `RM${v}`} />
            <YAxis type="category" dataKey="service" tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} width={80} />
            <Tooltip content={<TT />} />
            <Bar dataKey="revenue" name="Revenue (RM)" radius={[0, 6, 6, 0]}>
              {categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Peak Hours + Cancellations */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="bg-surface rounded-2xl border border-border p-4">
          <h3 className="text-sm font-bold mb-1">Peak Booking Hours</h3>
          <p className="text-xs text-muted-foreground mb-4">Most popular time slots</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={peakHours} barCategoryGap="25%">
              <XAxis dataKey="slot" tick={{ fontSize: 8, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <Tooltip content={<TT />} />
              <Bar dataKey="count" name="Bookings" radius={[4, 4, 0, 0]}>
                {peakHours.map((entry, i) => (
                  <Cell key={i} fill={entry.count === Math.max(...peakHours.map(p => p.count)) ? 'hsl(151,58%,20%)' : '#e5e7eb'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {cancelData.length > 0 && (
          <div className="bg-surface rounded-2xl border border-border p-4">
            <h3 className="text-sm font-bold mb-1">Cancellation Reasons</h3>
            <p className="text-xs text-muted-foreground mb-4">Top reasons for cancellations</p>
            <div className="space-y-2">
              {cancelData.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="truncate text-muted-foreground">{c.reason}</span>
                      <span className="font-semibold shrink-0 ml-2">{c.count}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${(c.count / cancelData[0].count) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}