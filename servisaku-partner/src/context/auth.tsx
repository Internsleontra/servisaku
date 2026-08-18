import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type User } from '@/api/client';
import { getToken } from '@/lib/storage';
import { registerForPush } from '@/lib/notifications';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  login: async () => {},
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          setUser(await api.me());
          // Re-register on every launch: Expo rotates push tokens, and the
          // server keys on the token itself, so re-sending is a cheap upsert
          // rather than a duplicate. Deliberately not awaited — push must never
          // delay the app becoming usable.
          void registerForPush();
        } catch { /* expired/invalid token */ }
      }
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    setUser(await api.login(email, password));
    // After sign-in, not before: /notifications/push-token is authenticated, so
    // a token sent without a session cannot be attributed to a partner.
    void registerForPush();
  };
  const refresh = async () => { try { setUser(await api.me()); } catch { /* ignore */ } };
  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, refresh, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
