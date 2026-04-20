'use client';

import { useMemo, useState, useTransition } from 'react';
import { recordPurchaseAction } from '@/app/(dashboard)/owner/purchases/actions';

type MenuOption = { id: number; name: string; category?: string | null };

export function PurchasesWorkflow({ defaultDate, menuItems }: { defaultDate: string; menuItems: MenuOption[] }) {
  const [form, setForm] = useState({ item_name: '', category: '', qty: '', unit: '', unit_cost: '', total_cost: '', supplier: '', payment_method: 'cash' as 'cash' | 'mpesa', note: '', purchase_date: defaultDate, menu_item_id: '' });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const computedTotal = useMemo(() => (Number(form.qty) || 0) * (Number(form.unit_cost) || 0), [form.qty, form.unit_cost]);

  const submit = () => {
    setError(null);
    setSuccess(null);
    const qty = Number(form.qty);
    const unit_cost = Number(form.unit_cost);
    const total_cost = Number(form.total_cost || computedTotal);
    if (!form.item_name.trim() || !form.unit.trim() || qty <= 0 || unit_cost < 0 || total_cost <= 0) {
      setError('Fill required fields with positive values.');
      return;
    }

    startTransition(async () => {
      const result = await recordPurchaseAction({
        ...form,
        qty,
        unit_cost,
        total_cost,
        category: form.category || undefined,
        supplier: form.supplier || undefined,
        note: form.note || undefined,
        menu_item_id: form.menu_item_id ? Number(form.menu_item_id) : undefined,
      });
      if (!result.ok) return setError(result.error);
      setSuccess('Purchase saved and posted to ledger.');
      setForm((prev) => ({ ...prev, item_name: '', qty: '', unit_cost: '', total_cost: '', note: '' }));
    });
  };

  return (
    <section className="space-y-3 rounded border p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <select
          value={form.menu_item_id}
          onChange={(e) => {
            const value = e.target.value;
            const matched = menuItems.find((item) => String(item.id) === value);
            setForm({
              ...form,
              menu_item_id: value,
              item_name: matched ? matched.name : form.item_name,
              category: matched?.category ?? form.category,
            });
          }}
          className="rounded border px-3 py-2 text-sm"
        >
          <option value="">Link to menu item (recommended)</option>
          {menuItems.map((item) => (
            <option key={item.id} value={item.id}>{item.name}{item.category ? ` (${item.category})` : ''}</option>
          ))}
        </select>
        <input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} placeholder="Item name" className="rounded border px-3 py-2 text-sm" />
        <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" className="rounded border px-3 py-2 text-sm" />
        <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Supplier (optional)" className="rounded border px-3 py-2 text-sm" />
        <input value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="Quantity" inputMode="decimal" className="rounded border px-3 py-2 text-sm" />
        <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="Unit" className="rounded border px-3 py-2 text-sm" />
        <input value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} placeholder="Unit cost" inputMode="decimal" className="rounded border px-3 py-2 text-sm" />
        <input value={form.total_cost} onChange={(e) => setForm({ ...form, total_cost: e.target.value })} placeholder={`Total cost (${computedTotal.toFixed(2)})`} inputMode="decimal" className="rounded border px-3 py-2 text-sm" />
        <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value as 'cash' | 'mpesa' })} className="rounded border px-3 py-2 text-sm"><option value="cash">Cash</option><option value="mpesa">Mpesa</option></select>
        <input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className="rounded border px-3 py-2 text-sm" />
      </div>
      <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Note (optional)" className="w-full rounded border px-3 py-2 text-sm" rows={2} />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-green-700">{success}</p> : null}
      <button type="button" onClick={submit} disabled={isPending} className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isPending ? 'Saving...' : 'Save purchase'}</button>
    </section>
  );
}
