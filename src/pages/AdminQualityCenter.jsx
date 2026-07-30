import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, AlertTriangle, Star, Shield, CheckCircle2, XCircle,
  Eye, MessageSquare, Ban, RefreshCw, TrendingDown
} from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import {
  calcWeightedRating, getBadge, analyzeTagFrequency,
  detectSuspiciousReviews, getRatingDistribution
} from '@/lib/qualityEngine';
import { QualityBadge, TopRatedBadge } from '@/components/TrustBadges';
import { toast } from 'sonner';
import moment from 'moment';

const SEVERITY_STYLE = {
  low:      'bg-blue-50 text-blue-700 border-blue-100',
  medium:   'bg-amber-50 text-amber-700 border-amber-100',
  high:     'bg-orange-50 text-orange-700 border-orange-100',
  critical: 'bg-red-50 text-red-700 border-red-100',
};

const STATUS_STYLE = {
  open:           'bg-red-50 text-red-600 border-red-100',
  under_review:   'bg-amber-50 text-amber-600 border-amber-100',
  warning_sent:   'bg-orange-50 text-orange-600 border-orange-100',
  retraining:     'bg-violet-50 text-violet-600 border-violet-100',
  suspended:      'bg-red-100 text-red-800 border-red-200',
  resolved:       'bg-emerald-50 text-emerald-600 border-emerald-100',
  dismissed:      'bg-muted text-muted-foreground border-border',
};

