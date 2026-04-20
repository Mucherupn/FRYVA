import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { OperationsWorkflow } from '@/components/owner/operations-workflow';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value || 0);
}

export default async function Page() {
  await requireRole(['owner']);
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: balances }, { data: recon }, { data: closures }, { data: debtAging }, { data: recentPaid }] = await Promise.all([
    supabase.from('v_ledger_balance_by_method').select('account_type, balance'),
    supabase.from('reconciliation_sessions').select('id, recon_type, recon_date, expected_balance, actual_balance, variance, note, created_at').order('created_at', { ascending: false }).limit(20),
    supabase.from('daily_closures').select('id, close_date, closed_at, summary_snapshot, reconciliation_note').order('close_date', { ascending: false }).limit(10),
    supabase.from('v_debt_aging').select('debt_id, debtor_name, remaining_amount, status, aging_bucket').neq('status', 'paid').order('created_at', { ascending: false }).limit(25),
    supabase.from('debt_payments').select('id, debt_id, amount, received_at, payment_method').order('received_at', { ascending: false }).limit(20),
  ]);

  return (
    <DashboardShell
      role="owner"
      title="Operational integrity"
      description="Owner-only corrections, reconciliations, debt quality checks, and end-of-day controls."
    >
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {(balances ?? []).map((balance: any) => (
          <div key={balance.account_type} className="rounded border p-3 text-sm">
            <p className="text-slate-500">{balance.account_type} expected balance</p>
            <p className="text-base font-semibold">{money(Number(balance.balance))}</p>
          </div>
        ))}
      </div>

      <OperationsWorkflow today={today} />

      <section className="mt-6 rounded border p-3">
        <h2 className="mb-2 text-sm font-semibold">Recent reconciliations</h2>
        <div className="space-y-1 text-xs">
          {(recon ?? []).length === 0 ? <p className="text-slate-500">No reconciliations yet.</p> : (recon ?? []).map((row: any) => (
            <p key={row.id}>{row.recon_date} · {row.recon_type} · expected {money(Number(row.expected_balance))} · actual {money(Number(row.actual_balance))} · variance {money(Number(row.variance))}{row.note ? ` · ${row.note}` : ''}</p>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <article className="rounded border p-3">
          <h2 className="mb-2 text-sm font-semibold">Debt reconciliation view</h2>
          <div className="space-y-1 text-xs">
            {(debtAging ?? []).map((row: any) => (
              <p key={row.debt_id}>{row.debtor_name ?? 'Unknown'} · {money(Number(row.remaining_amount))} · {row.aging_bucket}</p>
            ))}
          </div>
        </article>
        <article className="rounded border p-3">
          <h2 className="mb-2 text-sm font-semibold">Debts recently paid</h2>
          <div className="space-y-1 text-xs">
            {(recentPaid ?? []).map((row: any) => (
              <p key={row.id}>{String(row.received_at).slice(0, 10)} · {money(Number(row.amount))} · {row.payment_method}</p>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-6 rounded border p-3">
        <h2 className="mb-2 text-sm font-semibold">End-of-day closures</h2>
        <div className="space-y-1 text-xs">
          {(closures ?? []).length === 0 ? <p className="text-slate-500">No day closures yet.</p> : (closures ?? []).map((row: any) => (
            <p key={row.id}>{row.close_date} · closed {new Date(row.closed_at).toLocaleString()} · net {money(Number(row.summary_snapshot?.net_position ?? 0))}{row.reconciliation_note ? ` · ${row.reconciliation_note}` : ''}</p>
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}
