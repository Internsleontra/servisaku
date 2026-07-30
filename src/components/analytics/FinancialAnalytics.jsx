import { Download } from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend
} from 'recharts';
import { buildFinancialSummary, exportToCSV } from '@/lib/analyticsEngine';

const TT = ({ active, payload, label }) => active && payload?.length ? (
  <div className="bg-surface border border-border rounded-xl shadow-lg px-3 py-2 text-xs">
    <p className="font-bold mb-1">{label}</p>
    {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.name}: RM{p.value}</p>)}
  </div>
) : null;

export default function FinancialAnalytics({ bookings, refunds, period }) {
  const days = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }[period] || 30;
  const { weekly, refundTotal, refundCount } = buildFinancialSummary(bookings, refunds, days);

  const completed = bookings.filter(b => b.status === 'completed');
  const totalGMV = completed.reduce((s, b) => s + (b.price || 0), 0);
  const totalRevenue = completed.reduce((s, b) => s + (b.platform_fee || 0), 0);
  const totalPayout = completed.reduce((s, b) => s + (b.partner_payout || 0), 0);

  const summaryCards = [
    { label: 'Gross GMV', value: `RM${totalGMV.toLocaleString()}`, color: 'text-emerald-600' },
    { label: 'Platform Revenue', value: `RM${totalRevenue.toLocaleString()}`, color: 'text-blue-600' },
    { label: 'Partner Payouts', value: `RM${totalPayout.toLocaleString()}`, color: 'text-violet-600' },
    { label: 'Refunds Issued', value: `RM${refundTotal.toLocaleString()}`, color: 'text-red-500' },
  ];

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3">
        {summaryCards.map((c, i) => (
          <div key={i} className="bg-surface rounded-2xl border border-border p-3.5">
            <p className={`text-base font-bold ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Weekly Revenue Breakdown */}
      <div className="bg-surface rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold">Revenue Breakdown</h3>
            <p className="text-xs text-muted-foreground">GMV vs Revenue vs Payout</p>
          </div>
          <button onClick={() => exportToCSV(weekly, 'financial_weekly')}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary border border-border rounded-lg px-2 py-1">
            <Download className="h-3 w-3" /> CSV
          </button>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={weekly}>
            <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => `RM${v}`} width={45} />
            <Tooltip content={<TT />} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="gmv" name="GMV" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="revenue" name="Revenue" fill="hsl(151,58%,20%)" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="payout" name="Payout" stroke="#6366f1" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Refund Metrics */}
      <div className="bg-surface rounded-2xl border border-border p-4">
        <h3 className="text-sm font-bold mb-3">Refund Overview</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-50 rounded-xl p-3">
            <p className="text-lg font-bold text-red-600">RM{refundTotal.toLocaleString()}</p>
            <p className="text-xs text-red-500">Total Refunded</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3">
            <p className="text-lg font-bold text-amber-600">{refundCount}</p>
            <p className="text-xs text-amber-500">Refund Requests</p>
          </div>
          <div className="bg-muted rounded-xl p-3">
            <p className="text-lg font-bold">{totalGMV > 0 ? ((refundTotal / totalGMV) * 100).toFixed(1) : 0}%</p>
            <p className="text-xs text-muted-foreground">Refund Rate</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-3">
            <p className="text-lg font-bold text-emerald-600">
              {totalRevenue > 0 ? ((totalRevenue / totalGMV) * 100).toFixed(1) : 0}%
            </p>
            <p className="text-xs text-emerald-600">Platform Take Rate</p>
          </div>
        </div>
      </div>
    </div>
  );
}