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
    setError(null); setSuccess(null);
    const qtyValue = Number(qty);
    if (!menuItemId || !qtyValue || qtyValue <= 0) return setError('Select item and enter quantity > 0.');

    startTransition(async () => {
      const result = await recordProductionAction({ entry_date: entryDate, menu_item_id: menuItemId, qty: qtyValue, note: note || undefined });
      if (!result.ok) return setError(result.error);
      setSuccess('Production entry saved.');
      setQty(''); setNote('');
    });
  };

  return (
    <section className="panel">
      <h2 className="section-title">Record production</h2>
      <div className="form-grid">
        <div className="form-col-3"><input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="input" /></div>
        <div className="form-col-4"><select value={menuItemId} onChange={(e) => setMenuItemId(Number(e.target.value))} className="select">{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="form-col-2"><input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" className="input" /></div>
        <div className="form-col-3"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" className="input" /></div>
      </div>
      {error ? <p className="alert alert-error" style={{ marginTop: 10 }}>{error}</p> : null}
      {success ? <p className="alert alert-success" style={{ marginTop: 10 }}>{success}</p> : null}
      <button type="button" disabled={isPending} onClick={submit} className="btn btn-primary" style={{ marginTop: 10 }}>{isPending ? 'Saving...' : 'Save production entry'}</button>
    </section>
  );
}
