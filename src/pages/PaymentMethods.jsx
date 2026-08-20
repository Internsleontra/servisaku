import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Wallet, Building2, Star, Trash2, Plus, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/useTranslation';

// Mock saved methods — never store full PAN; integrate a PCI-compliant tokenizer
// (Stripe/Adyen/local FPX) before production.
const MOCK = [
  { id: 'p1', kind: 'card', brand: 'Visa', last4: '4242', isDefault: true },
  { id: 'p2', kind: 'card', brand: 'Mastercard', last4: '5309' },
  { id: 'p3', kind: 'fpx', bank: 'Maybank' },
  { id: 'p4', kind: 'ewallet', wallet: 'Touch ’n Go' },
  { id: 'p5', kind: 'ewallet', wallet: 'GrabPay' },
];
const ICON = { card: CreditCard, fpx: Building2, ewallet: Wallet };
const label = (m) => m.kind === 'card' ? `${m.brand} •••• ${m.last4}` : m.kind === 'fpx' ? `FPX · ${m.bank}` : m.wallet;

export default function PaymentMethods() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [methods, setMethods] = useState(null);

  useEffect(() => { const timer = setTimeout(() => setMethods(MOCK), 400); return () => clearTimeout(timer); }, []);

  const setDefault = (id) => { setMethods(ms => ms.map(m => ({ ...m, isDefault: m.id === id }))); toast.success(t('Default payment updated')); };
  const remove = (id) => { setMethods(ms => ms.filter(m => m.id !== id)); toast.success(t('Removed')); };

  return (
    <div className="font-inter min-h-screen bg-bg max-w-lg mx-auto">
      <div className="flex items-center gap-3 px-5 pt-12 pb-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-raised flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></button>
        <h1 className="text-xl font-semibold">{t('Payment methods')}</h1>
      </div>

      <div className="px-5 space-y-3 pb-10">
        {!methods ? (
          [0, 1, 2].map(i => <div key={i} className="h-16 bg-surface shadow-[inset_0_0_0_1px_rgb(var(--hairline))] rounded-2xl animate-pulse" />)
        ) : methods.map(m => {
          const Icon = ICON[m.kind] || CreditCard;
          return (
            <div key={m.id} className="bg-surface shadow-[inset_0_0_0_1px_rgb(var(--hairline))] rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-tint flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-brand" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{label(m)}</p>
                  <p className="text-[11px] text-ink-tertiary capitalize">{m.kind === 'ewallet' ? t('E-wallet') : m.kind}</p>
                </div>
                {m.isDefault && <span className="text-[9px] bg-success-tint text-success px-2 py-0.5 rounded-full font-semibold">{t('Default')}</span>}
              </div>
              <div className="flex gap-4 mt-3 pt-3 shadow-[inset_0_1px_0_rgb(var(--hairline))]">
                {!m.isDefault && (
                  <button onClick={() => setDefault(m.id)} className="flex items-center gap-1.5 text-xs font-semibold text-brand"><Star className="h-3.5 w-3.5" /> {t('Set default')}</button>
                )}
                <button onClick={() => remove(m.id)} className="flex items-center gap-1.5 text-xs font-semibold text-danger"><Trash2 className="h-3.5 w-3.5" /> {t('Remove')}</button>
              </div>
            </div>
          );
        })}

        <button onClick={() => toast.info(t('Add via secure tokenized checkout — coming soon'))}
          className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl shadow-[inset_0_0_0_1px_rgb(var(--hairline))] border-dashed border-hairline/20 text-sm font-semibold text-brand hover:border-brand transition-colors">
          <Plus className="h-4 w-4" /> {t('Add payment method')}
        </button>
        <p className="text-[11px] text-ink-secondary text-center flex items-center justify-center gap-1"><Lock className="h-3 w-3" /> {t('We never store full card numbers. Cards are tokenized by our PCI-compliant provider.')}</p>
      </div>
    </div>
  );
}
