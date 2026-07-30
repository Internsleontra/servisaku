import { useState } from 'react';
import { Bell, X, CheckCheck, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLiveNotifications } from '@/hooks/useRealtimeBooking';
import moment from 'moment';

const TYPE_ICON = {
  booking_update: '📋',
  payment: '💰',
  chat: '💬',
  promo: '🎁',
  system: '⚙️',
  reminder: '⏰',
};

export default function NotificationBell({ userEmail }) {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markAllRead } = useLiveNotifications(userEmail);
  const navigate = useNavigate();

  if (!userEmail) return null;

  return (
    <div className="relative">
      <button onClick={() => { setOpen(!open); if (!open && unreadCount > 0) markAllRead(); }}
        className="relative w-9 h-9 rounded-full bg-surface border border-border shadow-sm flex items-center justify-center">
        <Bell className="h-4 w-4 text-primary" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center ring-2 ring-background">
            <span className="text-[9px] text-white font-bold">{unreadCount > 9 ? '9+' : unreadCount}</span>
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 bg-surface rounded-3xl border border-border shadow-[0_8px_40px_rgba(0,0,0,0.12)] z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="font-bold text-sm">Notifications</p>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[10px] text-primary font-semibold flex items-center gap-0.5">
                  <CheckCheck className="h-3 w-3" /> Mark all read
                </button>
              )}
              <button onClick={() => { setOpen(false); navigate('/notifications'); }}
                className="text-[10px] text-muted-foreground hover:text-primary font-medium flex items-center gap-0.5">
                <ArrowRight className="h-3 w-3" /> View all
              </button>
              <button onClick={() => setOpen(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No notifications</p>
              </div>
            ) : notifications.map(n => (
              <div key={n.id} className={`px-4 py-3 border-b border-border/50 last:border-0 ${!n.is_read ? 'bg-accent/30' : ''}`}>
                <div className="flex items-start gap-2.5">
                  <span className="text-base shrink-0">{TYPE_ICON[n.type] || '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold leading-tight">{n.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                    <p className="text-[9px] text-muted-foreground mt-1">{moment(n.created_date).fromNow()}</p>
                  </div>
                  {!n.is_read && <div className="w-2 h-2 bg-primary rounded-full shrink-0 mt-1" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}