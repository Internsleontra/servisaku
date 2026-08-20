import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, Camera, X, ChevronRight, CheckCircle2, ArrowLeft, PartyPopper } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { CONSUMER_REVIEW_TAGS, checkAndCreateTicket } from '@/lib/qualityEngine';
import { useTranslation } from '@/lib/useTranslation';
import { Button } from '@/components/ds';
import { toast } from 'sonner';
import { Angry, Frown, Meh, Smile, Laugh } from 'lucide-react';

const FACE_MAP = { 1: Angry, 2: Frown, 3: Meh, 4: Smile, 5: Laugh };
const LABEL_MAP = { 1: 'Very Poor', 2: 'Poor', 3: 'Okay', 4: 'Good', 5: 'Excellent' };

function StarPicker({ value, onChange, size = 'lg' }) {
  const [hover, setHover] = useState(0);
  const sz = size === 'lg' ? 'h-10 w-10' : 'h-7 w-7';
  return (
    <div className="flex gap-2 justify-center">
      {[1,2,3,4,5].map(i => (
        <button key={i} type="button" onClick={() => onChange(i)}
          aria-label={`${i} star${i > 1 ? 's' : ''}`}
          aria-pressed={i === value}
          onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)}>
          <Star className={`${sz} transition-all ${i <= (hover || value) ? 'fill-star text-star scale-110' : 'text-ink-tertiary'}`} />
        </button>
      ))}
    </div>
  );
}

