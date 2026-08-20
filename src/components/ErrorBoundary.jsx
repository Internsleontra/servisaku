import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { auditLog } from '@/lib/security';
import { useTranslation } from '@/lib/useTranslation';

/**
 * React Error Boundary — catches unhandled render errors,
 * logs them to the audit queue, and shows a safe recovery UI.
 */
/* The fallback is a function component so it can translate. useLanguage falls
   back to a default context when no provider is mounted, so this still renders
   even if the failure happened above LanguageProvider. */
function ErrorFallback({ errorId, onReset }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 text-center font-inter">
      <div className="w-16 h-16 bg-danger-tint rounded-2xl flex items-center justify-center mb-5">
        <AlertTriangle className="h-8 w-8 text-danger" />
      </div>
      <h2 className="text-xl font-semibold mb-2">{t('Something went wrong')}</h2>
      <p className="text-sm text-ink-secondary mb-1 max-w-xs">
        {t('An unexpected error occurred. Your data is safe.')}
      </p>
      <p className="text-[10px] text-ink-secondary mb-6 font-mono">
        {t('Ref:')} {errorId}
      </p>
      <button
        onClick={onReset}
        className="flex items-center gap-2 bg-brand text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-brand/90 transition-colors"
      >
        <RefreshCw className="h-4 w-4" /> {t('Return to Home')}
      </button>
    </div>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorId: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true, errorId: `ERR_${Date.now().toString(36).toUpperCase()}` };
  }

  componentDidCatch(error, info) {
    // Log to audit queue (persisted on next flush)
    auditLog('RENDER_ERROR', {
      message: error?.message?.slice(0, 200),
      component: info?.componentStack?.split('\n')[1]?.trim()?.slice(0, 100),
    });

    // Never expose full stack traces to the user
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, errorId: null });
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return <ErrorFallback errorId={this.state.errorId} onReset={this.handleReset} />;
  }
}