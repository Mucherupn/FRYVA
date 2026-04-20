'use client';

import { useState, useTransition } from 'react';
import { recordProductionAction } from '@/app/(dashboard)/chef/production/actions';

type Item = { id: number; name: string };

export function ProductionWorkflow({ items, defaultDate }: { items: Item[]; defaultDate: string }) {
  const [entryDate, setEntryDate] = useState(defaultDate);
  const [menuItemId, setMenuItemId] = useState(items[0]?.id ?? 0);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    setSuccess(null);
    const qtyValue = Number(qty);
    if (!menuItemId || !qtyValue || qtyValue <= 0) {
      setError('Select item and enter quantity > 0.');
      return;
    }

    startTransition(async () => {
      const result = await recordProductionAction({ entry_date: entryDate, menu_item_id: menuItemId, qty: qtyValue, note: note || undefined });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess('Production entry saved.');
      setQty('');
      setNote('');
    });
  };

  return (
    <section className="space-y-3 rounded border p-4">
      <h2 className="font-semibold">Record production</h2>
      <div className="grid gap-3 md:grid-cols-4">
        <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="rounded border px-3 py-2 text-sm" />
        <select value={menuItemId} onChange={(e) => setMenuItemId(Number(e.target.value))} className="rounded border px-3 py-2 text-sm">
          {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Quantity" inputMode="decimal" className="rounded border px-3 py-2 text-sm" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="rounded border px-3 py-2 text-sm" />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-green-700">{success}</p> : null}
      <button type="button" disabled={isPending} onClick={submit} className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isPending ? 'Saving...' : 'Save production entry'}</button>
    </section>
  );
}