export default function AdminQualityCenter() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('tickets');
  const [tickets, setTickets] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [adminNote, setAdminNote] = useState('');
  const [_actionStatus, _setActionStatus] = useState('');

  useEffect(() => {
    Promise.all([
      servisaku.entities.QualityTicket.list('-created_date', 100),
      servisaku.entities.Review.list('-created_date', 200),
      servisaku.entities.User.filter({ role: 'partner' }),
    ]).then(([t, r, p]) => { setTickets(t); setReviews(r); setPartners(p); setLoading(false); });
  }, []);

  const openTickets = tickets.filter(t => ['open', 'under_review'].includes(t.status));
  const pendingModeration = reviews.filter(r => r.moderation_status === 'pending');
  const suspiciousFlags = reviews.length ? detectSuspiciousReviews(reviews) : [];

  // Partner performance scores
  const partnerScores = partners.map(p => {
    const pReviews = reviews.filter(r => r.partner_email === p.email);
    const avg = calcWeightedRating(pReviews);
    const badge = getBadge(avg);
    const topTags = analyzeTagFrequency(pReviews).slice(0, 3);
    const dist = getRatingDistribution(pReviews);
    const lowCount = (dist[1] || 0) + (dist[2] || 0);
    return { ...p, avg, badge, totalReviews: pReviews.length, topTags, lowRatingCount: lowCount };
  }).sort((a, b) => b.avg - a.avg);

  const atRiskPartners = partnerScores.filter(p => p.avg > 0 && p.avg < 3.5);

  const handleTicketAction = async (ticket, status, action) => {
    await servisaku.entities.QualityTicket.update(ticket.id, {
      status,
      action_taken: action,
      admin_notes: adminNote || ticket.admin_notes,
      resolved_by: 'admin',
      resolved_at: status === 'resolved' || status === 'dismissed' ? new Date().toISOString() : undefined,
    });
    if (status === 'warning_sent') {
      await servisaku.entities.Notification.create({
        user_email: ticket.partner_email,
        title: '⚠️ Quality Warning',
        body: `You have received a quality warning from FixMate. Please review our standards.`,
        type: 'system', channel: 'in_app',
      });
    }
    if (status === 'suspended') {
      await servisaku.entities.Notification.create({
        user_email: ticket.partner_email,
        title: '🚫 Account Temporarily Suspended',
        body: 'Your account has been temporarily suspended pending quality review. Contact support.',
        type: 'system', channel: 'in_app',
      });
    }
    setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, status } : t));
    setSelectedTicket(null);
    setAdminNote('');
    toast.success(`Ticket updated: ${status.replace('_', ' ')}`);
  };

  const handleModerate = async (review, action) => {
    await servisaku.entities.Review.update(review.id, {
      moderation_status: action,
      is_visible: action === 'approved',
    });
    setReviews(prev => prev.map(r => r.id === review.id ? { ...r, moderation_status: action, is_visible: action === 'approved' } : r));
    toast.success(`Review ${action}`);
  };

  return (
    <div className="min-h-screen bg-background font-inter pb-8">
      {/* Header */}
      <div className="bg-primary px-5 pt-14 pb-5">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => navigate('/admin')} className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <ArrowLeft className="h-4 w-4 text-white" />
            </button>
            <div className="flex-1">
              <p className="text-white/60 text-xs">Admin</p>
              <h1 className="text-xl font-bold text-white">Quality Center</h1>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Open Tickets', value: openTickets.length, alert: openTickets.length > 0 },
              { label: 'Mod Queue', value: pendingModeration.length, alert: pendingModeration.length > 0 },
              { label: 'At-Risk Partners', value: atRiskPartners.length, alert: atRiskPartners.length > 0 },
              { label: 'Fraud Flags', value: suspiciousFlags.length, alert: suspiciousFlags.length > 0 },
            ].map((k, i) => (
              <div key={i} className={`rounded-2xl p-2.5 text-center ${k.alert ? 'bg-red-400/30' : 'bg-white/10'}`}>
                <p className="text-white font-bold text-xl">{k.value}</p>
                <p className="text-white/50 text-[9px] leading-tight">{k.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 max-w-4xl mx-auto pt-4 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'tickets', label: `Tickets (${openTickets.length})` },
            { id: 'moderation', label: `Moderation (${pendingModeration.length})` },
            { id: 'partners', label: 'Performance' },
            { id: 'fraud', label: `Fraud (${suspiciousFlags.length})` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${tab === t.id ? 'bg-primary text-white' : 'bg-surface border border-border text-muted-foreground'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" /></div>
        ) : (
          <>
            {/* ── TICKETS ───────────────────────────────────────────────── */}
            {tab === 'tickets' && (
              <div className="space-y-3">
                {tickets.length === 0 ? (
                  <div className="text-center py-12 bg-surface rounded-3xl border border-border">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm font-semibold">No quality tickets</p>
                  </div>
                ) : tickets.map(ticket => (
                  <div key={ticket.id} className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[ticket.severity]}`}>
                            {ticket.severity.toUpperCase()}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[ticket.status]}`}>
                            {ticket.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-sm font-bold">{ticket.partner_name}</p>
                        <p className="text-xs text-muted-foreground">{ticket.trigger_type.replace('_', ' ')} • {moment(ticket.created_date).fromNow()}</p>
                      </div>
                      <button onClick={() => setSelectedTicket(selectedTicket?.id === ticket.id ? null : ticket)}
                        className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">{ticket.description}</p>

                    {selectedTicket?.id === ticket.id && (
                      <div className="mt-3 pt-3 border-t border-border space-y-3">
                        <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)}
                          placeholder="Admin notes (optional)..."
                          rows={2} className="w-full bg-muted rounded-xl px-3 py-2 text-xs outline-none resize-none" />
                        <div className="flex flex-wrap gap-2">
                          {[
                            { label: 'Send Warning', status: 'warning_sent', icon: MessageSquare, style: 'bg-amber-100 text-amber-700' },
                            { label: 'Retraining', status: 'retraining', icon: RefreshCw, style: 'bg-violet-100 text-violet-700' },
                            { label: 'Suspend', status: 'suspended', icon: Ban, style: 'bg-red-100 text-red-700' },
                            { label: 'Resolve', status: 'resolved', icon: CheckCircle2, style: 'bg-emerald-100 text-emerald-700' },
                            { label: 'Dismiss', status: 'dismissed', icon: XCircle, style: 'bg-muted text-muted-foreground' },
                          ].map(a => (
                            <button key={a.status} onClick={() => handleTicketAction(ticket, a.status, a.label)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${a.style}`}>
                              <a.icon className="h-3 w-3" /> {a.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── MODERATION ────────────────────────────────────────────── */}
            {tab === 'moderation' && (
              <div className="space-y-3">
                {pendingModeration.length === 0 ? (
                  <div className="text-center py-12 bg-surface rounded-3xl border border-border">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm font-semibold">Moderation queue is clear</p>
                  </div>
                ) : pendingModeration.map(r => (
                  <div key={r.id} className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          {[1,2,3,4,5].map(i => (
                            <Star key={i} className={`h-3 w-3 ${i <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-border'}`} />
                          ))}
                          <span className="text-xs font-bold ml-1 text-red-600">{r.rating}★ — Low rating</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{r.consumer_name} → {r.partner_email} • {moment(r.created_date).fromNow()}</p>
                      </div>
                    </div>
                    {r.comment && <p className="text-sm text-foreground mb-3 leading-relaxed">"{r.comment}"</p>}
                    {r.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {r.tags.map(t => <span key={t} className="text-[10px] bg-muted px-2 py-0.5 rounded-full">{t}</span>)}
                      </div>
                    )}
                    {r.photos?.length > 0 && (
                      <div className="flex gap-1.5 mb-3">
                        {r.photos.map((url, i) => <img key={i} src={url} alt="" className="w-14 h-14 rounded-lg object-cover" />)}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => handleModerate(r, 'approved')}
                        className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </button>
                      <button onClick={() => handleModerate(r, 'rejected')}
                        className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-red-50 text-red-600 text-xs font-semibold border border-red-200">
                        <XCircle className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── PARTNER PERFORMANCE ───────────────────────────────────── */}
            {tab === 'partners' && (
              <div className="space-y-3">
                {atRiskPartners.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-500 shrink-0" />
                    <p className="text-sm font-semibold text-red-700">{atRiskPartners.length} partners below 3.5★ — needs attention</p>
                  </div>
                )}
                {partnerScores.filter(p => p.totalReviews > 0).map(p => (
                  <div key={p.id} className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${p.avg < 3.5 ? 'bg-red-50' : 'bg-primary/10'}`}>
                        <span className={`font-bold ${p.avg < 3.5 ? 'text-red-600' : 'text-primary'}`}>{p.full_name?.charAt(0)}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-bold text-sm">{p.full_name}</p>
                          {p.avg > 0 && <QualityBadge avgRating={p.avg} />}
                          {p.avg >= 4.7 && p.totalReviews >= 20 && <TopRatedBadge avgRating={p.avg} totalReviews={p.totalReviews} />}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="flex items-center gap-0.5">
                            {[1,2,3,4,5].map(i => <Star key={i} className={`h-2.5 w-2.5 ${i <= Math.round(p.avg) ? 'fill-amber-400 text-amber-400' : 'text-border'}`} />)}
                          </div>
                          <span className="text-xs font-bold">{p.avg > 0 ? p.avg.toFixed(2) : '—'}</span>
                          <span className="text-[10px] text-muted-foreground">({p.totalReviews} reviews)</span>
                          {p.lowRatingCount > 0 && <span className="text-[10px] text-red-600 font-semibold">{p.lowRatingCount} low</span>}
                        </div>
                      </div>
                    </div>
                    {p.topTags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {p.topTags.map(({ tag, count }) => (
                          <span key={tag} className="text-[10px] bg-accent px-2 py-0.5 rounded-full text-accent-foreground">
                            {tag} ×{count}
                          </span>
                        ))}
                      </div>
                    )}
                    {p.avg < 3.5 && (
                      <div className="mt-2 flex gap-2">
                        <button className="flex items-center gap-1 text-[10px] px-2.5 py-1 bg-amber-50 text-amber-700 rounded-xl border border-amber-200 font-semibold">
                          <MessageSquare className="h-3 w-3" /> Send Warning
                        </button>
                        <button className="flex items-center gap-1 text-[10px] px-2.5 py-1 bg-violet-50 text-violet-700 rounded-xl border border-violet-200 font-semibold">
                          <RefreshCw className="h-3 w-3" /> Retraining
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {partnerScores.filter(p => p.totalReviews === 0).length > 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {partnerScores.filter(p => p.totalReviews === 0).length} partners have no reviews yet
                  </p>
                )}
              </div>
            )}

            {/* ── FRAUD DETECTION ───────────────────────────────────────── */}
            {tab === 'fraud' && (
              <div className="space-y-3">
                {suspiciousFlags.length === 0 ? (
                  <div className="text-center py-12 bg-surface rounded-3xl border border-border">
                    <Shield className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm font-semibold">No suspicious patterns detected</p>
                  </div>
                ) : suspiciousFlags.map((flag, i) => (
                  <div key={i} className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-orange-700">{flag.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                        <p className="text-xs text-orange-600 mt-0.5">{flag.note}</p>
                        {flag.ids && <p className="text-[10px] text-muted-foreground mt-1">Affected IDs: {flag.ids.slice(0, 3).join(', ')}</p>}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="bg-surface rounded-2xl border border-border p-4">
                  <p className="text-sm font-bold mb-1">Anti-Spam Rules Active</p>
                  {['Duplicate consumer–partner review detection', 'Rating spike analysis (7-day window)', 'Anonymous review frequency limit', 'Single IP multi-review detection (requires backend)'].map(r => (
                    <div key={r} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <p className="text-xs text-muted-foreground">{r}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}