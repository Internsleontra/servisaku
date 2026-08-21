import { useNavigate } from 'react-router-dom';
import { cn, formatMYR } from '@/lib/utils';
import { avatarFor, tintFor } from '@/lib/categoryAvatars';
import { House } from 'lucide-react';
import { useTranslation } from '@/lib/useTranslation';

// Urban-Company-style category tiles: an avatar on a soft tile, name beneath.
// `onPick(slug)` overrides the default navigation to /catalog/:slug.
export default function CategoryTiles({ categories = [], onPick, className }) {
  const navigate = useNavigate();
  const { tField } = useTranslation();
  const pick = onPick || ((slug) => navigate(`/catalog/${slug}`));

  return (
    <div className={cn('grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-6', className)}>
      {categories.map((c) => {
        const avatar = avatarFor(c.slug);
        return (
          <button
            key={c.id || c.slug}
            type="button"
            onClick={() => pick(c.slug)}
            className="group flex flex-col items-center gap-2"
          >
            <div
              className={cn(
                'relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl p-2 transition-all group-hover:-translate-y-0.5 group-hover:shadow-e2',
                tintFor(c.accent),
              )}
            >
              {avatar ? (
                <img
                  src={avatar}
                  alt={tField(c, 'name')}
                  loading="lazy"
                  className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <House className="size-6 text-brand" />
              )}
              {c.price_from > 0 && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-ink shadow-e1">
                  {formatMYR(Math.round(c.price_from))}+
                </span>
              )}
            </div>
            <p className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-ink group-hover:text-brand md:text-xs">
              {tField(c, 'name')}
            </p>
          </button>
        );
      })}
    </div>
  );
}