export default function ReviewFlow() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [booking, setBooking] = useState(null);
  const [user, setUser] = useState(null);
  const [step, setStep] = useState(1); // 1=overall, 2=sub-ratings, 3=tags, 4=comment, 5=done

  const [overallRating, setOverallRating] = useState(0);
  const [punctuality, setPunctuality] = useState(0);
  const [quality, setQuality] = useState(0);
  const [professionalism, setProfessionalism] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [comment, setComment] = useState('');
  const [isAnon, setIsAnon] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      servisaku.entities.Booking.get(bookingId),
      servisaku.auth.me(),
    ]).then(([b, u]) => { setBooking(b); setUser(u); });
  }, [bookingId]);

  const toggleTag = (tag) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handlePhotoUpload = async (e) => {
    setUploading(true);
    for (const file of Array.from(e.target.files)) {
      const { file_url } = await servisaku.integrations.Core.UploadFile({ file });
      setPhotos(p => [...p, file_url]);
    }
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!overallRating) return toast.error(t('Please select a rating'));
    setSubmitting(true);
    const reviewPayload = {
      booking_id: bookingId,
      partner_email: booking.partner_email,
      consumer_email: user.email,
      consumer_name: isAnon ? 'Anonymous' : user.full_name,
      service_type: booking.service_type,
      rating: overallRating,
      punctuality_rating: punctuality || null,
      quality_rating: quality || null,
      professionalism_rating: professionalism || null,
      tags: selectedTags,
      comment,
      photos,
      is_anonymous: isAnon,
      is_visible: true,
      is_repeat_customer: false,
      moderation_status: overallRating >= 3 ? 'approved' : 'pending',
      helpful_count: 0,
    };
    const review = await servisaku.entities.Review.create(reviewPayload);
    await servisaku.entities.Booking.update(bookingId, {
      rating: overallRating, review: comment,
    });
    // Auto quality ticket for low ratings
    if (overallRating < 3) {
      const tickets = await servisaku.entities.QualityTicket.filter({ partner_email: booking.partner_email });
      await checkAndCreateTicket(
        { ...reviewPayload, partner_name: booking.partner_name, id: review.id },
        tickets
      );
    }
    setSubmitting(false);
    setStep(5);
  };

  if (!booking) return (
    <div className="flex justify-center pt-32">
      <div className="w-6 h-6 shadow-[inset_0_0_0_1px_rgb(var(--hairline))] border-raised border-t-brand rounded-full animate-spin" />
    </div>
  );

  if (booking.rating) return (
    <div className="min-h-screen bg-bg font-inter flex flex-col items-center justify-center px-5">
      <CheckCircle2 className="h-16 w-16 text-success mb-4" />
      <h2 className="text-xl font-semibold mb-2">{t('Already Reviewed')}</h2>
      <p className="text-ink-secondary text-sm text-center mb-6">{t("You've already submitted a review for this booking.")}</p>
      <Button onClick={() => navigate(`/booking/${bookingId}`)} className="rounded-xl px-8">{t('Back to Booking')}</Button>
    </div>
  );

  if (step === 5) return (
    <div className="min-h-screen bg-bg font-inter flex flex-col items-center justify-center px-5 text-center">
      <span className="mb-4 grid size-16 place-items-center rounded-full bg-grad-brand-soft text-brand-ink">
        <PartyPopper className="size-8" />
      </span>
      <h2 className="text-xl font-semibold mb-2">{t('Thank you')}</h2>
      <p className="text-ink-secondary text-sm mb-2">{t('Your review helps improve our service quality.')}</p>
      {(() => { const F = FACE_MAP[overallRating]; return F ? <F className="mx-auto my-4 size-14 text-brand" /> : null; })()}
      <p className="font-semibold text-lg">{LABEL_MAP[overallRating]}</p>
      <div className="flex gap-1 justify-center my-3">
        {[1,2,3,4,5].map(i => (
          <Star key={i} className={`h-6 w-6 ${i <= overallRating ? 'fill-star text-star' : 'text-ink-tertiary'}`} />
        ))}
      </div>
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center mb-4">
          {selectedTags.map(t => (
            <span key={t} className="text-xs bg-brand-tint text-brand-ink px-3 py-1 rounded-full">{t}</span>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 w-full max-w-xs mt-4">
        <Button onClick={() => navigate(`/booking/${bookingId}`)} className="rounded-xl">{t('View Booking')}</Button>
        <Button onClick={() => navigate('/')} variant="outline" className="rounded-xl">{t('Back to Home')}</Button>
      </div>
    </div>
  );

  return (
    <div className="bg-bg pb-16">
      {/* Gradient page header with step progress. */}
      <div className="bg-grad-hero text-white">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-8 md:pb-12">
          <button
            onClick={() => (step > 1 ? setStep((v) => v - 1) : navigate(-1))}
            className="mb-4 inline-flex items-center gap-1.5 text-caption font-normal text-white/75 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-[15px]" /> {t('Back')}
          </button>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-display-2 text-white">{t('Rate your experience')}</h1>
              <p className="mt-2 text-lead text-white/[0.78]">
                {booking.service_type}{booking.partner_name ? ` · ${booking.partner_name}` : ''}
              </p>
            </div>
            <span className="sa-num text-caption text-white/70">Step {step} of 4</span>
          </div>
          <div className="mt-5 flex gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-live' : 'bg-white/20'}`} />
            ))}
          </div>
        </div>
      </div>

      {/* Single centred column — a rating wizard is one task, so it stays a
          focused card rather than a two-column layout. */}
      <div className="mx-auto -mt-8 w-full max-w-[720px] px-5 md:px-8">
        <div className="rounded-card bg-surface p-5 shadow-e2 md:p-8">

        {/* Step 1: Overall Rating */}
        {step === 1 && (
          <div className="text-center">
            <div className="w-16 h-16 bg-brand/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-semibold text-brand">{booking.partner_name?.charAt(0)}</span>
            </div>
            <h2 className="text-xl font-semibold mb-1">How was {booking.partner_name?.split(' ')[0]}?</h2>
            <p className="text-sm text-ink-secondary mb-8">{booking.service_type} on {new Date(booking.date).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' })}</p>

            <StarPicker value={overallRating} onChange={setOverallRating} size="lg" />

            {overallRating > 0 && (
              <div className="mt-4 animate-in fade-in duration-300">
                {(() => { const F = FACE_MAP[overallRating]; return F ? <F className="size-10 text-brand" /> : null; })()}
                <p className="text-sm font-semibold mt-2">{LABEL_MAP[overallRating]}</p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Sub-Ratings */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-semibold mb-1 text-center">{t('Rate the details')}</h2>
            <p className="text-sm text-ink-secondary text-center mb-6">{t('Optional — but very helpful!')}</p>
            {[
              { label: t('Punctuality'), value: punctuality, onChange: setPunctuality },
              { label: t('Work Quality'), value: quality, onChange: setQuality },
              { label: t('Professionalism'), value: professionalism, onChange: setProfessionalism },
            ].map(({ label, value, onChange }) => (
              <div key={label} className="mb-6">
                <p className="text-sm font-semibold mb-3 text-center">{label}</p>
                <StarPicker value={value} onChange={onChange} size="md" />
              </div>
            ))}
          </div>
        )}

        {/* Step 3: Tags + Photos */}
        {step === 3 && (
          <div>
            <h2 className="text-xl font-semibold mb-1 text-center">{t('What stood out?')}</h2>
            <p className="text-sm text-ink-secondary text-center mb-6">{t('Select all that apply')}</p>
            <div className="flex flex-wrap gap-2 justify-center mb-6">
              {CONSUMER_REVIEW_TAGS.map(tag => (
                <button key={tag} onClick={() => toggleTag(tag)}
                  className={`px-4 py-2.5 rounded-2xl border text-sm font-semibold transition-all ${
                    selectedTags.includes(tag)
                      ? 'bg-brand text-ink-inverse border-brand scale-105'
                      : 'bg-surface border-hairline/10 text-ink hover:border-brand/50'
                  }`}>
                  {tag}
                </button>
              ))}
            </div>

            {/* Photos */}
            <div className="bg-raised/50 rounded-2xl p-4">
              <p className="text-sm font-semibold mb-2">{t('Add photos (optional)')}</p>
              <p className="text-xs text-ink-secondary mb-3">{t('Show before/after work or issues')}</p>
              <div className="flex gap-2 flex-wrap">
                {photos.map((url, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setPhotos(p => p.filter((_, j) => j !== i))}
                      className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
                      <X className="h-2.5 w-2.5 text-white" />
                    </button>
                  </div>
                ))}
                <label className="w-16 h-16 rounded-xl shadow-[inset_0_0_0_1px_rgb(var(--hairline))] border-dashed border-hairline/10 bg-surface flex flex-col items-center justify-center cursor-pointer">
                  {uploading ? <div className="w-4 h-4 shadow-[inset_0_0_0_1px_rgb(var(--hairline))] border-raised border-t-brand rounded-full animate-spin" />
                    : <Camera className="h-5 w-5 text-ink-secondary" />}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Comment + Options */}
        {step === 4 && (
          <div>
            <h2 className="text-xl font-semibold mb-1 text-center">{t('Anything to add?')}</h2>
            <p className="text-sm text-ink-secondary text-center mb-6">{t('Your written review helps others decide')}</p>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={4}
              placeholder={overallRating >= 4
                ? "What did you love about the service? Any specific details..."
                : "What could have been better? Help us understand..."}
              className="w-full bg-raised text-ink rounded-2xl px-4 py-3 text-sm outline-none resize-none mb-4 placeholder:text-ink-tertiary"
            />
            <button onClick={() => setIsAnon(!isAnon)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all mb-4 ${isAnon ? 'border-brand bg-brand/5' : 'border-hairline/10 bg-surface'}`}>
              <div>
                <p className="text-sm font-semibold text-left">{t('Post anonymously')}</p>
                <p className="text-xs text-ink-secondary">{t("Your name won't be shown publicly")}</p>
              </div>
              <div className={`w-5 h-5 rounded-full shadow-[inset_0_0_0_1px_rgb(var(--hairline))] flex items-center justify-center ${isAnon ? 'border-brand bg-brand' : 'border-hairline/10 bg-surface'}`}>
                {isAnon && <div className="w-2 h-2 bg-surface rounded-full" />}
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-xl border-t border-hairline/10 px-5 py-4">
        <div className="max-w-lg mx-auto">
          {step < 4 ? (
            <Button
              onClick={() => { if (step === 1 && !overallRating) { toast.error(t('Please select a rating')); return; } setStep(s => s + 1); }}
              block size="lg">
              {t('Continue')} <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button onClick={() => navigate(`/booking/${bookingId}`)} variant="outline" size="lg" className="flex-1">
                {t('Skip')}
              </Button>
              <Button onClick={handleSubmit} loading={submitting} size="lg" className="flex-1">{t('Submit review')}</Button>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}