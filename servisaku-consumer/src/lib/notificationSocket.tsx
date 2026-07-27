import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth';
import { API_BASE } from '@/api/client';
import { getToken } from '@/lib/storage';

// The Socket.IO server shares the API's origin — strip the trailing /api.
const SOCKET_URL = API_BASE.replace(/\/api\/?$/, '');

/**
 * Live notification bridge. While signed in, holds a Socket.IO connection to the
 * API and refreshes the notification caches whenever the server pushes an event,
 * so the bell badge and notification center update in real time (and stay in
 * sync across the user's devices). Renders nothing.
 *
 * The connection is best-effort: if it can't establish (e.g. offline or an
 * expired token), the screens still work via their pull-to-refresh / refetch.
 */
export function NotificationSocket() {
  const { user } = useAuth();
  const userId = user?.id;
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const socket: Socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnectionAttempts: Infinity,
      // Re-read the latest access token on every (re)connect so a token refresh
      // doesn't permanently drop the live connection.
      auth: (cb) => { getToken().then((t) => cb({ token: t || '' })).catch(() => cb({ token: '' })); },
    });

    const invalidateAll = () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notification-count'] });
    };
    socket.on('notification:new', invalidateAll);
    socket.on('notification:update', invalidateAll);
    socket.on('notification:unread_count', () =>
      qc.invalidateQueries({ queryKey: ['notification-count'] }));

    return () => { socket.off(); socket.disconnect(); };
  }, [userId, qc]);

  return null;
}
