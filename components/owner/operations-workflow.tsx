'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { closeDayAction, createReconciliationAction, voidExpenseAction, voidPurchaseAction, voidSaleAction, writeOffDebtAction } from '@/app/(dashboard)/owner/operations/actions';

function Block({ title, hint, children, danger = false }: { title: string; hint?: string; children: ReactNode; danger?: boolean }) {
  return <section className="panel" style={{ borderColor: danger ? '#fecaca' : undefined, background: danger ? '#fff7f7' : undefined }}><h3 className="section-title">{title}</h3>{hint ? <p className="section-subtitle" style={{ marginBottom: 10 }}>{hint}</p> : null}{children}</section>;
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
    <div className="list-stack">
      {msg ? <p className={`alert ${msg.ok ? 'alert-success' : 'alert-error'}`}>{msg.text}</p> : null}

      <Block title="Sale void" hint="Creates reversal entries and preserves original sale record." danger>
        <form className="form-grid" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); submit(() => voidSaleAction({ sale_id: String(form.get('sale_id') || ''), reason: String(form.get('reason') || '') })); }}>
          <div className="form-col-6"><input name="sale_id" placeholder="Sale UUID" className="input" required /></div><div className="form-col-4"><input name="reason" placeholder="Reason" className="input" required /></div><div className="form-col-2"><button disabled={pending} className="btn btn-danger">Void sale</button></div>
        </form>
      </Block>

      <Block title="Expense void" danger>
        <form className="form-grid" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); submit(() => voidExpenseAction({ expense_id: String(form.get('expense_id') || ''), reason: String(form.get('reason') || '') })); }}>
          <div className="form-col-6"><input name="expense_id" placeholder="Expense UUID" className="input" required /></div><div className="form-col-4"><input name="reason" placeholder="Reason" className="input" required /></div><div className="form-col-2"><button disabled={pending} className="btn btn-danger">Void expense</button></div>
        </form>
      </Block>

      <Block title="Purchase void" danger>
        <form className="form-grid" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); submit(() => voidPurchaseAction({ purchase_id: String(form.get('purchase_id') || ''), reason: String(form.get('reason') || '') })); }}>
          <div className="form-col-6"><input name="purchase_id" placeholder="Purchase UUID" className="input" required /></div><div className="form-col-4"><input name="reason" placeholder="Reason" className="input" required /></div><div className="form-col-2"><button disabled={pending} className="btn btn-danger">Void purchase</button></div>
        </form>
      </Block>

      <Block title="Cash / Mpesa reconciliation" hint="Capture expected versus actual balance and variance note.">
        <form className="form-grid" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); submit(() => createReconciliationAction({ recon_type: String(form.get('recon_type') || 'cash') as 'cash' | 'mpesa', actual_balance: Number(form.get('actual_balance')), recon_date: String(form.get('recon_date') || today), note: String(form.get('note') || '') })); }}>
          <div className="form-col-3"><select name="recon_type" className="select"><option value="cash">Cash</option><option value="mpesa">Mpesa</option></select></div><div className="form-col-3"><input name="actual_balance" placeholder="Actual balance" type="number" step="0.01" className="input" required /></div><div className="form-col-2"><input name="recon_date" defaultValue={today} type="date" className="input" required /></div><div className="form-col-2"><input name="note" placeholder="Variance note" className="input" /></div><div className="form-col-2"><button disabled={pending} className="btn btn-primary">Save</button></div>
        </form>
      </Block>

      <Block title="Debt write-off" hint="Sensitive owner-only action." danger>
        <form className="form-grid" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); submit(() => writeOffDebtAction({ debt_id: String(form.get('debt_id') || ''), reason: String(form.get('reason') || '') })); }}>
          <div className="form-col-6"><input name="debt_id" placeholder="Debt UUID" className="input" required /></div><div className="form-col-4"><input name="reason" placeholder="Reason" className="input" required /></div><div className="form-col-2"><button disabled={pending} className="btn btn-danger">Write off</button></div>
        </form>
      </Block>

      <Block title="End of day close">
        <form className="form-grid" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); submit(() => closeDayAction({ close_date: String(form.get('close_date') || today), note: String(form.get('note') || '') })); }}>
          <div className="form-col-4"><input name="close_date" defaultValue={today} type="date" className="input" required /></div><div className="form-col-6"><input name="note" placeholder="Optional closing note" className="input" /></div><div className="form-col-2"><button disabled={pending} className="btn btn-primary">Close day</button></div>
        </form>
      </Block>
    </div>
  );
}
