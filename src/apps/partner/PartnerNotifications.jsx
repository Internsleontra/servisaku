import { createContext, useContext } from 'react';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';

/**
 * One unread-notification count for the whole partner shell.
 *
 * The hook was previously called from three places — the sidebar, the
 * mounted-but-CSS-hidden top nav, and the dashboard bell — so every page load
 * fired three `auth/me` + three `/api/notifications` requests and the three
 * badges could disagree mid-flight. The hook now runs once, at the shell, and
 * all consumers read the same value.
 *
 * No API change: this is the same request the NotificationCenter already makes.
 */
const UnreadContext = createContext(0);

export function PartnerNotificationsProvider({ children }) {
  const count = useUnreadNotifications();
  return <UnreadContext.Provider value={count}>{children}</UnreadContext.Provider>;
}

/** Unread count from the shell. Returns 0 outside the provider. */
export function usePartnerUnread() {
  return useContext(UnreadContext);
}
