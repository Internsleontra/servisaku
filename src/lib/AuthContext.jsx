import React, { createContext, useState, useContext, useEffect } from 'react';
import { servisaku, readyPromise } from '@/api/servisakuClient';
import { appParams } from '@/lib/app-params';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    // Wait for backend detection to finish before making any auth calls.
    // This prevents the apiClient from hitting /api/auth/me on Netlify
    // (where there is no backend) and getting a 200 HTML page back.
    readyPromise.then(() => checkAppState());
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      setAppPublicSettings({ public_settings: { auth_type: 'email' } });

      const hasToken = !!localStorage.getItem('auth_token') || !!localStorage.getItem('appwrite_session') || !!localStorage.getItem('mock_active_user_id');
      if (appParams.token || hasToken) {
        await checkUserAuth();
      } else {
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
        setAuthChecked(true);
      }
      setIsLoadingPublicSettings(false);
    } catch (error) {
      console.error('Unexpected error in checkAppState:', error);
      setAuthError({ type: 'unknown', message: error.message || 'An unexpected error occurred' });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await servisaku.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      // Only a genuine auth rejection means the session is bad. A 429 (rate
      // limit) or a 5xx/network blip used to land here too and silently signed
      // the user out mid-login with no message on screen — which is what made
      // "the OTP arrives but login never completes" impossible to diagnose.
      const status = error?.status;
      const sessionRejected = status === 401 || status === 403;

      if (sessionRejected) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('appwrite_session');
        localStorage.removeItem('mock_active_user_id');
        localStorage.removeItem('mock_auth_email');
        setIsAuthenticated(false);
      } else {
        // Keep the session; surface the real reason instead of hiding it.
        console.error('[auth] session check failed, keeping session:', status, error?.message);
        setAuthError({ type: 'unknown', message: error?.message || 'Could not verify your session' });
      }
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('appwrite_session');
    localStorage.removeItem('mock_active_user_id');
    localStorage.removeItem('mock_auth_email');
    if (shouldRedirect) window.location.href = '/';
  };

  const navigateToLogin = () => {
    servisaku.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};