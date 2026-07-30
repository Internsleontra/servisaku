import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Download, BarChart3, DollarSign, Users, UserCheck } from 'lucide-react';
import { loadAnalyticsData, computeKPIs, filterByRange, exportToCSV } from '@/lib/analyticsEngine';
import KPIStrip from '@/components/analytics/KPIStrip';
import BookingAnalytics from '@/components/analytics/BookingAnalytics';
import FinancialAnalytics from '@/components/analytics/FinancialAnalytics';
import PartnerAnalytics from '@/components/analytics/PartnerAnalytics';
import ConsumerAnalytics from '@/components/analytics/ConsumerAnalytics';
import { toast } from 'sonner';

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'bookings', label: 'Bookings', icon: BarChart3 },
  { id: 'financial', label: 'Financial', icon: DollarSign },
  { id: 'partners', label: 'Partners', icon: UserCheck },
  { id: 'consumers', label: 'Consumers', icon: Users },
];

const PERIODS = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: '365d', label: '1Y' },
];

export default function AdminAnalytics() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    const raw = await loadAnalyticsData();
    setData(raw);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const days = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }[period] || 30;
  const filteredBookings = data ? filterByRange(data.bookings, days) : [];
  const kpis = data ? computeKPIs(data, period) : {};

  const handleExportAll = () => {
    if (!data) return;
    exportToCSV(filteredBookings.map(b => ({
      id: b.id, service: b.service_type, date: b.date, status: b.status,
      price: b.price, consumer: b.consumer_email, partner: b.partner_email,
    })), `servisaku_bookings_${period}`);
    toast.success('Bookings exported to CSV');
  };

  return (
    <div className="min-h-screen bg-background font-inter" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <div className="bg-primary px-5 pt-14 pb-5">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => navigate('/admin')} className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <ArrowLeft className="h-4 w-4 text-white" />
            </button>
            <div className="flex-1">
              <p className="text-white/60 text-xs">Admin</p>
              <h1 className="text-xl font-bold text-white">Analytics &amp; Reports</h1>
            </div>
            <div className="flex gap-1.5">
              <button onClick={handleExportAll}
                className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center" title="Export">
                <Download className="h-4 w-4 text-white" />
              </button>
              <button onClick={() => load(true)} disabled={refreshing}
                className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <RefreshCw className={`h-4 w-4 text-white ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Period selector */}
          <div className="flex gap-1.5">
            {PERIODS.map(p => (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${period === p.id ? 'bg-surface text-primary' : 'bg-white/20 text-white'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-5">
        <div className="max-w-4xl mx-auto flex gap-0.5 overflow-x-auto py-2">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${tab === t.id ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
              <t.icon className="h-3 w-3" />{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 max-w-4xl mx-auto pt-4 space-y-4">

        {tab === 'overview' && (
          <>
            <KPIStrip kpis={kpis} loading={loading} />
            {!loading && data && (
              <>
                <div className="bg-surface rounded-2xl border border-border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold">Quick Summary</h3>
                    <span className="text-[10px] text-muted-foreground">{period} view</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Avg Daily Bookings', value: Math.round(filteredBookings.length / days) },
                      { label: 'Total Completed', value: filteredBookings.filter(b => b.status === 'completed').length },
                      { label: 'Revenue / Booking', value: `RM${kpis.avgBookingValue || 0}` },
                      { label: 'Disputed', value: filteredBookings.filter(b => b.status === 'disputed').length },
                    ].map((s, i) => (
                      <div key={i} className="bg-muted/40 rounded-xl px-3 py-2.5">
                        <p className="text-sm font-bold">{s.value}</p>
                        <p className="text-[10px] text-muted-foreground">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {(kpis.cancellationRate > 20 || kpis.completionRate < 70) && (
                  <div className="bg-red-50 border border-red-100 rounded-2xl p-4 space-y-1.5">
                    <p className="text-sm font-bold text-red-700">Alert Thresholds Breached</p>
                    {kpis.cancellationRate > 20 && <p className="text-xs text-red-600">Cancellation rate {kpis.cancellationRate}% exceeds 20% threshold</p>}
                    {kpis.completionRate < 70 && <p className="text-xs text-red-600">Completion rate {kpis.completionRate}% is below 70% target</p>}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === 'bookings' && !loading && data && (
          <BookingAnalytics bookings={filteredBookings} period={period} />
        )}

        {tab === 'financial' && !loading && data && (
          <FinancialAnalytics bookings={filteredBookings} refunds={data.refunds} period={period} />
        )}

        {tab === 'partners' && !loading && data && (
          <PartnerAnalytics bookings={filteredBookings} users={data.users} reviews={data.reviews} />
        )}

        {tab === 'consumers' && !loading && data && (
          <ConsumerAnalytics bookings={filteredBookings} users={data.users} />
        )}

        {loading && tab !== 'overview' && (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}