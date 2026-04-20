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

  const rows = useMemo(
    () => items.map((item) => ({ ...item, qty: Number(values[item.id] || '0') })),
    [items, values],
  );

  const saveBulk = () => {
    setError(null);
    setSuccess(null);
    const changed = rows.filter((row) => !Number.isNaN(row.qty) && row.qty >= 0);
    if (changed.length === 0) {
      setError('Enter at least one quantity.');
      return;
    }

    startTransition(async () => {
      const result = await recordOpeningStockAction({
        entry_date: entryDate,
        note: note || undefined,
        items: changed.map((row) => ({ menu_item_id: row.id, qty: row.qty })),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSuccess('Opening stock saved. Same-day edits will create revision history.');
    });
  };

  return (
    <section className="space-y-4">
      <div className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
        <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="rounded border px-3 py-2 text-sm" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="rounded border px-3 py-2 text-sm" />
        <button type="button" onClick={saveBulk} disabled={isPending} className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {isPending ? 'Saving...' : 'Save bulk stock'}
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[1fr_120px] items-center gap-3 rounded border p-3">
            <div>
              <p className="text-sm font-semibold">{row.name}</p>
              <p className="text-xs text-slate-500">{row.category_name}</p>
            </div>
            <input
              inputMode="decimal"
              value={values[row.id] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [row.id]: e.target.value }))}
              placeholder="Qty"
              className="rounded border px-3 py-2 text-right text-sm"
            />
          </div>
        ))}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-green-700">{success}</p> : null}
    </section>
  );
}
