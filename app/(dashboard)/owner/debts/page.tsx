import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type Search = {
  waiter?: string;
  status?: 'unpaid' | 'partial' | 'paid';
  date_from?: string;
  date_to?: string;
};

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value);
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole(['owner']);
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const { data: waiters } = await supabase
    .from('user_role_assignments')
    .select('user_id')
    .eq('role', 'waiter');
  const waiterIds = Array.from(new Set((waiters ?? []).map((waiter) => waiter.user_id)));
  const { data: waiterProfiles } = waiterIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', waiterIds)
    : { data: [] as Array<{ id: string; full_name: string }> };
  const waiterNameMap = new Map((waiterProfiles ?? []).map((profile) => [profile.id, profile.full_name]));

  let debtsQuery = supabase
    .from('debts')
    .select('id, created_at, status, original_amount, remaining_amount, assigned_waiter_id, debtors(full_name, phone)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (params.waiter) debtsQuery = debtsQuery.eq('assigned_waiter_id', params.waiter);
  if (params.status) debtsQuery = debtsQuery.eq('status', params.status);
  if (params.date_from) debtsQuery = debtsQuery.gte('created_at', `${params.date_from}T00:00:00`);
  if (params.date_to) debtsQuery = debtsQuery.lte('created_at', `${params.date_to}T23:59:59`);

  const { data: debts } = await debtsQuery;

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: outstanding }, { data: createdToday }, { data: paidToday }] = await Promise.all([
    supabase.from('debts').select('remaining_amount').neq('status', 'paid'),
    supabase.from('debts').select('id').gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`),
    supabase.from('debt_payments').select('id').gte('received_at', `${today}T00:00:00`).lte('received_at', `${today}T23:59:59`),
  ]);

  const outstandingTotal = (outstanding ?? []).reduce((sum, row: any) => sum + Number(row.remaining_amount), 0);

  return (
    <DashboardShell role="owner" title="Owner debts" description="Follow all receivables and daily debt collection progress.">
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded border p-3 text-sm"><p className="text-slate-500">Outstanding debt</p><p className="text-lg font-semibold">{money(outstandingTotal)}</p></div>
        <div className="rounded border p-3 text-sm"><p className="text-slate-500">Debts created today</p><p className="text-lg font-semibold">{createdToday?.length ?? 0}</p></div>
        <div className="rounded border p-3 text-sm"><p className="text-slate-500">Debt payments today</p><p className="text-lg font-semibold">{paidToday?.length ?? 0}</p></div>
      </div>

      <form className="mb-4 grid gap-2 rounded border p-3 md:grid-cols-5">
        <select name="waiter" defaultValue={params.waiter ?? ''} className="rounded border px-2 py-1 text-sm">
          <option value="">All waiters</option>
          {(waiters ?? []).map((waiter: any) => (
            <option key={waiter.user_id} value={waiter.user_id}>{waiterNameMap.get(waiter.user_id) ?? waiter.user_id}</option>
          ))}
        </select>
        <select name="status" defaultValue={params.status ?? ''} className="rounded border px-2 py-1 text-sm">
          <option value="">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
        <input name="date_from" defaultValue={params.date_from} type="date" className="rounded border px-2 py-1 text-sm" />
        <input name="date_to" defaultValue={params.date_to} type="date" className="rounded border px-2 py-1 text-sm" />
        <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">Apply filters</button>
      </form>

      <div className="space-y-2">
        {(debts ?? []).length === 0 ? (
          <p className="rounded border border-dashed p-4 text-sm text-slate-500">No debts found.</p>
        ) : (
          (debts ?? []).map((debt: any) => (
            <article key={debt.id} className="rounded border p-3 text-sm">
              <p className="font-semibold">{debt.debtors?.full_name ?? 'Unknown debtor'} · {money(Number(debt.remaining_amount))} remaining</p>
              <p className="text-xs text-slate-500">
                Status: {debt.status} · Original: {money(Number(debt.original_amount))} · Waiter: {waiterNameMap.get(debt.assigned_waiter_id) ?? 'Unknown'} · {new Date(debt.created_at).toLocaleString()}
              </p>
            </article>
          ))
        )}
      </div>
    </DashboardShell>
  );
}
