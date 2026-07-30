import { Star, Download } from 'lucide-react';
import { buildPartnerPerformance, exportToCSV } from '@/lib/analyticsEngine';

export default function PartnerAnalytics({ bookings, users, reviews }) {
  const partners = buildPartnerPerformance(bookings, users, reviews);

  const ratingDist = [1, 2, 3, 4, 5].map(star => ({
    star: `${star}★`,
    count: reviews.filter(r => Math.floor(r.rating) === star).length,
  }));

  const topPartners = partners.slice(0, 10);
  const atRisk = partners.filter(p => (p.avgRating !== null && p.avgRating < 3.5) || p.completionRate < 70);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Partners', value: partners.length },
          { label: 'Avg Completion', value: `${partners.length > 0 ? Math.round(partners.reduce((s, p) => s + p.completionRate, 0) / partners.length) : 0}%` },
          { label: 'At Risk', value: atRisk.length, color: atRisk.length > 0 ? 'text-red-500' : 'text-foreground' },
        ].map((c, i) => (
          <div key={i} className="bg-surface rounded-2xl border border-border p-3 text-center">
            <p className={`text-lg font-bold ${c.color || ''}`}>{c.value}</p>
            <p className="text-[9px] text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Top Partners Leaderboard */}
      <div className="bg-surface rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">Partner Leaderboard</h3>
          <button onClick={() => exportToCSV(topPartners, 'partner_performance')}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary border border-border rounded-lg px-2 py-1">
            <Download className="h-3 w-3" /> CSV
          </button>
        </div>
        <div className="space-y-2">
          {topPartners.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${i < 3 ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold truncate">{p.name || p.email}</p>
                  <p className="text-xs font-bold text-primary shrink-0 ml-2">RM{p.earnings}</p>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${p.completionRate}%` }} />
                  </div>
                  <span className="text-[9px] text-muted-foreground shrink-0">{p.completionRate}%</span>
                  {p.avgRating && (
                    <span className="flex items-center gap-0.5 text-[9px] text-amber-600 shrink-0">
                      <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />{p.avgRating}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {partners.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No partner data available yet</p>
          )}
        </div>
      </div>

      {/* Rating Distribution */}
      <div className="bg-surface rounded-2xl border border-border p-4">
        <h3 className="text-sm font-bold mb-3">Rating Distribution</h3>
        <div className="space-y-2">
          {ratingDist.reverse().map(r => (
            <div key={r.star} className="flex items-center gap-2">
              <span className="text-xs font-semibold w-6 shrink-0 text-amber-600">{r.star}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full transition-all" style={{
                  width: `${reviews.length > 0 ? (r.count / reviews.length) * 100 : 0}%`
                }} />
              </div>
              <span className="text-[10px] text-muted-foreground w-6 text-right shrink-0">{r.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* At-Risk Partners */}
      {atRisk.length > 0 && (
        <div className="bg-red-50 rounded-2xl border border-red-100 p-4">
          <h3 className="text-sm font-bold text-red-700 mb-2">⚠️ At-Risk Partners ({atRisk.length})</h3>
          <div className="space-y-1.5">
            {atRisk.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between bg-surface rounded-xl px-3 py-2">
                <p className="text-xs font-semibold truncate">{p.name || p.email}</p>
                <div className="flex gap-2 text-[10px] shrink-0 ml-2">
                  {p.avgRating !== null && p.avgRating < 3.5 && <span className="text-red-500 font-semibold">{p.avgRating}★</span>}
                  {p.completionRate < 70 && <span className="text-orange-500 font-semibold">{p.completionRate}% rate</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}