'use client';

import { useMemo, useState, useTransition } from 'react';
import { recordDebtPaymentAction } from '@/app/(dashboard)/waiter/debts/actions';
import { EmptyState, StatusChip } from '@/components/ui/fryva-ui';

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

  const visibleDebts = useMemo(() => debts.filter((debt) => (statusFilter === 'all' ? true : debt.status === statusFilter)), [debts, statusFilter]);
  const selectedDebt = visibleDebts.find((debt) => debt.id === selectedDebtId) ?? null;

  const submitPayment = () => {
    if (!selectedDebt) return setError('Select a debt first.');
    const value = Number(amount);
    if (!value || value <= 0) return setError('Enter a valid payment amount.');

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await recordDebtPaymentAction({ debt_id: selectedDebt.id, amount: value, payment_method: paymentMethod, note: note || undefined });
      if (!result.ok) return setError(result.error ?? 'Request failed.');
      setSuccess('Payment recorded successfully.');
      setAmount('');
      setNote('');
    });
  };

  return (
    <div className="list-stack">
      <div className="filter-bar" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
        {(['all', 'unpaid', 'partial', 'paid'] as const).map((value) => (
          <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`btn ${statusFilter === value ? 'btn-primary' : 'btn-secondary'}`}>
            {value}
          </button>
        ))}
      </div>

      {visibleDebts.length === 0 ? (
        <EmptyState title="No debts found" description="Adjust filters or create debt sales from POS." />
      ) : (
        <div className="list-stack">
          {visibleDebts.map((debt) => (
            <button type="button" key={debt.id} onClick={() => setSelectedDebtId(debt.id)} className="row-card" style={{ textAlign: 'left', borderColor: selectedDebtId === debt.id ? '#c1121f' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <p style={{ margin: 0, fontWeight: 650 }}>{debt.debtor_name}</p>
                <StatusChip status={debt.status} />
              </div>
              <p style={{ margin: '6px 0 0', fontWeight: 700 }}>{money(debt.remaining_amount)} remaining</p>
              <p className="section-subtitle" style={{ marginTop: 6 }}>
                Original {money(debt.original_amount)} · {new Date(debt.created_at).toLocaleDateString()} {ownerMode ? `· ${debt.assigned_waiter_name}` : ''}
              </p>
            </button>
          ))}
        </div>
      )}

      {selectedDebt ? (
        <section className="panel">
          <h3 className="section-title">Record payment</h3>
          <p className="section-subtitle">Debtor: {selectedDebt.debtor_name} ({selectedDebt.debtor_phone || 'No phone'}) · Outstanding {money(selectedDebt.remaining_amount)}</p>
          <div className="form-grid" style={{ marginTop: 10 }}>
            <div className="form-col-4"><input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="input" inputMode="decimal" /></div>
            <div className="form-col-4">
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'mpesa')} className="select"><option value="cash">Cash</option><option value="mpesa">Mpesa</option></select>
            </div>
            <div className="form-col-4"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="input" /></div>
          </div>
          {error ? <p className="alert alert-error" style={{ marginTop: 10 }}>{error}</p> : null}
          {success ? <p className="alert alert-success" style={{ marginTop: 10 }}>{success}</p> : null}
          <button type="button" disabled={isPending} onClick={submitPayment} className="btn btn-primary" style={{ marginTop: 10, width: '100%' }}>
            {isPending ? 'Saving...' : 'Save payment'}
          </button>
        </section>
      ) : null}
    </div>
  );
}
