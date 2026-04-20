'use client';

import { useMemo, useState, useTransition } from 'react';
import { recordDebtPaymentAction } from '@/app/(dashboard)/waiter/debts/actions';

type DebtRow = {
  id: string;
  status: 'unpaid' | 'partial' | 'paid' | 'written_off';
  original_amount: number;
  remaining_amount: number;
  created_at: string;
  assigned_waiter_name: string;
  debtor_name: string;
  debtor_phone: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value);
}

export function DebtsWorkflow({ debts, ownerMode }: { debts: DebtRow[]; ownerMode: boolean }) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all');
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa'>('cash');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visibleDebts = useMemo(
    () => debts.filter((debt) => (statusFilter === 'all' ? true : debt.status === statusFilter)),
    [debts, statusFilter],
  );

  const selectedDebt = visibleDebts.find((debt) => debt.id === selectedDebtId) ?? null;

  const submitPayment = () => {
    if (!selectedDebt) {
      setError('Select a debt first.');
      return;
    }

    const value = Number(amount);
    if (!value || value <= 0) {
      setError('Enter a valid payment amount.');
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await recordDebtPaymentAction({
        debt_id: selectedDebt.id,
        amount: value,
        payment_method: paymentMethod,
        note: note || undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSuccess('Payment recorded successfully.');
      setAmount('');
      setNote('');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'unpaid', 'partial', 'paid'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={`rounded border px-3 py-1 text-xs uppercase ${statusFilter === value ? 'bg-black text-white' : ''}`}
          >
            {value}
          </button>
        ))}
      </div>

      {visibleDebts.length === 0 ? (
        <p className="rounded border border-dashed p-4 text-sm text-slate-500">No debts found for this filter.</p>
      ) : (
        <div className="space-y-2">
          {visibleDebts.map((debt) => (
            <button
              type="button"
              key={debt.id}
              onClick={() => setSelectedDebtId(debt.id)}
              className={`w-full rounded border p-3 text-left text-sm ${selectedDebtId === debt.id ? 'border-black' : ''}`}
            >
              <p className="font-semibold">{debt.debtor_name} · {money(debt.remaining_amount)} remaining</p>
              <p className="text-xs text-slate-500">
                Status: {debt.status} · Created: {new Date(debt.created_at).toLocaleDateString()} {ownerMode ? `· Waiter: ${debt.assigned_waiter_name}` : ''}
              </p>
            </button>
          ))}
        </div>
      )}

      {selectedDebt ? (
        <section className="space-y-3 rounded-lg border p-4">
          <h3 className="font-semibold">Record payment</h3>
          <p className="text-xs text-slate-600">
            Debtor: {selectedDebt.debtor_name} ({selectedDebt.debtor_phone || 'No phone'}) · Outstanding: {money(selectedDebt.remaining_amount)}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              className="rounded border px-3 py-2 text-sm"
              inputMode="decimal"
            />
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'mpesa')}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="cash">Cash</option>
              <option value="mpesa">Mpesa</option>
            </select>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              className="rounded border px-3 py-2 text-sm"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {success ? <p className="text-sm text-green-700">{success}</p> : null}
          <button
            type="button"
            disabled={isPending}
            onClick={submitPayment}
            className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isPending ? 'Saving...' : 'Save payment'}
          </button>
        </section>
      ) : null}
    </div>
  );
}
