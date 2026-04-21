import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type Search = { day?: string };

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value || 0);
}

export default async function DailyReportPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole(['owner']);
  const params = await searchParams;
  const day = params.day ?? new Date().toISOString().slice(0, 10);
  const fromTs = `${day}T00:00:00`;
  const toTs = `${day}T23:59:59`;
  const supabase = await createServerSupabaseClient();

  const [salesRes, expensesRes, purchasesRes, debtPaymentsRes, debtsRes, openingRes, productionRes, saleItemsRes, waitersRes] = await Promise.all([
    supabase.from('sales').select('id, total, payment_method, sold_by, sold_at').gte('sold_at', fromTs).lte('sold_at', toTs).eq('status', 'finalized'),
    supabase.from('expenses').select('id, amount').gte('expense_time', fromTs).lte('expense_time', toTs),
    supabase.from('purchases').select('id, total_cost, item_name, qty, unit').eq('purchase_date', day),
    supabase.from('debt_payments').select('id, amount').gte('received_at', fromTs).lte('received_at', toTs),
    supabase.from('debts').select('id, remaining_amount, status').neq('status', 'paid'),
    supabase.from('opening_stock_entries').select('menu_item_id, qty, menu_items(name)').eq('entry_date', day),
    supabase.from('stock_production_entries').select('menu_item_id, qty, menu_items(name)').eq('entry_date', day),
    supabase.from('sale_items').select('sale_id, menu_item_id, menu_item_name, quantity, line_total, sales!inner(sold_by, sold_at)').gte('sales.sold_at', fromTs).lte('sales.sold_at', toTs),
    supabase.from('user_role_assignments').select('user_id').eq('role', 'waiter'),
  ]);

  const waiterIds = Array.from(new Set((waitersRes.data ?? []).map((w) => w.user_id)));
  const { data: waiterProfiles } = waiterIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', waiterIds)
    : { data: [] as Array<{ id: string; full_name: string }> };

  const waiterNames = new Map((waiterProfiles ?? []).map((w) => [w.id, w.full_name]));

  const sales = (salesRes.data as any[]) ?? [];
  const saleItems = (saleItemsRes.data as any[]) ?? [];

  const totalSales = sales.length;
  const totalRevenue = sales.reduce((sum, row) => sum + Number(row.total), 0);
  const cashTotal = sales.filter((s) => s.payment_method === 'cash').reduce((sum, row) => sum + Number(row.total), 0);
  const mpesaTotal = sales.filter((s) => s.payment_method === 'mpesa').reduce((sum, row) => sum + Number(row.total), 0);
  const debtTotal = sales.filter((s) => s.payment_method === 'debt').reduce((sum, row) => sum + Number(row.total), 0);
  const debtCollected = (debtPaymentsRes.data ?? []).reduce((sum, row: any) => sum + Number(row.amount), 0);
  const outstandingDebt = (debtsRes.data ?? []).reduce((sum, row: any) => sum + Number(row.remaining_amount), 0);
  const totalExpenses = (expensesRes.data ?? []).reduce((sum, row: any) => sum + Number(row.amount), 0);
  const totalPurchases = (purchasesRes.data ?? []).reduce((sum, row: any) => sum + Number(row.total_cost), 0);
  const netPosition = totalRevenue + debtCollected - totalExpenses - totalPurchases;

  const productSummary = new Map<string, { qty: number; revenue: number }>();
  for (const row of saleItems) {
    const key = row.menu_item_name ?? `Item ${row.menu_item_id}`;
    const current = productSummary.get(key) ?? { qty: 0, revenue: 0 };
    current.qty += Number(row.quantity);
    current.revenue += Number(row.line_total);
    productSummary.set(key, current);
  }

  const waiterSummary = new Map<string, { tx: number; sales: number }>();
  for (const row of sales) {
    const key = row.sold_by;
    const current = waiterSummary.get(key) ?? { tx: 0, sales: 0 };
    current.tx += 1;
    current.sales += Number(row.total);
    waiterSummary.set(key, current);
  }

  return (
    <DashboardShell role="owner" title="Daily report" description="Operational end-of-day report for owner review.">
      <form className="mb-4 flex items-center gap-2 rounded border p-3">
        <input type="date" name="day" defaultValue={day} className="rounded border px-2 py-1 text-sm" />
        <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">Load daily report</button>
      </form>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['Total sales', String(totalSales)],
          ['Total revenue', money(totalRevenue)],
          ['Cash total', money(cashTotal)],
          ['Mpesa total', money(mpesaTotal)],
          ['Debt total', money(debtTotal)],
          ['Debt collected', money(debtCollected)],
          ['Outstanding debt snapshot', money(outstandingDebt)],
          ['Total expenses', money(totalExpenses)],
          ['Total purchases', money(totalPurchases)],
          ['Net position', money(netPosition)],
          ['Opening stock summary', String((openingRes.data ?? []).reduce((s, r: any) => s + Number(r.qty), 0))],
          ['Production summary', String((productionRes.data ?? []).reduce((s, r: any) => s + Number(r.qty), 0))],
        ].map((row) => (
          <div key={row[0]} className="rounded border p-3">
            <p className="text-xs text-slate-500">{row[0]}</p>
            <p className="text-lg font-semibold">{row[1]}</p>
          </div>
        ))}
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded border p-3">
          <h2 className="mb-2 text-sm font-semibold">Product sales summary</h2>
          {Array.from(productSummary.entries()).sort((a, b) => b[1].revenue - a[1].revenue).map(([name, row]) => (
            <p key={name} className="text-xs">{name} · qty {row.qty} · {money(row.revenue)}</p>
          ))}
        </div>
        <div className="rounded border p-3">
          <h2 className="mb-2 text-sm font-semibold">Waiter sales summary</h2>
          {Array.from(waiterSummary.entries()).sort((a, b) => b[1].sales - a[1].sales).map(([waiterId, row]) => (
            <p key={waiterId} className="text-xs">{waiterNames.get(waiterId) ?? waiterId} · {row.tx} tx · {money(row.sales)}</p>
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}
