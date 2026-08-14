import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Home, Lock, Eye, EyeOff, ArrowRight, CheckCircle2 } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ds';
import { toast } from 'sonner';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { checkUserAuth } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleReset = async () => {
    if (!token) { toast.error('This reset link is invalid.'); return; }
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (password !== confirm) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      await servisaku.auth.resetPassword(token, password);
      if (checkUserAuth) await checkUserAuth();
      setDone(true);
      toast.success('Password updated! You are now signed in.');
      setTimeout(() => navigate('/'), 1200);
    } catch (err) {
      toast.error(err.message || 'This reset link is invalid or has expired.');
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-grad-hero p-6">
      <div className="w-full max-w-md rounded-card bg-surface p-6 shadow-e3 md:p-8">
        <Link to="/" className="inline-flex items-center gap-2 mb-8">
          <div className="bg-brand text-white p-2 rounded-lg shadow-sm"><Home className="h-5 w-5" /></div>
          <span className="text-2xl font-display font-semibold text-ink tracking-tight">Servis<span className="text-brand">Aku</span></span>
        </Link>

        {done ? (
          <div className="bg-surface rounded-2xl border border-hairline/40 p-8 text-center">
            <div className="w-20 h-20 bg-success-tint rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
            <h1 className="text-2xl font-display font-semibold text-ink">Password updated</h1>
            <p className="text-ink-secondary mt-2">Redirecting you in…</p>
          </div>
        ) : (
          <div className="bg-surface rounded-2xl border border-hairline/40 p-8">
            <h1 className="text-3xl font-display font-semibold mb-2 text-ink">Set a new password</h1>
            <p className="text-ink-secondary mb-8">Choose a strong password you don't use elsewhere.</p>

            {!token && (
              <div className="bg-danger-tint border border-danger/30 rounded-xl p-4 text-sm text-danger mb-6">
                This reset link is missing or invalid. Please request a new one from the login page.
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink pl-1">New password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-tertiary" />
                  <input type={show ? 'text' : 'password'} placeholder="••••••••" aria-label="New password" value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full bg-raised rounded-xl pl-12 pr-12 py-3.5 text-sm outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink transition-all" />
                  <button onClick={() => setShow(!show)} aria-label="Toggle password visibility"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink">
                    {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink pl-1">Confirm password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-tertiary" />
                  <input type={show ? 'text' : 'password'} placeholder="••••••••" aria-label="New password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    className="w-full bg-raised rounded-xl pl-12 pr-4 py-3.5 text-sm outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink transition-all"
                    onKeyDown={e => e.key === 'Enter' && handleReset()} />
                </div>
              </div>

              {/* Paint comes from the `primary` variant. A call-site `bg-brand`
                  does not layer over `bg-grad-brand` — tailwind-merge treats them
                  as the same group and drops the gradient entirely. */}
              <Button onClick={handleReset} disabled={loading || !token || !password || !confirm}
                block size="lg" className="mt-4 text-base">
                {loading ? 'Updating…' : 'Update password'} <ArrowRight className="h-5 w-5 ml-2" />
              </Button>

              <div className="text-center pt-2">
                <Link to="/otp-login" className="text-sm font-semibold text-brand hover:underline">Back to sign in</Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
