import { useState } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { formatMYR } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/useTranslation';

const STATUS_PILL = {
  pending: 'bg-warning-tint text-warning',
  approved: 'bg-success-tint text-success',
  rejected: 'bg-danger-tint text-danger',
};

// Shared extra-services panel.
// mode="partner" + editable → can propose extras. mode="consumer" → approve/reject pending.
export function ExtraServices({ extras = [], mode, editable = false, onAdd, onDecide, busy = false }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');

  const reset = () => { setLabel(''); setPrice(''); setQty('1'); setAdding(false); };
  const submit = async () => {
    const unit_price = Number(price);
    const q = Number(qty) || 1;
    if (!label.trim() || !(unit_price > 0)) return;
    await onAdd({ label: label.trim(), unit_price, qty: q });
    reset();
  };

  return (
    <div className="space-y-3">
      {extras.length === 0 && !adding && (
        <p className="text-xs text-ink-tertiary">No extra services {mode === 'partner' ? 'added' : 'proposed'} yet.</p>
      )}

      {extras.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-hairline/10 bg-raised/30 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ink">
              {e.label}{e.qty > 1 && <span className="text-ink-tertiary"> × {e.qty}</span>}
            </p>
            <p className="text-[11px] font-semibold text-brand">{formatMYR(e.total)}</p>
          </div>
          {mode === 'consumer' && e.status === 'pending' ? (
            <div className="flex shrink-0 gap-1.5">
              <button disabled={busy} onClick={() => onDecide(e.id, 'rejected')}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-hairline/20 text-ink-secondary transition-colors hover:border-danger/30 hover:text-danger disabled:opacity-50">
                <X className="h-4 w-4" />
              </button>
              <button disabled={busy} onClick={() => onDecide(e.id, 'approved')}
                className="flex h-8 items-center gap-1 rounded-lg bg-success px-3 text-xs font-semibold text-white transition-colors hover:bg-success disabled:opacity-50">
                <Check className="h-3.5 w-3.5" />{t('Approve')}</button>
            </div>
          ) : (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_PILL[e.status] || STATUS_PILL.pending}`}>
              {e.status}
            </span>
          )}
        </div>
      ))}

      {mode === 'partner' && editable && (
        adding ? (
          <div className="space-y-2 rounded-xl border border-hairline/20 p-3">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('e.g. MCB replacement')}
              className="w-full rounded-lg bg-raised px-3 py-2 text-sm text-ink outline-none focus:ring-1 focus:ring-brand" />
            <div className="flex gap-2">
              <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder={t('Price (RM)')}
                className="flex-1 rounded-lg bg-raised px-3 py-2 text-sm text-ink outline-none focus:ring-1 focus:ring-brand" />
              <input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder={t('Qty')}
                className="w-16 rounded-lg bg-raised px-3 py-2 text-sm text-ink outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div className="flex gap-2">
              <Button onClick={submit} disabled={busy || !label.trim() || !(Number(price) > 0)}
                className="h-9 flex-1 rounded-lg bg-brand text-xs text-white hover:bg-brand/90">{t('Send for approval')}</Button>
              <Button onClick={reset} variant="outline" className="h-9 rounded-lg text-xs">{t('Cancel')}</Button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-hairline/40 py-2.5 text-xs font-semibold text-brand transition-colors hover:border-brand">
            <Plus className="h-4 w-4" />{t('Add extra service')}</button>
        )
      )}
    </div>
  );
}
