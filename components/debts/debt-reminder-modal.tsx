'use client';

import { useEffect, useState } from 'react';

type Debt = { id: string; debtor_name: string; debtor_phone?: string | null; remaining_amount: number; created_at: string; note?: string | null };
function money(value: number) { return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value); }

export function DebtReminderModal({ debts, userId, today }: { debts: Debt[]; userId: string; today: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (debts.length === 0) return;
    const key = `fryva-debt-reminder:${userId}:${today}`;
    if (window.localStorage.getItem(key) !== 'seen') setOpen(true);
  }, [debts.length, today, userId]);
  const close = () => { window.localStorage.setItem(`fryva-debt-reminder:${userId}:${today}`, 'seen'); setOpen(false); };
  if (!open) return null;
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card"><h2 className="section-title">Debt Follow-up Reminder</h2><p>Before closing today, remember to follow up and record payment for these debts.</p><div className="list-stack">{debts.slice(0, 8).map((debt) => <div key={debt.id} className="row-card"><strong>{debt.debtor_name}</strong><p className="section-subtitle">{debt.debtor_phone ? `${debt.debtor_phone} · ` : ''}{money(debt.remaining_amount)} remaining · {new Date(debt.created_at).toLocaleDateString('en-KE')}</p>{debt.note ? <p className="section-subtitle">{debt.note}</p> : null}</div>)}</div><button type="button" className="btn btn-primary" style={{ marginTop: 12, width: '100%' }} onClick={close}>I will follow up</button></div></div>;
}
