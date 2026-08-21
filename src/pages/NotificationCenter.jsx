import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, CheckCheck, Search, Filter, Trash2, BookOpen, CreditCard, MessageSquare, Settings, Megaphone, X } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { useTranslation } from '@/lib/useTranslation';

/* Relative time and day grouping, locale-aware. moment's fromNow() and
   calendar() emit English regardless of the selected language; Intl follows
   the locale and needs no extra locale bundle. */
function relativeTime(value, locale) {
  const then = new Date(value).getTime();
  const diff = then - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const UNITS = [['year', 31536000000], ['month', 2592000000], ['week', 604800000],
    ['day', 86400000], ['hour', 3600000], ['minute', 60000]];
  for (const [unit, ms] of UNITS) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(Math.round(diff / 1000), 'second');
}

function dayGroup(value, t, locale) {
  const d = new Date(value);
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(d)) / 86400000);
  if (days === 0) return t('Today');
  if (days === 1) return t('Yesterday');
  if (days < 7) return d.toLocaleDateString(locale, { weekday: 'long' });
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

const TYPE_META = {
  booking_update: { icon: BookOpen,      color: 'bg-info-tint text-info',      label: 'Booking' },
  payment:        { icon: CreditCard,    color: 'bg-success-tint text-success', label: 'Payment' },
  chat:           { icon: MessageSquare, color: 'bg-chat-tint text-chat',       label: 'Chat'    },
  // Promo is marketing, not an alert — it must not wear the emergency colour.
  promo:          { icon: Megaphone,     color: 'bg-brand-tint text-brand',     label: 'Promo'   },
  system:         { icon: Settings,      color: 'bg-raised text-ink-secondary', label: 'System'  },
  // Reminder stays warning: a time-sensitive nudge is a legitimate warning use.
  reminder:       { icon: Bell,          color: 'bg-warning-tint text-warning', label: 'Reminder'},
};

