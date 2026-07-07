import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type User, type CompleteProfilePayload } from '@/api/client';
import { getToken } from '@/lib/storage';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithFirebase: (token: string, fullName?: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  /** Verify a phone OTP → sets the session user, returns whether they need to finish their profile. */
  verifyOtp: (phone: string, code: string, fullName?: string) => Promise<boolean>;
  completeProfile: (payload: CompleteProfilePayload) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  logoutEverywhere: () => Promise<void>;
}

const noop = async () => {};
const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  login: noop,
  loginWithFirebase: noop,
  register: noop,
  verifyOtp: async () => false,
  completeProfile: noop,
  refresh: noop,
  logout: noop,
  logoutEverywhere: noop,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try { setUser(await api.me()); } catch { /* expired/invalid — refresh-on-401 handles it */ }
      }
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => { setUser(await api.login(email, password)); };
  const loginWithFirebase = async (token: string, fullName?: string) => { setUser(await api.loginWithFirebase(token, fullName)); };
  const register = async (email: string, password: string, fullName: string) => { setUser(await api.register(email, password, fullName)); };

  const verifyOtp = async (phone: string, code: string, fullName?: string) => {
    const { user: u, is_new_user } = await api.otpVerify(phone, code, fullName);
    setUser(u);
    return is_new_user;
  };
  const completeProfile = async (payload: CompleteProfilePayload) => { setUser(await api.completeProfile(payload)); };

  const refresh = async () => { try { setUser(await api.me()); } catch { /* ignore */ } };
  const logout = async () => { await api.logout(); setUser(null); };
  const logoutEverywhere = async () => {
    try { await api.logoutAll(); } catch { /* ignore */ }
    await api.logout();
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, login, loginWithFirebase, register, verifyOtp, completeProfile, refresh, logout, logoutEverywhere }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
