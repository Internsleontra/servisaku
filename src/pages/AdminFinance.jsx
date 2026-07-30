import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { servisaku } from '@/api/servisakuClient';
import {
  ArrowLeft, AlertTriangle
} from 'lucide-react';
import { formatRM } from '@/lib/paymentEngine';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import moment from 'moment';

const TABS = ['overview', 'escrow', 'refunds', 'payouts'];

export default function AdminFinance() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [bookings, setBookings] = useState([]);
  const [escrows, setEscrows] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      servisaku.entities.Booking.list('-created_date', 200),
      servisaku.entities.EscrowLedger.list('-created_date', 100),
      servisaku.entities.RefundRequest.list('-created_date', 100),
      servisaku.entities.PayoutRecord.list('-created_date', 100),
    ]).then(([b, e, r, p]) => {
      setBookings(b); setEscrows(e); setRefunds(r); setPayouts(p);
      setLoading(false);
    });
  }, []);

  const completedBookings = bookings.filter(b => b.status === 'completed');
  const gmv = completedBookings.reduce((s, b) => s + (b.price || 0), 0);
  const platformRevenue = gmv * 0.2;
  const escrowHeld = escrows.filter(e => e.status === 'held').reduce((s, e) => s + (e.gross_amount || 0), 0);
  const escrowFrozen = escrows.filter(e => e.status === 'frozen').reduce((s, e) => s + (e.gross_amount || 0), 0);
  const pendingRefunds = refunds.filter(r => r.status === 'pending' || r.status === 'under_review');
  const pendingPayouts = payouts.filter(p => p.status === 'scheduled' || p.status === 'pending');
  const failedPayouts = payouts.filter(p => p.status === 'failed');

  // GMV by month
  const chartData = Array.from({ length: 6 }, (_, i) => {
    const m = moment().subtract(5 - i, 'months');
    const key = m.format('YYYY-MM');
    const monthGMV = bookings.filter(b => b.date?.startsWith(key) && b.status === 'completed').reduce((s, b) => s + (b.price || 0), 0);
    return { month: m.format('MMM'), gmv: monthGMV, revenue: monthGMV * 0.2 };
  });

  const handleRefundAction = async (refundId, action) => {
    const status = action === 'approve' ? 'approved' : 'rejected';
    await servisaku.entities.RefundRequest.update(refundId, {
      status,
      reviewed_by: 'admin',
      reviewed_at: new Date().toISOString(),
      ...(status === 'approved' ? { processed_at: new Date().toISOString() } : {}),
    });
    setRefunds(prev => prev.map(r => r.id === refundId ? { ...r, status } : r));
    toast.success(`Refund ${status}`);
  };

  const handleReleaseEscrow = async (escrowId, _bookingId) => {
    await servisaku.entities.EscrowLedger.update(escrowId, {
      status: 'released',
      released_at: new Date().toISOString(),
      released_by: 'admin',
    });
    setEscrows(prev => prev.map(e => e.id === escrowId ? { ...e, status: 'released' } : e));
    toast.success('Escrow released');
  };

  const handleProcessPayout = async (payoutId) => {
    await servisaku.entities.PayoutRecord.update(payoutId, {
      status: 'paid',
      paid_at: new Date().toISOString(),
      reference_no: `REF${Date.now()}`,
    });
    setPayouts(prev => prev.map(p => p.id === payoutId ? { ...p, status: 'paid' } : p));
    toast.success('Payout processed');
  };

  return (
    <div className="min-h-screen bg-background font-inter pb-8">
      <div className="bg-primary px-5 pt-14 pb-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => navigate('/admin')} className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <ArrowLeft className="h-4 w-4 text-white" />
            </button>
            <div>
              <p className="text-white/60 text-xs">Admin</p>
              <h1 className="text-xl font-bold text-white">Financial Dashboard</h1>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Total GMV', value: formatRM(gmv), icon: '💰' },
              { label: 'Platform Revenue', value: formatRM(platformRevenue), icon: '📈' },
              { label: 'Escrow Held', value: formatRM(escrowHeld), icon: '🔒' },
              { label: 'Frozen (Dispute)', value: formatRM(escrowFrozen), icon: '⚠️' },
            ].map((s, i) => (
              <div key={i} className="bg-white/10 rounded-2xl p-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{s.icon}</span>
                  <div>
                    <p className="text-white font-bold">{s.value}</p>
                    <p className="text-white/50 text-[10px]">{s.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 max-w-4xl mx-auto pt-5 space-y-5">

        {/* Alerts */}
        {(pendingRefunds.length > 0 || failedPayouts.length > 0) && (
          <div className="space-y-2">
            {pendingRefunds.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center gap-2 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {pendingRefunds.length} refund request{pendingRefunds.length > 1 ? 's' : ''} awaiting review
              </div>
            )}
            {failedPayouts.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-center gap-2 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {failedPayouts.length} failed payout{failedPayouts.length > 1 ? 's' : ''} — retry required
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold capitalize whitespace-nowrap transition-all ${tab === t ? 'bg-primary text-white' : 'bg-surface border border-border text-muted-foreground'}`}>
              {t === 'refunds' ? `Refunds (${pendingRefunds.length})` : t === 'payouts' ? `Payouts (${pendingPayouts.length})` : t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>
        ) : (
          <>
            {/* OVERVIEW */}
            {tab === 'overview' && (
              <div className="space-y-4">
                <div className="bg-surface rounded-3xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5">
                  <p className="text-sm font-bold mb-4">Monthly GMV vs Revenue</p>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={chartData} barCategoryGap="25%">
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v, name) => [formatRM(v), name === 'gmv' ? 'GMV' : 'Revenue']} contentStyle={{ borderRadius: 12, border: 'none', fontSize: 11 }} />
                      <Bar dataKey="gmv" radius={[4, 4, 0, 0]} fill="#d1fae5" />
                      <Bar dataKey="revenue" radius={[4, 4, 0, 0]} fill="hsl(151,58%,20%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Total Bookings', value: bookings.length },
                    { label: 'Completed', value: completedBookings.length },
                    { label: 'Escrow Entries', value: escrows.length },
                    { label: 'Payout Records', value: payouts.length },
                  ].map((s, i) => (
                    <div key={i} className="bg-surface rounded-2xl border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                      <p className="text-xl font-bold">{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ESCROW */}
            {tab === 'escrow' && (
              <div className="space-y-3">
                {escrows.length === 0 ? (
                  <div className="text-center py-12 bg-surface rounded-3xl border border-border"><p className="text-sm text-muted-foreground">No escrow entries yet</p></div>
                ) : escrows.map(e => (
                  <div key={e.id} className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm">{formatRM(e.gross_amount)}</p>
                        <p className="text-xs text-muted-foreground">Booking: {e.booking_id?.slice(-6).toUpperCase()}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
                        e.status === 'held' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                        e.status === 'released' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        e.status === 'frozen' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                        'bg-muted text-muted-foreground border-border'
                      }`}>{e.status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1 mb-2">
                      <span>Platform: {formatRM(e.platform_fee)}</span>
                      <span>Partner: {formatRM(e.partner_payout)}</span>
                      {e.release_at && <span>Release: {moment(e.release_at).format('D MMM HH:mm')}</span>}
                      {e.freeze_reason && <span>Frozen: {e.freeze_reason}</span>}
                    </div>
                    {e.status === 'held' && (
                      <button onClick={() => handleReleaseEscrow(e.id, e.booking_id)}
                        className="text-xs px-3 py-1.5 bg-primary text-white rounded-xl font-medium">
                        Manual Release
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* REFUNDS */}
            {tab === 'refunds' && (
              <div className="space-y-3">
                {refunds.length === 0 ? (
                  <div className="text-center py-12 bg-surface rounded-3xl border border-border"><p className="text-sm text-muted-foreground">No refund requests</p></div>
                ) : refunds.map(r => (
                  <div key={r.id} className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm">{formatRM(r.refund_amount)} refund</p>
                        <p className="text-xs text-muted-foreground">{r.consumer_email}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
                        r.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                        r.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        r.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-100' :
                        'bg-muted text-muted-foreground border-border'
                      }`}>{r.status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">Reason: {r.reason}</p>
                    <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1 mb-3">
                      <span>Original: {formatRM(r.original_amount)}</span>
                      <span>Type: {r.refund_type}</span>
                    </div>
                    {['pending', 'under_review'].includes(r.status) && (
                      <div className="flex gap-2">
                        <button onClick={() => handleRefundAction(r.id, 'approve')}
                          className="flex-1 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl font-semibold hover:bg-emerald-100 transition-colors">
                          Approve Refund
                        </button>
                        <button onClick={() => handleRefundAction(r.id, 'reject')}
                          className="flex-1 py-2 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl font-semibold hover:bg-red-100 transition-colors">
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* PAYOUTS */}
            {tab === 'payouts' && (
              <div className="space-y-3">
                {payouts.length === 0 ? (
                  <div className="text-center py-12 bg-surface rounded-3xl border border-border"><p className="text-sm text-muted-foreground">No payout records</p></div>
                ) : payouts.map(p => (
                  <div key={p.id} className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm">{p.partner_name || p.partner_email}</p>
                        <p className="text-xs text-muted-foreground">{formatRM(p.net_payout)} via {p.payout_method}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
                        p.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        p.status === 'scheduled' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                        p.status === 'failed' ? 'bg-red-50 text-red-600 border-red-100' :
                        'bg-amber-50 text-amber-700 border-amber-100'
                      }`}>{p.status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground grid grid-cols-3 gap-1 mb-2">
                      <span>Gross: {formatRM(p.gross_earning)}</span>
                      <span>Fee: -{formatRM(p.commission_amount)}</span>
                      <span>Net: {formatRM(p.net_payout)}</span>
                    </div>
                    {p.scheduled_date && <p className="text-xs text-muted-foreground mb-2">Scheduled: {moment(p.scheduled_date).format('D MMM YYYY')}</p>}
                    {['scheduled', 'pending', 'failed'].includes(p.status) && (
                      <button onClick={() => handleProcessPayout(p.id)}
                        className="text-xs px-3 py-1.5 bg-primary text-white rounded-xl font-medium">
                        {p.status === 'failed' ? 'Retry Payout' : 'Process Now'}
                      </button>
                    )}
                    {p.failure_reason && <p className="text-xs text-red-500 mt-1">{p.failure_reason}</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}