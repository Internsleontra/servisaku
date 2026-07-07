import { useState, useEffect } from 'react';
import { servisaku } from '@/api/servisakuClient';
import BookingCard from '../components/BookingCard';
import { CalendarDays, Clock, CheckCircle2, XCircle } from 'lucide-react';

export default function BookingHistory() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('upcoming');

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
    <div className="font-inter min-h-screen bg-bg">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg/80 backdrop-blur-2xl border-b border-hairline/10 px-5 lg:px-8 pt-12 lg:pt-4 pb-0">
        <h1 className="text-2xl font-bold tracking-tight mb-5">My Bookings</h1>

        {/* Tab bar */}
        <div className="flex gap-1 mb-0 overflow-x-auto scrollbar-none">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-xl transition-all duration-200 ${
                tab === t.id
                  ? 'text-brand border-b-2 border-brand bg-transparent'
                  : 'text-ink-secondary'
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                tab === t.id ? 'bg-brand-tint text-brand' : 'bg-raised text-ink-secondary'
              }`}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 lg:px-8 pt-5">
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-surface rounded-2xl border border-hairline/10 p-5 space-y-3 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-11 h-11 bg-raised rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-raised rounded-full w-1/2" />
                    <div className="h-3 bg-raised rounded-full w-1/3" />
                  </div>
                </div>
                <div className="h-3 bg-raised rounded-full w-3/4" />
              </div>
            ))}
          </div>
        ) : list.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {list.map(b => <BookingCard key={b.id} booking={b} />)}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-20">
            <div className="w-16 h-16 bg-raised rounded-2xl flex items-center justify-center mb-5">
              <CalendarDays className="h-7 w-7 text-ink-secondary" />
            </div>
            <p className="font-bold text-base mb-1.5">No {tab} bookings</p>
            <p className="text-sm text-ink-secondary max-w-xs">
              {tab === 'upcoming' || tab === 'ongoing' ? 'Book a service to get started' : `Your ${tab} bookings will appear here`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}