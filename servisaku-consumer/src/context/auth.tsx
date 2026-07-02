import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type User } from '@/api/client';
import { getToken } from '@/lib/storage';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithFirebase: (token: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  login: async () => {},
  loginWithFirebase: async () => {},
  register: async () => {},
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
        try { setUser(await api.me()); } catch { /* expired/invalid token */ }
      }
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    setUser(await api.login(email, password));
  };
  const loginWithFirebase = async (token: string) => {
    setUser(await api.loginWithFirebase(token));
  };
  const register = async (email: string, password: string, fullName: string) => {
    setUser(await api.register(email, password, fullName));
  };
  const refresh = async () => {
    try { setUser(await api.me()); } catch { /* ignore */ }
  };
  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, login, loginWithFirebase, register, refresh, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
