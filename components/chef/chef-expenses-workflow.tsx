'use client';

import { useState, useTransition } from 'react';
import { recordChefExpenseAction } from '@/app/(dashboard)/chef/expenses/actions';

export function ChefExpensesWorkflow({ defaultDate }: { defaultDate: string }) {
  const [form, setForm] = useState({ description: '', category: '', amount: '', payment_method: 'cash' as 'cash' | 'mpesa', note: '', expense_date: defaultDate });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null); setSuccess(null);
    const amount = Number(form.amount);
    if (!form.description.trim() || !amount || amount <= 0) return setError('Description and amount > 0 are required.');
    startTransition(async () => {
      const result = await recordChefExpenseAction({ ...form, amount, category: form.category || undefined, note: form.note || undefined });
      if (!result.ok) return setError(result.error ?? 'Failed to save kitchen expense.');
      setSuccess('Kitchen expense saved and posted to ledger.');
      setForm((prev) => ({ ...prev, description: '', amount: '', note: '' }));
    });
  };

  return (
    <section className="panel">
      <h2 className="section-title">Record kitchen expense</h2>
      <div className="form-grid">
        <div className="form-col-6"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="input" /></div>
        <div className="form-col-6"><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" className="input" /></div>
        <div className="form-col-4"><input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" className="input" /></div>
        <div className="form-col-4"><select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value as 'cash' | 'mpesa' })} className="select"><option value="cash">Cash</option><option value="mpesa">Mpesa</option></select></div>
        <div className="form-col-4"><input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} className="input" /></div>
        <div className="form-col-12"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Note" className="input" /></div>
      </div>
      {error ? <p className="alert alert-error" style={{ marginTop: 10 }}>{error}</p> : null}
      {success ? <p className="alert alert-success" style={{ marginTop: 10 }}>{success}</p> : null}
      <button type="button" onClick={submit} disabled={isPending} className="btn btn-primary" style={{ marginTop: 10 }}>{isPending ? 'Saving...' : 'Save kitchen expense'}</button>
    </section>
  );
}