function NotifItem({ n, onRead, onDelete }) {
  const { t, locale } = useTranslation();
  const meta = TYPE_META[n.type] || TYPE_META.system;
  const Icon = meta.icon;
  return (
    <div
      onClick={() => onRead(n)}
      className={`group flex items-start gap-3.5 px-5 py-4 shadow-[inset_0_-1px_0_rgb(var(--hairline))] last:shadow-none cursor-pointer
                  hover:bg-raised/20 active:bg-raised/40 transition-colors ${!n.is_read ? 'bg-brand-tint/10' : ''}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${meta.color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          {/* dual-field-exempt: notifications are localized server-side by mapOut (SWAP) */}
          <p className={`text-sm leading-snug ${!n.is_read ? 'font-semibold' : 'font-medium'}`}>{n.title}</p>
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            <span className="text-[9.5px] text-ink-secondary">{relativeTime(n.created_date, locale)}</span>
            {!n.is_read && <div className="w-1.5 h-1.5 bg-brand rounded-full" />}
          </div>
        </div>
        {/* dual-field-exempt: notifications are localized server-side by mapOut (SWAP) */}
        <p className="text-xs text-ink-secondary mt-1 leading-relaxed line-clamp-2">{n.body}</p>
        <span className={`inline-block text-[9px] font-semibold mt-2 px-2 py-0.5 rounded-full ${meta.color}`}>{t(meta.label)}</span>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(n); }}
        // dual-field-exempt: notifications are localized server-side by mapOut (SWAP)
        aria-label={`Delete notification: ${n.title}`}
        className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-danger-tint transition-all shrink-0 mt-0.5">
        <Trash2 className="h-3 w-3 text-ink-secondary" />
      </button>
    </div>
  );
}

export default function NotificationCenter() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [_user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showFilter, setShowFilter] = useState(false);

  useEffect(() => {
    servisaku.auth.me().then(async u => {
      setUser(u);
      const notifs = await servisaku.entities.Notification.filter({ user_email: u.email }, '-created_date', 100);
      setNotifications(notifs);
      setLoading(false);
    });
    const unsub = servisaku.entities.Notification.subscribe(event => {
      if (event.type === 'create') setNotifications(prev => [event.data, ...prev]);
      if (event.type === 'update') setNotifications(prev => prev.map(n => n.id === event.id ? event.data : n));
    });
    return unsub;
  }, []);

  const handleRead = async (n) => {
    if (!n.is_read) {
      await servisaku.entities.Notification.update(n.id, { is_read: true, read_at: new Date().toISOString() });
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
    }
    if (n.reference_id && n.reference_type === 'booking') navigate(`/booking/${n.reference_id}`);
  };

  const handleDelete = async (n) => {
    await servisaku.entities.Notification.delete(n.id);
    setNotifications(prev => prev.filter(x => x.id !== n.id));
  };

  const markAllRead = async () => {
    for (const n of notifications.filter(x => !x.is_read)) {
      await servisaku.entities.Notification.update(n.id, { is_read: true, read_at: new Date().toISOString() });
    }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const filtered = notifications.filter(n => {
    if (filter !== 'all' && n.type !== filter) return false;
    if (search && !n.title.toLowerCase().includes(search.toLowerCase()) && !n.body.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const groups = filtered.reduce((acc, n) => {
    const key = dayGroup(n.created_date, t, locale);
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

  return (
    <div className="bg-bg pb-16">
      {/* Gradient page header — replaces the sticky translucent bar. */}
      <div className="bg-grad-hero text-white">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-8 md:pb-12">
          <button
            onClick={() => navigate(-1)}
            className="mb-4 inline-flex items-center gap-1.5 text-caption font-normal text-white/75 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-[15px]" /> {t('Back')}
          </button>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-display-2 text-white">{t('Notifications')}</h1>
              {unreadCount > 0 && (
                <p className="sa-num mt-2 text-lead text-live">{unreadCount} unread</p>
              )}
            </div>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  aria-label={t('Mark all as read')}
                  className="inline-flex min-h-11 items-center gap-2 rounded-field bg-white/10 px-4 text-caption font-semibold text-white ring-1 ring-inset ring-white/20 transition hover:bg-white/20"
                >
                  <CheckCheck className="size-4" />{t('Mark all read')}</button>
              )}
              <button
                onClick={() => setShowFilter(!showFilter)}
                aria-label={t('Filter notifications')}
                aria-pressed={filter !== 'all'}
                className={`inline-flex min-h-11 items-center gap-2 rounded-field px-4 text-caption font-semibold transition ${
                  filter !== 'all'
                    ? 'bg-white text-brand'
                    : 'bg-white/10 text-white ring-1 ring-inset ring-white/20 hover:bg-white/20'
                }`}
              >
                <Filter className="size-4" />{t('Filter')}</button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1240px] px-5 pt-6 md:px-8">
        {/* Search */}
        <div className="flex min-h-11 items-center gap-2.5 rounded-field bg-surface px-3.5 shadow-[inset_0_0_0_1px_rgb(var(--hairline))]">
          <Search className="h-3.5 w-3.5 text-ink-secondary shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            aria-label={t('Search notifications')}
            placeholder={t('Search notifications…')}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-secondary/60" />
          {search && (
            <button onClick={() => setSearch('')} className="shrink-0">
              <X className="h-3.5 w-3.5 text-ink-secondary" />
            </button>
          )}
        </div>

        {/* Filter pills */}
        {showFilter && (
          <div className="flex gap-1.5 mt-2.5 overflow-x-auto pb-1 scrollbar-none">
            {['all', 'booking_update', 'payment', 'chat', 'promo', 'system', 'reminder'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all shrink-0 ${
                  filter === f ? 'bg-brand text-white' : 'bg-raised text-ink-secondary hover:bg-raised/80'
                }`}>
                {f === 'all' ? t('All') : t(TYPE_META[f]?.label || f)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-5 pt-4">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-3.5 bg-surface rounded-card p-4 animate-pulse shadow-[inset_0_0_0_1px_rgb(var(--hairline))]">
                <div className="w-10 h-10 bg-raised rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-raised rounded-full w-2/3" />
                  <div className="h-3 bg-raised rounded-full w-full" />
                  <div className="h-3 bg-raised rounded-full w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20">
            <div className="w-16 h-16 bg-raised rounded-2xl flex items-center justify-center mb-5">
              <Bell className="h-7 w-7 text-ink-secondary" />
            </div>
            <p className="font-semibold text-base mb-1.5">
              {search || filter !== 'all' ? 'No matching notifications' : 'You\'re all caught up!'}
            </p>
            <p className="text-sm text-ink-secondary max-w-xs">
              {search || filter !== 'all' ? t('Try adjusting your search or filter') : t('New notifications will appear here')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groups).map(([date, items]) => (
              <div key={date}>
                <p className="text-[10px] font-semibold text-ink-secondary uppercase tracking-widest px-1 mb-2">{date}</p>
                <div className="bg-surface rounded-card overflow-hidden shadow-[inset_0_0_0_1px_rgb(var(--hairline))]">
                  {items.map(n => <NotifItem key={n.id} n={n} onRead={handleRead} onDelete={handleDelete} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {notifications.length > 0 && !loading && (
          <p className="text-center text-[10px] text-ink-secondary mt-5">
            {notifications.length} total · {unreadCount} unread · {notifications.filter(n => n.is_read).length} read
          </p>
        )}
      </div>
    </div>
  );
}