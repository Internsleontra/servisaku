import { Star, BadgeCheck, Clock } from 'lucide-react';

export default function PartnerCard({ partner, onSelect, selected }) {
  const rating = partner.partner_rating || 4.8;
  const jobs = partner.partner_jobs_completed || 0;
  const services = partner.partner_services || [];

  return (
    <button
      onClick={() => onSelect?.(partner)}
      className={`w-full text-left bg-surface rounded-3xl border-2 p-4 transition-all duration-200 ${
        selected ? 'border-primary shadow-float scale-[1.01]' : 'border-border shadow-card hover:shadow-card-hover'
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 relative">
          <span className="text-lg font-bold text-primary">{partner.full_name?.charAt(0) || 'P'}</span>
          {partner.partner_verified && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
              <BadgeCheck className="h-3 w-3 text-white" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="font-semibold text-sm truncate">{partner.full_name || 'Partner'}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              <Star className="h-3 w-3 text-gold fill-gold" />
              <span className="text-xs font-semibold">{rating.toFixed(1)}</span>
            </div>
            <span className="text-[10px] text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">{jobs} jobs</span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
          <Clock className="h-3 w-3" />
          <span className="font-medium">~15 min</span>
        </div>
      </div>
      {services.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {services.slice(0, 3).map((s, i) => (
            <span key={i} className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{s}</span>
          ))}
        </div>
      )}
    </button>
  );
}