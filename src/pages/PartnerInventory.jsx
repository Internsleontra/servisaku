import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Minus, Trash2, AlertTriangle, Package, Boxes, Wrench } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { SectionHeader } from '@/components/partner/SectionHeader';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const TYPES = [
  { id: 'product', label: 'Products', icon: Package },
  { id: 'consumable', label: 'Consumables', icon: Boxes },
  { id: 'equipment', label: 'Equipment', icon: Wrench },
];

function Card({ children, className = '' }) {
  return <div className={`bg-surface rounded-2xl border border-hairline/10 shadow-e1 p-4 ${className}`}>{children}</div>;
}

export default function PartnerInventory() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'consumable', qty: '0', unit: '', low_stock_threshold: '2' });
  const [busy, setBusy] = useState(false);

  // `items === null` is the loading sentinel, so an unhandled rejection left
  // this page spinning forever (a non-partner account gets 403 "Partners only").
  useEffect(() => {
    servisaku.inventory.list()
      .then(setItems)
      .catch(e => { toast.error(e?.message || 'Could not load your items'); setItems([]); });
  }, []);

  const adjust = async (item, delta) => {
    const next = Math.max(0, item.qty + delta);
    setItems((xs) => xs.map((x) => x.id === item.id ? { ...x, qty: next, low_stock: next <= x.low_stock_threshold } : x));
    try { await servisaku.inventory.update(item.id, { qty: next }); }
    catch (e) { toast.error(e.message || 'Update failed'); servisaku.inventory.list().then(setItems); }
  };

  const remove = async (item) => {
    setItems((xs) => xs.filter((x) => x.id !== item.id));
    try { await servisaku.inventory.remove(item.id); } catch (e) { toast.error(e.message || 'Delete failed'); }
  };

  const add = async () => {
    if (!form.name.trim()) return toast.error('Enter an item name');
    setBusy(true);
    try {
      const created = await servisaku.inventory.create({
        name: form.name.trim(), type: form.type,
        qty: Number(form.qty) || 0, unit: form.unit.trim() || undefined,
        low_stock_threshold: Number(form.low_stock_threshold) || 0,
      });
      setItems((xs) => [...(xs || []), created]);
      setForm({ name: '', type: 'consumable', qty: '0', unit: '', low_stock_threshold: '2' });
      setShowForm(false);
      toast.success('Item added');
    } catch (e) { toast.error(e.message || 'Could not add'); } finally { setBusy(false); }
  };

  if (!items) return (
    <div className="flex justify-center pt-32"><div className="w-6 h-6 border-2 border-raised border-t-brand rounded-full animate-spin" /></div>
  );

  const lowStock = items.filter((i) => i.low_stock);

  return (
    <div className="min-h-screen bg-bg font-inter" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
      <div className="bg-gradient-to-br from-brand-ink via-brand to-brand/80 px-5 lg:px-8 pt-14 lg:pt-8 pb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <ArrowLeft className="h-4 w-4 text-white" />
            </button>
            <div><p className="text-white/60 text-xs">Inventory</p><h1 className="text-xl font-bold text-white">Your stock</h1></div>
          </div>
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-sm font-bold text-brand">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>

      <div className="px-5 lg:px-8 max-w-2xl mx-auto pt-5 space-y-5">
        {lowStock.length > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200/60 bg-amber-50 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-xs font-medium text-amber-800">{lowStock.length} item{lowStock.length > 1 ? 's' : ''} low on stock — {lowStock.map((i) => i.name).join(', ')}</p>
          </div>
        )}

        {showForm && (
          <Card className="space-y-3">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Item name (e.g. Cable ties)"
              className="w-full rounded-xl bg-raised px-3 py-2.5 text-sm text-ink outline-none focus:ring-1 focus:ring-brand" />
            <div className="flex gap-2">
              {TYPES.map((t) => (
                <button key={t.id} onClick={() => setForm((f) => ({ ...f, type: t.id }))}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${form.type === t.id ? 'bg-brand text-white' : 'bg-raised text-ink-secondary'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-[11px] text-ink-secondary">Qty
                <input value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value.replace(/\D/g, '') }))} inputMode="numeric"
                  className="mt-1 w-full rounded-lg bg-raised px-3 py-2 text-sm text-ink outline-none" />
              </label>
              <label className="flex-1 text-[11px] text-ink-secondary">Unit
                <input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="pcs / m / L"
                  className="mt-1 w-full rounded-lg bg-raised px-3 py-2 text-sm text-ink outline-none" />
              </label>
              <label className="flex-1 text-[11px] text-ink-secondary">Low at
                <input value={form.low_stock_threshold} onChange={(e) => setForm((f) => ({ ...f, low_stock_threshold: e.target.value.replace(/\D/g, '') }))} inputMode="numeric"
                  className="mt-1 w-full rounded-lg bg-raised px-3 py-2 text-sm text-ink outline-none" />
              </label>
            </div>
            <Button onClick={add} disabled={busy} className="w-full h-10 rounded-xl bg-brand text-white hover:bg-brand/90">{busy ? 'Adding…' : 'Add item'}</Button>
          </Card>
        )}

        {TYPES.map((t) => {
          const group = items.filter((i) => i.type === t.id);
          if (group.length === 0) return null;
          return (
            <div key={t.id} className="space-y-3">
              <SectionHeader title={t.label} />
              {group.map((i) => (
                <Card key={i.id} className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${i.low_stock ? 'bg-amber-50 text-amber-600' : 'bg-brand-tint text-brand'}`}>
                    <t.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{i.name}</p>
                    <p className="text-[11px] text-ink-secondary">{i.low_stock ? <span className="font-semibold text-amber-600">Low stock</span> : `Min ${i.low_stock_threshold}${i.unit ? ' ' + i.unit : ''}`}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => adjust(i, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-hairline/20 text-ink-secondary hover:bg-raised"><Minus className="h-4 w-4" /></button>
                    <span className="w-10 text-center text-sm font-bold text-ink">{i.qty}<span className="text-[10px] font-normal text-ink-tertiary">{i.unit ? ` ${i.unit}` : ''}</span></span>
                    <button onClick={() => adjust(i, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-hairline/20 text-ink-secondary hover:bg-raised"><Plus className="h-4 w-4" /></button>
                    <button onClick={() => remove(i)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-tertiary hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </Card>
              ))}
            </div>
          );
        })}

        {items.length === 0 && !showForm && (
          <Card className="text-center py-12"><p className="text-sm text-ink-secondary">No inventory yet — add your tools & consumables</p></Card>
        )}
      </div>
    </div>
  );
}
