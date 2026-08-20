import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { servisaku } from '@/api/servisakuClient';
import { SegmentedTabs, Button, RING } from '@/components/ds';
import BookingCard from '../components/BookingCard';
import { CalendarDays, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from '@/lib/useTranslation';

/* Empty-state copy is keyed per tab rather than built by concatenation:
   "No <tab> bookings" cannot be assembled word-by-word in Malay, where the
   qualifier follows the noun ("Tiada tempahan akan datang"). */
const EMPTY_TITLE = {
  upcoming: 'No upcoming bookings',
  ongoing: 'No ongoing bookings',
  completed: 'No completed bookings',
  cancelled: 'No cancelled bookings',
};
const EMPTY_BODY = {
  completed: 'Your completed bookings will appear here.',
  cancelled: 'Your cancelled bookings will appear here.',
};

export default function BookingHistory() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('upcoming');
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    const load = async () => {
      const me = await servisaku.auth.me();
      const all = await servisaku.entities.Booking.filter({ consumer_email: me.email }, '-created_date', 50);
      setBookings(all);
      setLoading(false);
    };
    load();
  }, []);

  const upcoming  = bookings.filter(b => ['pending', 'confirmed', 'assigned', 'accepted'].includes(b.status));
  const ongoing   = bookings.filter(b => ['en_route', 'arrived', 'started'].includes(b.status));
  const completed = bookings.filter(b => b.status === 'completed');
  const cancelled = bookings.filter(b => ['cancelled', 'disputed'].includes(b.status));
  const byTab = { upcoming, ongoing, completed, cancelled };
  const list  = byTab[tab] ?? [];

  const TABS = [
    { id: 'upcoming',  label: 'Upcoming',  count: upcoming.length,  icon: Clock },
    { id: 'ongoing',   label: 'Ongoing',   count: ongoing.length,   icon: CalendarDays },
    { id: 'completed', label: 'Completed', count: completed.length, icon: CheckCircle2 },
    { id: 'cancelled', label: 'Cancelled', count: cancelled.length, icon: XCircle },
  ];

  return (
    <div className="bg-bg pb-16">
      {/* Gradient page header — replaces the sticky translucent bar. */}
      <div className="bg-grad-hero text-white">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-8 md:pb-12">
          <h1 className="text-display-2 text-white">{t('My bookings')}</h1>
          <p className="sa-num mt-2 text-lead text-white/[0.78]">
            {bookings.length} {t(bookings.length === 1 ? 'booking' : 'bookings')}
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1240px] px-5 pt-6 md:px-8">
        {/* Tabs — design-system underline pattern with count pills. */}
        <SegmentedTabs
          items={TABS.map((item) => ({ id: item.id, label: `${t(item.label)} (${item.count})` }))}
          value={tab}
          onChange={setTab}
        />

        <div className="pt-6">
          {loading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className={`space-y-3 rounded-card bg-surface p-5 ${RING}`} role="status" aria-label={t('Loading bookings')}>
                  <div className="flex gap-3">
                    <div className="size-11 animate-pulse rounded-md bg-raised" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-1/2 animate-pulse rounded-full bg-raised" />
                      <div className="h-3 w-1/3 animate-pulse rounded-full bg-raised" />
                    </div>
                  </div>
                  <div className="h-3 w-3/4 animate-pulse rounded-full bg-raised" />
                </div>
              ))}
            </div>
          ) : list.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((b) => <BookingCard key={b.id} booking={b} />)}
            </div>
          ) : (
            <div className={`flex flex-col items-center justify-center rounded-card bg-surface px-6 py-16 text-center ${RING}`}>
              <span className="grid size-16 place-items-center rounded-full bg-grad-brand-soft text-brand-ink">
                <CalendarDays className="size-7" />
              </span>
              <p className="mt-3 font-display text-h4 font-semibold text-ink">{t(EMPTY_TITLE[tab])}</p>
              <p className="mt-1 max-w-xs text-caption font-normal text-ink-secondary">
                {tab === 'upcoming' || tab === 'ongoing'
                  ? t('Book a service to get started.')
                  : t(EMPTY_BODY[tab])}
              </p>
              {(tab === 'upcoming' || tab === 'ongoing') && (
                <Button className="mt-5" onClick={() => navigate('/catalog')}>{t('Book a service')}</Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
