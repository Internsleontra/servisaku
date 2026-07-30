import { Shield, Star, Award, CheckCircle2, Briefcase } from 'lucide-react';
import { getBadge } from '@/lib/qualityEngine';
import { cn } from '@/lib/utils';

export function QualityBadge({ avgRating, size = 'sm' }) {
  const badge = getBadge(avgRating || 0);
  if (!badge.label) return null;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border font-semibold',
      badge.bg, badge.color,
      size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-3 py-1'
    )}>
      {badge.emoji} {badge.label}
    </span>
  );
}

export function TopRatedBadge({ avgRating, totalReviews }) {
  if (avgRating < 4.7 || totalReviews < 20) return null;
  return (
    <span className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-bold px-2 py-0.5">
      <Award className="h-2.5 w-2.5" /> Top Rated
    </span>
  );
}

export function VerifiedBadge({ verified = true }) {
  if (!verified) return null;
  return (
    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-[10px] font-semibold px-2 py-0.5">
      <CheckCircle2 className="h-2.5 w-2.5" /> Verified
    </span>
  );
}

export function BackgroundCheckBadge({ passed }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2 py-0.5 border',
      passed ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-muted text-muted-foreground border-border'
    )}>
      <Shield className="h-2.5 w-2.5" />
      {passed ? 'Background Checked' : 'Pending Check'}
    </span>
  );
}

export function InsuranceBadge({ covered }) {
  if (!covered) return null;
  return (
    <span className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 border border-violet-100 rounded-full text-[10px] font-semibold px-2 py-0.5">
      <Shield className="h-2.5 w-2.5" /> Insured
    </span>
  );
}

export function ReliabilityBadge({ pct }) {
  const color = pct >= 95 ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
    : pct >= 80 ? 'text-amber-700 bg-amber-50 border-amber-100'
    : 'text-red-600 bg-red-50 border-red-100';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2 py-0.5 border', color)}>
      {pct}% Reliable
    </span>
  );
}

// Full partner trust card for consumer-facing UI
export function PartnerTrustCard({ partner }) {
  const avg = partner.partner_rating || 0;
  const badge = getBadge(avg);
  const jobs = partner.partner_jobs_completed || 0;
  const years = partner.years_experience || 0;

  return (
    <div className="bg-surface border border-border rounded-3xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
          {partner.full_name?.charAt(0) || '?'}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="font-bold text-sm">{partner.full_name}</p>
            {badge.label && <QualityBadge avgRating={avg} />}
            {avg >= 4.7 && jobs >= 20 && <TopRatedBadge avgRating={avg} totalReviews={jobs} />}
          </div>
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span className="text-xs font-semibold">{avg > 0 ? avg.toFixed(1) : 'New'}</span>
            <span className="text-xs text-muted-foreground">({jobs} jobs)</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <VerifiedBadge verified={partner.is_verified} />
        <BackgroundCheckBadge passed={partner.background_check_passed} />
        {partner.is_insured && <InsuranceBadge covered />}
        {partner.reliability_pct && <ReliabilityBadge pct={partner.reliability_pct} />}
        {years > 0 && (
          <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground border border-border rounded-full text-[10px] font-semibold px-2 py-0.5">
            <Briefcase className="h-2.5 w-2.5" /> {years}y exp
          </span>
        )}
      </div>
    </div>
  );
}
