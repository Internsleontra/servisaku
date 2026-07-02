import { useCallback } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/context/auth';

// Gate an action behind login. Returns a fn that runs `action` if authed,
// otherwise routes to /login with a redirect back to the current intent.
export function useRequireAuth() {
  const { user } = useAuth();
  return useCallback(
    (action: () => void, redirectTo?: string) => {
      if (user) return action();
      router.push({ pathname: '/login', params: redirectTo ? { redirect: redirectTo } : {} });
    },
    [user],
  );
}
