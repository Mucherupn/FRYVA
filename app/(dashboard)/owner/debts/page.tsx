import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';
import { resolveReportRange, REPORT_PERIOD_OPTIONS } from '@/lib/reports/period';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { classifyDebtAging } from '@/lib/debts/aging';

type Search = {
  waiter?: string;
  status?: 'unpaid' | 'partial' | 'paid';
  period?: string;
  date_from?: string;
  date_to?: string;
  debt_id?: string;
  page?: string;
};

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value || 0);
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole(['owner']);
  const params = await searchParams;
  const range = resolveReportRange(params);
  const supabase = await createServerSupabaseClient();

  const { data: waiters } = await supabase.from('user_role_assignments').select('user_id').eq('role', 'waiter');
  const waiterIds = Array.from(new Set((waiters ?? []).map((waiter) => waiter.user_id)));
  const { data: waiterProfiles } = waiterIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', waiterIds)
    : { data: [] as Array<{ id: string; full_name: string }> };
  const waiterNameMap = new Map((waiterProfiles ?? []).map((profile) => [profile.id, profile.full_name]));

  const page = Math.max(1, Number(params.page ?? '1') || 1);
  const pageSize = 30;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let debtsQuery = supabase
    .from('debts')
    .select('id, created_at, status, original_amount, remaining_amount, assigned_waiter_id, debtor_id, debtors(full_name, phone, notes)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (params.waiter) debtsQuery = debtsQuery.eq('assigned_waiter_id', params.waiter);
  if (params.status) debtsQuery = debtsQuery.eq('status', params.status);
  debtsQuery = debtsQuery.gte('created_at', `${range.from}T00:00:00`).lte('created_at', `${range.to}T23:59:59`);

  const { data: debts, count } = await debtsQuery;
  const filteredDebts = (debts ?? []) as any[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const debtIds = filteredDebts.map((d) => d.id);

  const { data: payments } = debtIds.length
    ? await supabase
        .from('debt_payments')
        .select('id, debt_id, amount, payment_method, received_at, note, received_by')
        .in('debt_id', debtIds)
        .order('received_at', { ascending: false })
    : { data: [] as any[] };

  const selectedDebt = params.debt_id ? filteredDebts.find((d) => d.id === params.debt_id) : null;
  const selectedDebtPayments = selectedDebt ? (payments ?? []).filter((p: any) => p.debt_id === selectedDebt.id) : [];

  const fromTs = `${range.from}T00:00:00`;
  const toTs = `${range.to}T23:59:59`;
  const [{ data: outstanding }, { data: createdInPeriod }, { data: paidInPeriod }] = await Promise.all([
    supabase.from('debts').select('remaining_amount').neq('status', 'paid'),
    supabase.from('debts').select('id').gte('created_at', fromTs).lte('created_at', toTs),
    supabase.from('debt_payments').select('id').gte('received_at', fromTs).lte('received_at', toTs),
  ]);

  const outstandingTotal = (outstanding ?? []).reduce((sum, row: any) => sum + Number(row.remaining_amount), 0);

  const now = new Date();
  const aging = { today: 0, d1_7: 0, d8_30: 0, over30: 0 };
  const byWaiter = new Map<string, number>();
  for (const debt of filteredDebts) {
    if (debt.status === 'paid') continue;
    const amount = Number(debt.remaining_amount);
    const bucket = classifyDebtAging(debt.created_at, now);
    if (bucket === 'today') aging.today += amount;
    else if (bucket === 'd1_7') aging.d1_7 += amount;
    else if (bucket === 'd8_30') aging.d8_30 += amount;
    else aging.over30 += amount;
    byWaiter.set(debt.assigned_waiter_id, (byWaiter.get(debt.assigned_waiter_id) ?? 0) + amount);
  }

  const topDebtors = [...filteredDebts]
    .filter((d) => d.status !== 'paid')
    .sort((a, b) => Number(b.remaining_amount) - Number(a.remaining_amount))
    .slice(0, 10);

  return (
    <DashboardShell role="owner" title="Owner debts" description="Debt aging, timelines and receivable quality for owner control.">
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="rounded border p-3 text-sm"><p className="text-slate-500">Outstanding debt</p><p className="text-lg font-semibold">{money(outstandingTotal)}</p></div>
        <div className="rounded border p-3 text-sm"><p className="text-slate-500">Debts created in period</p><p className="text-lg font-semibold">{createdInPeriod?.length ?? 0}</p></div>
        <div className="rounded border p-3 text-sm"><p className="text-slate-500">Debts paid in period</p><p className="text-lg font-semibold">{paidInPeriod?.length ?? 0}</p></div>
      </div>

      <form className="filter-bar mb-4 md:grid-cols-7">
        <select name="period" defaultValue={range.key} className="rounded border px-2 py-1 text-sm">{REPORT_PERIOD_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
        <select name="waiter" defaultValue={params.waiter ?? ''} className="rounded border px-2 py-1 text-sm">
          <option value="">All waiters</option>
          {(waiters ?? []).map((waiter: any) => <option key={waiter.user_id} value={waiter.user_id}>{waiterNameMap.get(waiter.user_id) ?? waiter.user_id}</option>)}
        </select>
        <select name="status" defaultValue={params.status ?? ''} className="rounded border px-2 py-1 text-sm">
          <option value="">All statuses</option><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid</option>
        </select>
        <input name="date_from" defaultValue={range.from} type="date" className="rounded border px-2 py-1 text-sm" />
        <input name="date_to" defaultValue={range.to} type="date" className="rounded border px-2 py-1 text-sm" />
        <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">Apply filters</button>
      </form>

      <section className="mb-6 rounded border p-3 text-sm">
        <h2 className="mb-2 font-semibold">Debt aging buckets</h2>
        <div className="grid gap-2 md:grid-cols-4">
          <p>Today: <strong>{money(aging.today)}</strong></p>
          <p>1 to 7 days: <strong>{money(aging.d1_7)}</strong></p>
          <p>8 to 30 days: <strong>{money(aging.d8_30)}</strong></p>
          <p>Over 30 days: <strong>{money(aging.over30)}</strong></p>
        </div>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded border p-3 text-sm">
          <h3 className="font-semibold">Debts by waiter</h3>
          {Array.from(byWaiter.entries()).sort((a, b) => b[1] - a[1]).map(([waiterId, amount]) => (
            <p key={waiterId} className="text-xs">{waiterNameMap.get(waiterId) ?? waiterId}: {money(amount)}</p>
          ))}
        </div>
        <div className="rounded border p-3 text-sm">
          <h3 className="font-semibold">Top debtors by outstanding</h3>
          {topDebtors.map((debt) => (
            <p key={debt.id} className="text-xs">{debt.debtors?.full_name ?? 'Unknown'}: {money(Number(debt.remaining_amount))}</p>
          ))}
        </div>
      </section>


      <div className="mb-3 flex items-center justify-between text-xs text-slate-600">
        <p>Page {page} of {totalPages} · {(count ?? 0)} debts</p>
        <div className="space-x-2">
          {page > 1 ? <a className="underline" href={`?period=${range.key}&date_from=${range.from}&date_to=${range.to}${params.waiter ? `&waiter=${params.waiter}` : ''}${params.status ? `&status=${params.status}` : ''}&page=${page - 1}`}>Previous</a> : null}
          {page < totalPages ? <a className="underline" href={`?period=${range.key}&date_from=${range.from}&date_to=${range.to}${params.waiter ? `&waiter=${params.waiter}` : ''}${params.status ? `&status=${params.status}` : ''}&page=${page + 1}`}>Next</a> : null}
        </div>
      </div>

      <div className="space-y-2">
        {filteredDebts.length === 0 ? <p className="rounded border border-dashed p-4 text-sm text-slate-500">No debts found.</p> : filteredDebts.map((debt: any) => (
          <article key={debt.id} className="rounded border p-3 text-sm">
            <p className="font-semibold"><a className="underline" href={`?period=${range.key}&date_from=${range.from}&date_to=${range.to}&debt_id=${debt.id}`}>{debt.debtors?.full_name ?? 'Unknown debtor'}</a> · {money(Number(debt.remaining_amount))} remaining</p>
            <p className="text-xs text-slate-500">Original: {money(Number(debt.original_amount))} · Status: {debt.status} · Waiter: {waiterNameMap.get(debt.assigned_waiter_id) ?? 'Unknown'} · Sale date: {String(debt.created_at).slice(0, 10)}</p>
            {debt.debtors?.notes ? <p className="text-xs text-slate-500">Notes: {debt.debtors.notes}</p> : null}
          </article>
        ))}
      </div>

      {selectedDebt ? (
        <section className="mt-6 rounded border p-3 text-sm">
          <h2 className="mb-2 text-base font-semibold">Debt detail and payment timeline</h2>
          <p>Debtor: {selectedDebt.debtors?.full_name ?? 'Unknown'} ({selectedDebt.debtors?.phone ?? 'No phone'})</p>
          <p>Original amount: {money(Number(selectedDebt.original_amount))}</p>
          <p>Current balance: {money(Number(selectedDebt.remaining_amount))}</p>
          <p>Status: {selectedDebt.status}</p>
          <p>Assigned waiter: {waiterNameMap.get(selectedDebt.assigned_waiter_id) ?? selectedDebt.assigned_waiter_id}</p>
          <p>Sale date: {String(selectedDebt.created_at).slice(0, 10)}</p>
          <h3 className="mt-3 font-semibold">Payment timeline</h3>
          {selectedDebtPayments.length === 0 ? <p className="text-xs text-slate-500">No payments yet.</p> : selectedDebtPayments.map((payment: any) => (
            <p key={payment.id} className="text-xs">{String(payment.received_at).slice(0, 10)} · {money(Number(payment.amount))} · {payment.payment_method}{payment.note ? ` · ${payment.note}` : ''}</p>
          ))}
        </section>
      ) : null}
    </DashboardShell>
  );
}
