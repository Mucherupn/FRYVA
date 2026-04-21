'use client';

import { useMemo, useState, useTransition } from 'react';
import { recordOpeningStockAction } from '@/app/(dashboard)/chef/opening-stock/actions';

type Item = { id: number; name: string; category_name: string };

export function OpeningStockWorkflow({ items, defaultDate }: { items: Item[]; defaultDate: string }) {
  const [entryDate, setEntryDate] = useState(defaultDate);
  const [note, setNote] = useState('');
  const [values, setValues] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const rows = useMemo(() => items.map((item) => ({ ...item, qty: Number(values[item.id] || '0') })), [items, values]);

  const saveBulk = () => {
    setError(null); setSuccess(null);
    const changed = rows.filter((row) => !Number.isNaN(row.qty) && row.qty >= 0);
    if (changed.length === 0) return setError('Enter at least one quantity.');

    startTransition(async () => {
      const result = await recordOpeningStockAction({ entry_date: entryDate, note: note || undefined, items: changed.map((row) => ({ menu_item_id: row.id, qty: row.qty })) });
      if (!result.ok) return setError(result.error ?? 'Request failed.');
      setSuccess('Opening stock saved. Same-day edits create revision history.');
    });
  };

  return (
    <section className="panel">
      <h2 className="section-title">Bulk opening stock entry</h2>
      <div className="form-grid">
        <div className="form-col-4"><input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="input" /></div>
        <div className="form-col-8"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Batch note" className="input" /></div>
      </div>
      <div className="table-shell" style={{ marginTop: 12 }}>
        <table className="table">
          <thead><tr><th>Item</th><th>Category</th><th className="money">Qty</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}><td>{row.name}</td><td>{row.category_name}</td><td className="money"><input value={values[row.id] ?? ''} onChange={(e) => setValues((prev) => ({ ...prev, [row.id]: e.target.value }))} className="input" style={{ width: 96, marginLeft: 'auto' }} /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <p className="alert alert-error" style={{ marginTop: 10 }}>{error}</p> : null}
      {success ? <p className="alert alert-success" style={{ marginTop: 10 }}>{success}</p> : null}
      <button type="button" onClick={saveBulk} disabled={isPending} className="btn btn-primary" style={{ marginTop: 10 }}>{isPending ? 'Saving...' : 'Save bulk stock'}</button>
    </section>
  );
}
