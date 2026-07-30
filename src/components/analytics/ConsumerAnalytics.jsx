import { Download } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { buildConsumerAnalytics, exportToCSV } from '@/lib/analyticsEngine';

const COLORS = ['hsl(151,58%,20%)', '#6366f1', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899'];

const TT = ({ active, payload, label }) => active && payload?.length ? (
  <div className="bg-surface border border-border rounded-xl shadow-lg px-3 py-2 text-xs">
    <p className="font-bold mb-1">{label}</p>
    {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>)}
  </div>
) : null;

export default function ConsumerAnalytics({ bookings, users }) {
  const { ltv, cityData } = buildConsumerAnalytics(bookings, users);
  const topCities = cityData.slice(0, 8);

  const segments = [
    { label: 'High Value', desc: '5+ bookings', count: ltv.filter(c => c.bookings >= 5).length, color: 'bg-emerald-50 text-emerald-700' },
    { label: 'Regular', desc: '2–4 bookings', count: ltv.filter(c => c.bookings >= 2 && c.bookings < 5).length, color: 'bg-blue-50 text-blue-700' },
    { label: 'New / At-Risk', desc: '1 booking', count: ltv.filter(c => c.bookings === 1).length, color: 'bg-amber-50 text-amber-700' },
  ];

  return (
    <div className="space-y-5">
      {/* Segments */}
      <div className="grid grid-cols-3 gap-3">
        {segments.map((s, i) => (
          <div key={i} className="bg-surface rounded-2xl border border-border p-3 text-center">
            <p className={`text-lg font-bold ${s.color.split(' ')[1]}`}>{s.count}</p>
            <p className="text-[10px] font-semibold">{s.label}</p>
            <p className="text-[9px] text-muted-foreground">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Geographic distribution */}
      {topCities.length > 0 && (
        <div className="bg-surface rounded-2xl border border-border p-4">
          <h3 className="text-sm font-bold mb-1">Bookings by City</h3>
          <p className="text-xs text-muted-foreground mb-4">Geographic demand distribution</p>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={topCities} barCategoryGap="25%">
              <XAxis dataKey="city" tick={{ fontSize: 8, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <Tooltip content={<TT />} />
              <Bar dataKey="count" name="Bookings" radius={[4, 4, 0, 0]}>
                {topCities.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Consumers by LTV */}
      <div className="bg-surface rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold">Top Consumers by LTV</h3>
            <p className="text-xs text-muted-foreground">Lifetime value ranking</p>
          </div>
          <button onClick={() => exportToCSV(ltv.slice(0, 50), 'consumer_ltv')}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary border border-border rounded-lg px-2 py-1">
            <Download className="h-3 w-3" /> CSV
          </button>
        </div>
        <div className="space-y-2">
          {ltv.slice(0, 8).map((c, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-semibold truncate">{c.name || c.email}</p>
                  <p className="text-xs font-bold text-primary shrink-0 ml-2">RM{c.spent}</p>
                </div>
                <p className="text-[9px] text-muted-foreground">{c.bookings} bookings</p>
              </div>
            </div>
          ))}
          {ltv.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No consumer data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}