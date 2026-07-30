import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, MessageSquare, Flag, CheckCircle2 } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import moment from 'moment';

function Card({ children, className = '' }) {
  return <div className={`bg-surface rounded-2xl border border-hairline/10 shadow-e1 p-4 ${className}`}>{children}</div>;
}

function Stars({ rating, size = 'h-3.5 w-3.5' }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${size} ${i <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-hairline/40'}`} />
      ))}
    </span>
  );
}

export default function PartnerReviews() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState(null);
  const [replyingId, setReplyingId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);

  // `reviews === null` gates the spinner — without a catch a failed load
  // (e.g. 403 "Partners only") leaves the page loading indefinitely.
  useEffect(() => {
    servisaku.reviews.mine()
      .then(setReviews)
      .catch(e => { toast.error(e?.message || 'Could not load your reviews'); setReviews([]); });
  }, []);

  if (!reviews) return (
    <div className="flex justify-center pt-32"><div className="w-6 h-6 border-2 border-raised border-t-brand rounded-full animate-spin" /></div>
  );

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const dist = [5, 4, 3, 2, 1].map((s) => ({ star: s, count: reviews.filter((r) => Math.round(r.rating) === s).length }));

  const sendReply = async (id) => {
    if (!replyText.trim()) return;
    setBusy(true);
    try {
      const res = await servisaku.reviews.reply(id, replyText.trim());
      setReviews((rs) => rs.map((r) => r.id === id ? { ...r, reply: res.reply, replied_at: res.replied_at } : r));
      setReplyingId(null); setReplyText('');
      toast.success('Reply posted');
    } catch (e) { toast.error(e.message || 'Could not reply'); } finally { setBusy(false); }
  };

  const report = async (id) => {
    const reason = window.prompt('Why are you reporting this review?');
    if (!reason) return;
    try {
      await servisaku.reviews.report(id, reason);
      setReviews((rs) => rs.map((r) => r.id === id ? { ...r, reported: true } : r));
      toast.success('Reported to our team');
    } catch (e) { toast.error(e.message || 'Could not report'); }
  };

  return (
    <div className="min-h-screen bg-bg font-inter" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
      <div className="bg-gradient-to-br from-brand-ink via-brand to-brand/80 px-5 lg:px-8 pt-14 lg:pt-8 pb-8">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <ArrowLeft className="h-4 w-4 text-white" />
          </button>
          <div><p className="text-white/60 text-xs">Reviews</p><h1 className="text-xl font-bold text-white">Customer feedback</h1></div>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 flex items-center gap-5">
          <div className="text-center">
            <p className="text-3xl font-bold text-white">{avg.toFixed(1)}</p>
            <Stars rating={avg} size="h-3 w-3" />
            <p className="text-white/50 text-[10px] mt-1">{reviews.length} reviews</p>
          </div>
          <div className="flex-1 space-y-1">
            {dist.map((d) => (
              <div key={d.star} className="flex items-center gap-2">
                <span className="text-white/60 text-[10px] w-3">{d.star}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full bg-amber-400" style={{ width: `${reviews.length ? (d.count / reviews.length) * 100 : 0}%` }} />
                </div>
                <span className="text-white/50 text-[10px] w-4 text-right">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 lg:px-8 max-w-2xl mx-auto pt-5 space-y-3">
        <SectionHeader title="All reviews" />
        {reviews.length === 0 ? (
          <Card className="text-center py-10"><p className="text-sm text-ink-secondary">No reviews yet</p></Card>
        ) : reviews.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{r.reviewer_name || 'Customer'}</p>
                <p className="text-[11px] text-ink-secondary">{r.service_type} · {moment(r.created_date).format('D MMM YYYY')}</p>
              </div>
              <Stars rating={r.rating} />
            </div>
            {r.comment && <p className="mt-2 text-sm text-ink-secondary leading-relaxed">{r.comment}</p>}

            {r.reply ? (
              <div className="mt-3 rounded-xl bg-raised/60 p-3">
                <p className="text-[10px] font-bold text-brand mb-0.5">Your reply</p>
                <p className="text-xs text-ink-secondary">{r.reply}</p>
              </div>
            ) : replyingId === r.id ? (
              <div className="mt-3 space-y-2">
                <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={2} autoFocus
                  placeholder="Thank the customer or address their feedback…"
                  className="w-full rounded-xl bg-raised px-3 py-2 text-sm text-ink outline-none focus:ring-1 focus:ring-brand" />
                <div className="flex gap-2">
                  <Button onClick={() => sendReply(r.id)} disabled={busy} className="h-8 rounded-lg bg-brand text-white text-xs hover:bg-brand/90">Post reply</Button>
                  <Button onClick={() => { setReplyingId(null); setReplyText(''); }} variant="outline" className="h-8 rounded-lg text-xs">Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-3">
                <button onClick={() => { setReplyingId(r.id); setReplyText(''); }} className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-ink">
                  <MessageSquare className="h-3.5 w-3.5" /> Reply
                </button>
                {r.reported ? (
                  <span className="flex items-center gap-1 text-xs text-ink-tertiary"><CheckCircle2 className="h-3.5 w-3.5" /> Reported</span>
                ) : (
                  <button onClick={() => report(r.id)} className="flex items-center gap-1.5 text-xs font-medium text-ink-tertiary hover:text-danger">
                    <Flag className="h-3.5 w-3.5" /> Report
                  </button>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
