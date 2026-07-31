import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ShieldAlert, ChevronRight } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { formatRM } from '@/lib/paymentEngine';

/**
 * Surfaces outstanding cash commission on the partner dashboard.
 *
 * Deliberately silent below the wallet's credit limit — a partner who owes a few
 * ringgit does not need a warning banner, and crying wolf there means the real
 * warning gets ignored. Renders nothing at all on failure or while loading, so a
 * wallet hiccup can never break the dashboard.
 */
export function OutstandingCommissionBanner() {
  const [wallet, setWallet] = useState(null);

  useEffect(() => {
    servisaku.wallet.detail().then(setWallet).catch(() => setWallet(null));
  }, []);

  if (!wallet) return null;

  const owed = wallet.outstanding_commission || 0;
  const frozen = wallet.is_frozen;
  if (!frozen && owed <= (wallet.credit_limit ?? 0)) return null;

  const tone = frozen
    ? 'border-red-200 bg-red-50 text-red-700'
    : 'border-amber-200 bg-amber-50 text-amber-800';

  return (
    <Link to="/partner/wallet" className={`flex items-start gap-3 rounded-2xl border p-4 transition-shadow hover:shadow-e1 ${tone}`}>
      {frozen
        ? <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">
          {frozen ? 'New jobs are paused' : `${formatRM(owed)} commission outstanding`}
        </p>
        <p className="mt-0.5 text-xs opacity-90">
          {frozen
            ? (wallet.freeze_reason || 'Settle your outstanding commission to start receiving jobs again.')
            : 'From cash jobs you collected in full. Settle to keep receiving new jobs.'}
        </p>
      </div>
      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
    </Link>
  );
}

export default OutstandingCommissionBanner;
