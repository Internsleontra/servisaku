import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, CheckCheck, Search, Filter, Trash2, BookOpen, CreditCard, MessageSquare, Settings, Megaphone, X } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import moment from 'moment';

const TYPE_META = {
  booking_update: { icon: BookOpen,      color: 'bg-sky-50 text-sky-600',      label: 'Booking' },
  payment:        { icon: CreditCard,    color: 'bg-emerald-50 text-emerald-600', label: 'Payment' },
  chat:           { icon: MessageSquare, color: 'bg-violet-50 text-violet-600', label: 'Chat'    },
  promo:          { icon: Megaphone,     color: 'bg-amber-50 text-amber-600',   label: 'Promo'   },
  system:         { icon: Settings,      color: 'bg-raised text-ink-secondary',   label: 'System'  },
  reminder:       { icon: Bell,          color: 'bg-orange-50 text-orange-600', label: 'Reminder'},
};

function NotifItem({ n, onRead, onDelete }) {
  const meta = TYPE_META[n.type] || TYPE_META.system;
  const Icon = meta.icon;
  return (
    <div
      onClick={() => onRead(n)}
      className={`group flex items-start gap-3.5 px-5 py-4 border-b border-border/30 last:border-0 cursor-pointer
                  hover:bg-muted/20 active:bg-muted/40 transition-colors ${!n.is_read ? 'bg-accent/10' : ''}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${meta.color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm leading-snug ${!n.is_read ? 'font-bold' : 'font-medium'}`}>{n.title}</p>
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            <span className="text-[9.5px] text-muted-foreground">{moment(n.created_date).fromNow()}</span>
            {!n.is_read && <div className="w-1.5 h-1.5 bg-primary rounded-full" />}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{n.body}</p>
        <span className={`inline-block text-[9px] font-bold mt-2 px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(n); }}
        className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all shrink-0 mt-0.5">
        <Trash2 className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  );
}

export default function NotificationCenter() {
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
    const key = moment(n.created_date).calendar(null, {
      sameDay: '[Today]', lastDay: '[Yesterday]', lastWeek: 'dddd', sameElse: 'D MMMM YYYY',
    });
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background font-inter" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>

      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-2xl border-b border-border/30 px-5 pt-12 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h1 className="font-bold text-lg tracking-tight">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-xs text-primary font-semibold">{unreadCount} unread</p>
            )}
          </div>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center hover:bg-primary/10 transition-colors" title="Mark all read">
                <CheckCheck className="h-4 w-4 text-primary" />
              </button>
            )}
            <button onClick={() => setShowFilter(!showFilter)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${filter !== 'all' ? 'bg-primary text-white' : 'bg-muted/60 hover:bg-muted'}`}>
              <Filter className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2.5 bg-muted/50 border border-border/40 rounded-xl px-3.5 h-10">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search notifications…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60" />
          {search && (
            <button onClick={() => setSearch('')} className="shrink-0">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Filter pills */}
        {showFilter && (
          <div className="flex gap-1.5 mt-2.5 overflow-x-auto pb-1 scrollbar-none">
            {['all', 'booking_update', 'payment', 'chat', 'promo', 'system', 'reminder'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-all shrink-0 ${
                  filter === f ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}>
                {f === 'all' ? 'All' : TYPE_META[f]?.label || f}
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
              <div key={i} className="flex gap-3.5 bg-surface rounded-2xl border border-border/60 p-4 animate-pulse">
                <div className="w-10 h-10 bg-muted rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-muted rounded-full w-2/3" />
                  <div className="h-3 bg-muted rounded-full w-full" />
                  <div className="h-3 bg-muted rounded-full w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-5">
              <Bell className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="font-bold text-base mb-1.5">
              {search || filter !== 'all' ? 'No matching notifications' : 'You\'re all caught up!'}
            </p>
            <p className="text-sm text-muted-foreground max-w-xs">
              {search || filter !== 'all' ? 'Try adjusting your search or filter' : 'New notifications will appear here'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groups).map(([date, items]) => (
              <div key={date}>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1 mb-2">{date}</p>
                <div className="bg-surface rounded-2xl border border-border/60 shadow-xs overflow-hidden">
                  {items.map(n => <NotifItem key={n.id} n={n} onRead={handleRead} onDelete={handleDelete} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {notifications.length > 0 && !loading && (
          <p className="text-center text-[10px] text-muted-foreground mt-5">
            {notifications.length} total · {unreadCount} unread · {notifications.filter(n => n.is_read).length} read
          </p>
        )}
      </div>
    </div>
  );
}