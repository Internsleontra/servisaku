import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router } from 'react-router-dom';
import { Suspense } from 'react';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ThemeProvider } from '@/components/ThemeProvider';
import { LanguageProvider } from '@/lib/LanguageContext';

const Spinner = ({ accent = 'border-t-slate-800' }) => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className={`w-8 h-8 border-4 border-hairline ${accent} rounded-full animate-spin`}></div>
  </div>
);

// Gates the routes on auth/public-settings loading — identical behaviour for
// both the consumer and partner builds.
function AuthGate({ children }) {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <Spinner />;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return <Suspense fallback={<Spinner accent="border-t-brand" />}>{children}</Suspense>;
}

// Shared application shell: every provider the app needs, plus the auth gate.
// Each build (consumer / partner) supplies its own <Routes> as children.
export function AppShell({ children }) {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ThemeProvider defaultTheme="system" storageKey="servisaku-theme">
          <AuthProvider>
            <QueryClientProvider client={queryClientInstance}>
              <Router>
                <AuthGate>{children}</AuthGate>
              </Router>
              <Toaster />
            </QueryClientProvider>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
