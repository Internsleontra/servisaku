import { useState } from 'react';
import { Star, ThumbsUp, Flag, Edit2 } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { cn } from '@/lib/utils';
import moment from 'moment';

function StarRow({ rating, size = 'sm' }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={cn(
          size === 'sm' ? 'h-3 w-3' : 'h-4 w-4',
          i <= rating ? 'fill-amber-400 text-amber-400' : 'text-border'
        )} />
      ))}
    </div>
  );
}

export default function ReviewCard({ review, _showPartner = false, currentUserEmail, onEdit }) {
  const [helpful, setHelpful] = useState(review.helpful_count || 0);
  const [voted, setVoted] = useState(false);
  const isOwn = review.consumer_email === currentUserEmail;
  const isAnon = review.is_anonymous;
  const canEdit = isOwn && moment().diff(moment(review.created_date), 'hours') < 24;

  const handleHelpful = async () => {
    if (voted || isOwn) return;
    setVoted(true);
    setHelpful(h => h + 1);
    await servisaku.entities.Review.update(review.id, { helpful_count: helpful + 1 });
  };

  if (!review.is_visible) return null;

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            {isAnon
              ? <span className="text-xs font-bold text-primary">A</span>
              : <span className="text-xs font-bold text-primary">{review.consumer_name?.charAt(0) || '?'}</span>
            }
          </div>
          <div>
            <p className="text-sm font-semibold">
              {isAnon ? 'Anonymous' : review.consumer_name}
              {review.is_repeat_customer && (
                <span className="ml-1.5 text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">Repeat</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <StarRow rating={review.rating} />
              <span className="text-[10px] text-muted-foreground">{moment(review.created_date).fromNow()}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {review.moderation_status === 'approved' && (
            <span className="text-[9px] text-emerald-600 font-medium">✓ Verified</span>
          )}
          {canEdit && (
            <button onClick={() => onEdit?.(review)} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
              <Edit2 className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Sub-ratings */}
      {(review.punctuality_rating || review.quality_rating || review.professionalism_rating) && (
        <div className="flex gap-3 mb-2">
          {review.punctuality_rating && (
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              Punctuality <StarRow rating={review.punctuality_rating} size="xs" />
            </div>
          )}
          {review.quality_rating && (
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              Quality <StarRow rating={review.quality_rating} size="xs" />
            </div>
          )}
          {review.professionalism_rating && (
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              Professionalism <StarRow rating={review.professionalism_rating} size="xs" />
            </div>
          )}
        </div>
      )}

      {/* Tags */}
      {review.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {review.tags.map(tag => (
            <span key={tag} className="text-[10px] bg-accent text-accent-foreground px-2 py-0.5 rounded-full font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Comment */}
      {review.comment && (
        <p className="text-sm text-foreground leading-relaxed mb-2">{review.comment}</p>
      )}

      {/* Photos */}
      {review.photos?.length > 0 && (
        <div className="flex gap-2 mb-2 overflow-x-auto">
          {review.photos.map((url, i) => (
            <img key={i} src={url} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0 border border-border" />
          ))}
        </div>
      )}

      {/* Partner Reply */}
      {review.partner_reply && (
        <div className="bg-muted/60 rounded-xl p-3 mb-2 border-l-2 border-primary">
          <p className="text-[10px] font-semibold text-primary mb-0.5">Partner response</p>
          <p className="text-xs text-muted-foreground">{review.partner_reply}</p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-1">
        <button onClick={handleHelpful} disabled={voted || isOwn}
          className={cn(
            'flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg transition-colors',
            voted ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted'
          )}>
          <ThumbsUp className="h-3 w-3" />
          Helpful {helpful > 0 && `(${helpful})`}
        </button>
        <button className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-muted transition-colors">
          <Flag className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}