import { useEffect, useState } from 'react';
import { servisaku } from '@/api/servisakuClient';

/**
 * Live unread-notification count.
 *
 * Replaces `const NOTIF_COUNT = 3` in PartnerSidebar, which rendered a fixed
 * badge of 3 to every partner forever. Uses the same entity + subscription the
 * NotificationCenter already relies on, so the badge and the page agree.
 *
 * Returns 0 (badge hidden) rather than throwing if the user is signed out or
 * the request fails — a nav badge must never take the shell down.
 */
export function useUnreadNotifications() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const user = await servisaku.auth.me();
        if (!alive || !user?.email) return;

        const notifs = await servisaku.entities.Notification.filter(
          { user_email: user.email },
          '-created_date',
          100,
        );
        if (!alive) return;
        setCount((notifs || []).filter((n) => !n.is_read).length);
      } catch {
        if (alive) setCount(0);
      }
    })();

    // Keep the badge in step with reads/creates happening elsewhere.
    let unsub;
    try {
      unsub = servisaku.entities.Notification.subscribe((event) => {
        if (!alive) return;
        if (event?.type === 'create' && event.data && !event.data.is_read) {
          setCount((c) => c + 1);
        }
        if (event?.type === 'update' && event.data?.is_read) {
          setCount((c) => Math.max(0, c - 1));
        }
      });
    } catch {
      unsub = undefined;
    }

    return () => {
      alive = false;
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  return count;
}
