import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';
import { REPORT_PERIOD_OPTIONS, resolveReportRange } from '@/lib/reports/period';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type Search = {
  period?: string;
  date_from?: string;
  date_to?: string;
  waiter_id?: string;
  item_id?: string;
};

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value || 0);
}

function csvHref(type: 'sales' | 'debts' | 'expenses' | 'purchases', from: string, to: string) {
  return `/owner/reports/export?type=${type}&date_from=${from}&date_to=${to}`;
}

function MiniBars({ data, color }: { data: Array<{ label: string; value: number }>; color: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-1">
      {data.map((row) => (
        <div key={row.label} className="grid grid-cols-[90px_1fr_80px] items-center gap-2 text-xs">
          <span className="text-slate-500">{row.label}</span>
          <div className="h-2 rounded bg-slate-100">
            <div className={`h-2 rounded ${color}`} style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
          <span className="text-right font-medium">{money(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole(['owner']);
  const params = await searchParams;
  const range = resolveReportRange(params);
  const fromTs = `${range.from}T00:00:00`;
  const toTs = `${range.to}T23:59:59`;
  const supabase = await createServerSupabaseClient();

  const [salesRes, expensesRes, purchasesRes, debtPaymentsRes, debtsRes, saleItemsRes, waitersRes] = await Promise.all([
    supabase.from('sales').select('id, total, payment_method, sold_by, sold_at').gte('sold_at', fromTs).lte('sold_at', toTs).eq('status', 'finalized'),
    supabase.from('expenses').select('id, amount, expense_time').gte('expense_time', fromTs).lte('expense_time', toTs),
    supabase.from('purchases').select('id, total_cost, purchase_date').gte('purchase_date', range.from).lte('purchase_date', range.to),
    supabase.from('debt_payments').select('id, amount, received_at, debt_id').gte('received_at', fromTs).lte('received_at', toTs),
    supabase.from('debts').select('id, original_amount, remaining_amount, assigned_waiter_id, created_at, status, debtors(full_name)').order('created_at', { ascending: false }),
    supabase.from('sale_items').select('sale_id, menu_item_id, menu_item_name, quantity, line_total, sales!inner(sold_at, sold_by)').gte('sales.sold_at', fromTs).lte('sales.sold_at', toTs),
    supabase.from('user_role_assignments').select('user_id').eq('role', 'waiter'),
  ]);

  const waiterIds = Array.from(new Set((waitersRes.data ?? []).map((w) => w.user_id)));
  const { data: waiterProfiles } = waiterIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', waiterIds)
    : { data: [] as Array<{ id: string; full_name: string }> };

  const waiterNameMap = new Map((waiterProfiles ?? []).map((w) => [w.id, w.full_name]));

  const sales = salesRes.data ?? [];
  const expenses = expensesRes.data ?? [];
  const purchases = purchasesRes.data ?? [];
  const debtPayments = debtPaymentsRes.data ?? [];
  const debts = debtsRes.data ?? [];
  const saleItems = (saleItemsRes.data as any[]) ?? [];

  const revenue = sales.reduce((sum, row: any) => sum + Number(row.total), 0);
  const totalExpenses = expenses.reduce((sum, row: any) => sum + Number(row.amount), 0);
  const totalPurchases = purchases.reduce((sum, row: any) => sum + Number(row.total_cost), 0);
  const debtCollected = debtPayments.reduce((sum, row: any) => sum + Number(row.amount), 0);
  const outstandingDebt = debts.filter((d: any) => d.status !== 'paid').reduce((sum, row: any) => sum + Number(row.remaining_amount), 0);

  const cashSales = sales.filter((row: any) => row.payment_method === 'cash').reduce((sum: number, row: any) => sum + Number(row.total), 0);
  const mpesaSales = sales.filter((row: any) => row.payment_method === 'mpesa').reduce((sum: number, row: any) => sum + Number(row.total), 0);
  const debtSales = sales.filter((row: any) => row.payment_method === 'debt').reduce((sum: number, row: any) => sum + Number(row.total), 0);

  const transactionCount = sales.length;
  const avgOrder = transactionCount ? revenue / transactionCount : 0;
  const netPosition = revenue + debtCollected - totalExpenses - totalPurchases;

  const revenueByDay = new Map<string, number>();
  const expenseByDay = new Map<string, number>();
  const paymentMixByDay = new Map<string, { cash: number; mpesa: number; debt: number }>();

  for (const sale of sales as any[]) {
    const day = String(sale.sold_at).slice(0, 10);
    revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + Number(sale.total));
    const existing = paymentMixByDay.get(day) ?? { cash: 0, mpesa: 0, debt: 0 };
    existing[sale.payment_method as 'cash' | 'mpesa' | 'debt'] += Number(sale.total);
    paymentMixByDay.set(day, existing);
  }
  for (const expense of expenses as any[]) {
    const day = String(expense.expense_time).slice(0, 10);
    expenseByDay.set(day, (expenseByDay.get(day) ?? 0) + Number(expense.amount));
  }

  const timeline = Array.from(new Set([...Array.from(revenueByDay.keys()), ...Array.from(expenseByDay.keys())]))
    .sort()
    .map((day) => ({
      day,
      revenue: revenueByDay.get(day) ?? 0,
      expenses: expenseByDay.get(day) ?? 0,
      net: (revenueByDay.get(day) ?? 0) - (expenseByDay.get(day) ?? 0),
    }));

  const waiterStats = new Map<string, { sales: number; tx: number; cash: number; mpesa: number; debt: number; top: Map<string, number> }>();
  for (const sale of sales as any[]) {
    const key = sale.sold_by;
    const current = waiterStats.get(key) ?? { sales: 0, tx: 0, cash: 0, mpesa: 0, debt: 0, top: new Map() };
    current.sales += Number(sale.total);
    current.tx += 1;
    current[sale.payment_method as 'cash' | 'mpesa' | 'debt'] += Number(sale.total);
    waiterStats.set(key, current);
  }

  for (const row of saleItems) {
    const waiterId = row.sales.sold_by;
    const current = waiterStats.get(waiterId);
    if (!current) continue;
    const name = row.menu_item_name ?? `Item ${row.menu_item_id}`;
    current.top.set(name, (current.top.get(name) ?? 0) + Number(row.quantity));
  }

  const debtCollectedByWaiter = new Map<string, number>();
  const outstandingByWaiter = new Map<string, number>();
  const debtMap = new Map((debts as any[]).map((d) => [d.id, d]));
  for (const payment of debtPayments as any[]) {
    const debt = debtMap.get(payment.debt_id);
    if (!debt) continue;
    debtCollectedByWaiter.set(debt.assigned_waiter_id, (debtCollectedByWaiter.get(debt.assigned_waiter_id) ?? 0) + Number(payment.amount));
  }
  for (const debt of debts as any[]) {
    if (debt.status === 'paid') continue;
    outstandingByWaiter.set(debt.assigned_waiter_id, (outstandingByWaiter.get(debt.assigned_waiter_id) ?? 0) + Number(debt.remaining_amount));
  }

  const waiterRows = Array.from(waiterStats.entries())
    .map(([waiterId, stat]) => {
      const topProducts = Array.from(stat.top.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name).join(', ');
      return {
        waiterId,
        waiterName: waiterNameMap.get(waiterId) ?? 'Unknown waiter',
        ...stat,
        debtCollected: debtCollectedByWaiter.get(waiterId) ?? 0,
        outstanding: outstandingByWaiter.get(waiterId) ?? 0,
        avgTicket: stat.tx ? stat.sales / stat.tx : 0,
        topProducts,
      };
    })
    .sort((a, b) => b.sales - a.sales);

  const itemStats = new Map<number, { name: string; qty: number; revenue: number; tx: Set<string> }>();
  for (const row of saleItems) {
    const key = row.menu_item_id;
    const current = itemStats.get(key) ?? { name: row.menu_item_name ?? `Item ${key}`, qty: 0, revenue: 0, tx: new Set<string>() };
    current.qty += Number(row.quantity);
    current.revenue += Number(row.line_total);
    current.tx.add(row.sale_id);
    itemStats.set(key, current);
  }

  const itemRows = Array.from(itemStats.entries()).map(([itemId, row]) => ({
    itemId,
    ...row,
    txCount: row.tx.size,
  })).sort((a, b) => b.revenue - a.revenue);

  const maxQty = Math.max(1, ...itemRows.map((r) => r.qty));
  const slowMoving = itemRows.filter((r) => r.qty <= maxQty * 0.2).slice(0, 5);
  const selectedWaiterId = params.waiter_id;
  const selectedItemId = params.item_id ? Number(params.item_id) : null;

  const waiterSaleDetail = selectedWaiterId
    ? (sales as any[]).filter((s) => s.sold_by === selectedWaiterId).slice(0, 40)
    : [];
  const waiterDebtsDetail = selectedWaiterId
    ? (debts as any[]).filter((d) => d.assigned_waiter_id === selectedWaiterId).slice(0, 40)
    : [];
  const itemDetail = selectedItemId ? saleItems.filter((s) => s.menu_item_id === selectedItemId).slice(0, 50) : [];

  return (
    <DashboardShell role="owner" title="Owner analytics suite" description="Financial, waiter, product and debt reporting for decisions.">
      <form className="grid gap-2 rounded border p-3 md:grid-cols-6">
        <select name="period" defaultValue={range.key} className="rounded border px-2 py-1 text-sm">
          {REPORT_PERIOD_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
        <input type="date" name="date_from" defaultValue={range.from} className="rounded border px-2 py-1 text-sm" />
        <input type="date" name="date_to" defaultValue={range.to} className="rounded border px-2 py-1 text-sm" />
        <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">Apply period</button>
        <Link href="/owner/reports/daily" className="rounded border px-3 py-2 text-sm">Daily report page</Link>
      </form>

      <p className="mt-3 text-xs text-slate-500">Period: {range.label} ({range.from} to {range.to}).</p>

      <section className="mt-4 grid gap-3 md:grid-cols-4">
        {[
          ['Total revenue', money(revenue)],
          ['Total expenses', money(totalExpenses)],
          ['Total purchases', money(totalPurchases)],
          ['Net position', money(netPosition)],
          ['Cash sales', money(cashSales)],
          ['Mpesa sales', money(mpesaSales)],
          ['Debt sales', money(debtSales)],
          ['Debt collected', money(debtCollected)],
          ['Outstanding debt', money(outstandingDebt)],
          ['Transactions', String(transactionCount)],
          ['Average order value', money(avgOrder)],
        ].map((card) => (
          <div key={card[0]} className="rounded border p-3">
            <p className="text-xs text-slate-500">{card[0]}</p>
            <p className="text-lg font-semibold">{card[1]}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded border p-3">
          <h2 className="mb-2 text-sm font-semibold">Revenue over time</h2>
          <MiniBars data={timeline.map((row) => ({ label: row.day.slice(5), value: row.revenue }))} color="bg-green-500" />
        </div>
        <div className="rounded border p-3">
          <h2 className="mb-2 text-sm font-semibold">Expenses over time</h2>
          <MiniBars data={timeline.map((row) => ({ label: row.day.slice(5), value: row.expenses }))} color="bg-red-500" />
        </div>
        <div className="rounded border p-3">
          <h2 className="mb-2 text-sm font-semibold">Net position over time</h2>
          <MiniBars data={timeline.map((row) => ({ label: row.day.slice(5), value: Math.max(0, row.net) }))} color="bg-blue-500" />
        </div>
        <div className="rounded border p-3">
          <h2 className="mb-2 text-sm font-semibold">Payment method mix (total)</h2>
          <MiniBars data={[{ label: 'Cash', value: cashSales }, { label: 'Mpesa', value: mpesaSales }, { label: 'Debt', value: debtSales }]} color="bg-indigo-500" />
        </div>
      </section>

      <section className="mt-6 rounded border p-3">
        <h2 className="mb-2 text-base font-semibold">Waiter performance analytics</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2">Waiter</th><th>Sales</th><th>Tx</th><th>Cash</th><th>Mpesa</th><th>Debt</th><th>Debt collected</th><th>Outstanding debt</th><th>Avg ticket</th><th>Top products</th>
              </tr>
            </thead>
            <tbody>
              {waiterRows.map((row) => (
                <tr key={row.waiterId} className="border-b">
                  <td className="py-2"><Link className="underline" href={`?period=${range.key}&date_from=${range.from}&date_to=${range.to}&waiter_id=${row.waiterId}`}>{row.waiterName}</Link></td>
                  <td>{money(row.sales)}</td><td>{row.tx}</td><td>{money(row.cash)}</td><td>{money(row.mpesa)}</td><td>{money(row.debt)}</td><td>{money(row.debtCollected)}</td><td>{money(row.outstanding)}</td><td>{money(row.avgTicket)}</td><td>{row.topProducts || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedWaiterId ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <h3 className="font-medium">Detailed sales list</h3>
              {waiterSaleDetail.map((sale: any) => <p key={sale.id} className="text-xs">{sale.sold_at.slice(0, 10)} · {money(Number(sale.total))} · {sale.payment_method}</p>)}
            </div>
            <div>
              <h3 className="font-medium">Debtors and debt status</h3>
              {waiterDebtsDetail.map((debt: any) => <p key={debt.id} className="text-xs">{debt.debtors?.full_name ?? 'Unknown'} · {debt.status} · {money(Number(debt.remaining_amount))}</p>)}
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded border p-3">
        <h2 className="mb-2 text-base font-semibold">Product performance analytics</h2>
        <div className="mb-3 grid gap-2 md:grid-cols-2">
          <div className="rounded bg-slate-50 p-2 text-xs">Best selling items: {itemRows.slice(0, 5).map((item) => `${item.name} (${item.qty})`).join(', ') || '-'}</div>
          <div className="rounded bg-slate-50 p-2 text-xs">Slow moving items: {slowMoving.map((item) => `${item.name} (${item.qty})`).join(', ') || '-'}</div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Item</th><th>Qty sold</th><th>Revenue</th><th>Transactions</th></tr></thead>
            <tbody>
              {itemRows.map((item) => (
                <tr key={item.itemId} className="border-b">
                  <td className="py-2"><Link className="underline" href={`?period=${range.key}&date_from=${range.from}&date_to=${range.to}&item_id=${item.itemId}`}>{item.name}</Link></td>
                  <td>{item.qty}</td><td>{money(item.revenue)}</td><td>{item.txCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedItemId ? (
          <div className="mt-3">
            <h3 className="font-medium">Item recent detail</h3>
            {itemDetail.map((row) => <p key={`${row.sale_id}-${row.menu_item_id}`} className="text-xs">{row.sales.sold_at.slice(0, 10)} · qty {row.quantity} · {money(Number(row.line_total))}</p>)}
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded border p-3">
        <h2 className="mb-2 text-base font-semibold">CSV exports (owner only)</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <a className="rounded border px-3 py-2" href={csvHref('sales', range.from, range.to)}>Export sales CSV</a>
          <a className="rounded border px-3 py-2" href={csvHref('debts', range.from, range.to)}>Export debts CSV</a>
          <a className="rounded border px-3 py-2" href={csvHref('expenses', range.from, range.to)}>Export expenses CSV</a>
          <a className="rounded border px-3 py-2" href={csvHref('purchases', range.from, range.to)}>Export purchases CSV</a>
        </div>
      </section>
    </DashboardShell>
  );
}
