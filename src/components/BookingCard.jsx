import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { variants } from '@/lib/design/motion';
import { CalendarDays, Clock, MapPin, ChevronRight } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { useTranslation } from '@/lib/useTranslation';

export default function BookingCard({ booking }) {
  const { locale } = useTranslation();
  const Icon = CalendarDays;

  return (
    <motion.div whileHover={variants.pressable.whileHover} whileTap={variants.pressable.whileTap}>
      <Link to={`/booking/${booking.id}`}
        className="flex items-center gap-3 bg-surface rounded-xl p-4 shadow-e1 hover:shadow-e2 transition-all duration-200 group">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-raised text-ink-secondary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="font-semibold text-sm text-ink">{booking.service_type}</p>
          <StatusBadge status={booking.status} />
        </div>
        <div className="flex items-center gap-3 text-[11px] text-ink-secondary">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />{new Date(booking.date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />{booking.time_slot}
          </span>
          {booking.city && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3" />{booking.city}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-ink-secondary group-hover:text-brand transition-colors shrink-0" />
    </Link>
    </motion.div>
  );
}