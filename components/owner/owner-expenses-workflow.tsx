'use client';

import { useState, useTransition } from 'react';
import { recordOwnerExpenseAction } from '@/app/(dashboard)/owner/expenses/actions';

export function OwnerExpensesWorkflow({ defaultDate }: { defaultDate: string }) {
  const [form, setForm] = useState({ description: '', category: '', amount: '', payment_method: 'cash' as 'cash' | 'mpesa', note: '', expense_date: defaultDate });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    const amount = Number(form.amount);
    if (!form.description.trim() || !amount || amount <= 0) {
      setError('Description and amount > 0 are required.');
      return;
    }
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await recordOwnerExpenseAction({ ...form, amount, category: form.category || undefined, note: form.note || undefined });
      if (!result.ok) return setError(result.error);
      setSuccess('Expense saved and posted to ledger.');
      setForm((prev) => ({ ...prev, description: '', amount: '', note: '' }));
    });
  };

  return (
    <section className="space-y-3 rounded border p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="rounded border px-3 py-2 text-sm" />
        <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" className="rounded border px-3 py-2 text-sm" />
        <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" placeholder="Amount" className="rounded border px-3 py-2 text-sm" />
        <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value as 'cash' | 'mpesa' })} className="rounded border px-3 py-2 text-sm"><option value="cash">Cash</option><option value="mpesa">Mpesa</option></select>
        <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} className="rounded border px-3 py-2 text-sm" />
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Note (optional)" className="rounded border px-3 py-2 text-sm" />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-green-700">{success}</p> : null}
      <button type="button" onClick={submit} disabled={isPending} className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isPending ? 'Saving...' : 'Save expense'}</button>
    </section>
  );
}
