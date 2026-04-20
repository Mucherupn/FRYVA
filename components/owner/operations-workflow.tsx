'use client';

import { useState, useTransition } from 'react';
import {
  closeDayAction,
  createReconciliationAction,
  voidExpenseAction,
  voidPurchaseAction,
  voidSaleAction,
  writeOffDebtAction,
} from '@/app/(dashboard)/owner/operations/actions';

function Notice({ message, ok }: { message: string; ok: boolean }) {
  return <p className={`text-xs ${ok ? 'text-emerald-700' : 'text-red-700'}`}>{message}</p>;
}

export function OperationsWorkflow({ today }: { today: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setMsg(null);
    startTransition(async () => {
      const result = await fn();
      setMsg(result.ok ? { ok: true, text: 'Saved successfully.' } : { ok: false, text: result.error ?? 'Action failed.' });
    });
  };

  return (
    <div className="space-y-5">
      {msg ? <Notice message={msg.text} ok={msg.ok} /> : null}

      <section className="rounded border p-3">
        <h2 className="text-sm font-semibold">Sale void</h2>
        <p className="mb-2 text-xs text-slate-500">Creates reversal entries and preserves original sale record.</p>
        <form
          className="grid gap-2 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            submit(() => voidSaleAction({ sale_id: String(form.get('sale_id') || ''), reason: String(form.get('reason') || '') }));
          }}
        >
          <input name="sale_id" placeholder="Sale UUID" className="rounded border px-2 py-1 text-sm" required />
          <input name="reason" placeholder="Reason" className="rounded border px-2 py-1 text-sm" required />
          <button disabled={pending} className="rounded bg-black px-3 py-2 text-sm text-white">Void sale</button>
        </form>
      </section>

      <section className="rounded border p-3">
        <h2 className="text-sm font-semibold">Expense void</h2>
        <form
          className="grid gap-2 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            submit(() => voidExpenseAction({ expense_id: String(form.get('expense_id') || ''), reason: String(form.get('reason') || '') }));
          }}
        >
          <input name="expense_id" placeholder="Expense UUID" className="rounded border px-2 py-1 text-sm" required />
          <input name="reason" placeholder="Reason" className="rounded border px-2 py-1 text-sm" required />
          <button disabled={pending} className="rounded bg-black px-3 py-2 text-sm text-white">Void expense</button>
        </form>
      </section>

      <section className="rounded border p-3">
        <h2 className="text-sm font-semibold">Purchase void</h2>
        <form
          className="grid gap-2 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            submit(() => voidPurchaseAction({ purchase_id: String(form.get('purchase_id') || ''), reason: String(form.get('reason') || '') }));
          }}
        >
          <input name="purchase_id" placeholder="Purchase UUID" className="rounded border px-2 py-1 text-sm" required />
          <input name="reason" placeholder="Reason" className="rounded border px-2 py-1 text-sm" required />
          <button disabled={pending} className="rounded bg-black px-3 py-2 text-sm text-white">Void purchase</button>
        </form>
      </section>

      <section className="rounded border p-3">
        <h2 className="text-sm font-semibold">Cash / Mpesa reconciliation</h2>
        <form
          className="grid gap-2 md:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            submit(() =>
              createReconciliationAction({
                recon_type: String(form.get('recon_type') || 'cash') as 'cash' | 'mpesa',
                actual_balance: Number(form.get('actual_balance')),
                recon_date: String(form.get('recon_date') || today),
                note: String(form.get('note') || ''),
              }),
            );
          }}
        >
          <select name="recon_type" className="rounded border px-2 py-1 text-sm"><option value="cash">Cash</option><option value="mpesa">Mpesa</option></select>
          <input name="actual_balance" placeholder="Actual balance" type="number" step="0.01" className="rounded border px-2 py-1 text-sm" required />
          <input name="recon_date" defaultValue={today} type="date" className="rounded border px-2 py-1 text-sm" required />
          <input name="note" placeholder="Variance note" className="rounded border px-2 py-1 text-sm" />
          <button disabled={pending} className="rounded bg-black px-3 py-2 text-sm text-white">Save reconciliation</button>
        </form>
      </section>

      <section className="rounded border p-3">
        <h2 className="text-sm font-semibold">Debt write-off foundation (owner)</h2>
        <form
          className="grid gap-2 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            submit(() => writeOffDebtAction({ debt_id: String(form.get('debt_id') || ''), reason: String(form.get('reason') || '') }));
          }}
        >
          <input name="debt_id" placeholder="Debt UUID" className="rounded border px-2 py-1 text-sm" required />
          <input name="reason" placeholder="Reason" className="rounded border px-2 py-1 text-sm" required />
          <button disabled={pending} className="rounded bg-black px-3 py-2 text-sm text-white">Write off debt</button>
        </form>
      </section>

      <section className="rounded border p-3">
        <h2 className="text-sm font-semibold">End of day close</h2>
        <form
          className="grid gap-2 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            submit(() => closeDayAction({ close_date: String(form.get('close_date') || today), note: String(form.get('note') || '') }));
          }}
        >
          <input name="close_date" defaultValue={today} type="date" className="rounded border px-2 py-1 text-sm" required />
          <input name="note" placeholder="Optional closing note" className="rounded border px-2 py-1 text-sm" />
          <button disabled={pending} className="rounded bg-black px-3 py-2 text-sm text-white">Close day</button>
        </form>
      </section>
    </div>
  );
}
