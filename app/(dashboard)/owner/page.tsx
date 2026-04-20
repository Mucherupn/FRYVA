import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value);
}

export default async function OwnerDashboardPage() {
  await requireRole(['owner']);
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const [ledgerResult, debtResult, salesResult, expensesResult, purchasesResult, openingResult, productionResult, trackedItemsResult, soldResult, purchasedTodayResult] = await Promise.all([
    supabase.from('ledger_entries').select('amount, direction, ledger_accounts(account_type)'),
    supabase.from('debts').select('remaining_amount').neq('status', 'paid'),
    supabase.from('sales').select('total').gte('sold_at', `${today}T00:00:00`).lte('sold_at', `${today}T23:59:59`),
    supabase.from('expenses').select('amount').gte('expense_time', `${today}T00:00:00`).lte('expense_time', `${today}T23:59:59`),
    supabase.from('purchases').select('total_cost').eq('purchase_date', today),
    supabase.from('opening_stock_entries').select('menu_item_id, qty, menu_items(name)').eq('entry_date', today),
    supabase.from('stock_production_entries').select('menu_item_id, qty').eq('entry_date', today),
    supabase.from('menu_items').select('id, name').eq('active', true).eq('stock_tracked', true),
    supabase.from('sale_items').select('menu_item_id, quantity, sales!inner(sold_at)').gte('sales.sold_at', `${today}T00:00:00`).lte('sales.sold_at', `${today}T23:59:59`),
    supabase.from('purchases').select('item_name, menu_item_id, qty').eq('purchase_date', today),
  ]);

  const cashBalance = (ledgerResult.data ?? [])
    .filter((row: any) => row.ledger_accounts?.account_type === 'cash')
    .reduce((sum: number, row: any) => sum + (row.direction === 'in' ? Number(row.amount) : -Number(row.amount)), 0);

  const mpesaBalance = (ledgerResult.data ?? [])
    .filter((row: any) => row.ledger_accounts?.account_type === 'mpesa')
    .reduce((sum: number, row: any) => sum + (row.direction === 'in' ? Number(row.amount) : -Number(row.amount)), 0);

  const outstandingDebt = (debtResult.data ?? []).reduce((sum, row) => sum + Number(row.remaining_amount), 0);
  const todaySales = (salesResult.data ?? []).reduce((sum, row) => sum + Number(row.total), 0);
  const todayExpenses = (expensesResult.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const todayPurchases = (purchasesResult.data ?? []).reduce((sum, row) => sum + Number(row.total_cost), 0);
  const todayNet = todaySales - todayExpenses - todayPurchases;

  const openingTotal = (openingResult.data ?? []).reduce((sum, row) => sum + Number(row.qty), 0);
  const productionTotal = (productionResult.data ?? []).reduce((sum, row) => sum + Number(row.qty), 0);

  const openingByItem = new Map<number, number>();
  for (const row of openingResult.data ?? []) openingByItem.set(row.menu_item_id, Number(row.qty));

  const productionByItem = new Map<number, number>();
  for (const row of productionResult.data ?? []) productionByItem.set(row.menu_item_id, (productionByItem.get(row.menu_item_id) ?? 0) + Number(row.qty));

  const soldByItem = new Map<number, number>();
  for (const row of soldResult.data ?? []) soldByItem.set(row.menu_item_id, (soldByItem.get(row.menu_item_id) ?? 0) + Number((row as any).quantity));

  const purchasedByItemId = new Map<number, number>();
  const purchasedByName = new Map<string, number>();
  for (const row of purchasedTodayResult.data ?? []) {
    if ((row as any).menu_item_id) {
      purchasedByItemId.set((row as any).menu_item_id, (purchasedByItemId.get((row as any).menu_item_id) ?? 0) + Number(row.qty));
    } else {
      purchasedByName.set(row.item_name.trim().toLowerCase(), (purchasedByName.get(row.item_name.trim().toLowerCase()) ?? 0) + Number(row.qty));
    }
  }

  const stockSummary = (trackedItemsResult.data ?? []).map((item) => {
    const opening = openingByItem.get(item.id) ?? 0;
    const production = productionByItem.get(item.id) ?? 0;
    const sold = soldByItem.get(item.id) ?? 0;
    const purchased = purchasedByItemId.get(item.id) ?? purchasedByName.get(item.name.trim().toLowerCase()) ?? 0;
    const estimatedClosing = opening + production + purchased - sold;
    return { item: item.name, opening, production, sold, purchased, estimatedClosing };
  });

  return (
    <DashboardShell role="owner" title="Owner dashboard" description="Daily operational finance and stock visibility for business control.">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded border p-3"><p className="text-xs text-slate-500">Cash balance now</p><p className="text-lg font-semibold">{money(cashBalance)}</p></div>
        <div className="rounded border p-3"><p className="text-xs text-slate-500">Mpesa balance now</p><p className="text-lg font-semibold">{money(mpesaBalance)}</p></div>
        <div className="rounded border p-3"><p className="text-xs text-slate-500">Outstanding debt now</p><p className="text-lg font-semibold">{money(outstandingDebt)}</p></div>
        <div className="rounded border p-3"><p className="text-xs text-slate-500">Today sales</p><p className="text-lg font-semibold">{money(todaySales)}</p></div>
        <div className="rounded border p-3"><p className="text-xs text-slate-500">Today expenses</p><p className="text-lg font-semibold">{money(todayExpenses)}</p></div>
        <div className="rounded border p-3"><p className="text-xs text-slate-500">Today purchases</p><p className="text-lg font-semibold">{money(todayPurchases)}</p></div>
        <div className="rounded border p-3 md:col-span-3"><p className="text-xs text-slate-500">Today net operational position</p><p className="text-xl font-semibold">{money(todayNet)}</p></div>
        <div className="rounded border p-3"><p className="text-xs text-slate-500">Opening stock summary (qty)</p><p className="text-lg font-semibold">{openingTotal}</p></div>
        <div className="rounded border p-3"><p className="text-xs text-slate-500">Production summary (qty)</p><p className="text-lg font-semibold">{productionTotal}</p></div>
        <div className="rounded border p-3"><p className="text-xs text-slate-500">Controls</p><p className="text-sm"><Link className="underline" href="/owner/purchases">Purchases</Link> · <Link className="underline" href="/owner/expenses">Expenses</Link> · <Link className="underline" href="/owner/operations">Operations</Link></p></div>
      </div>

      <section className="mt-6 space-y-2">
        <h2 className="text-base font-semibold">Operational stock summary (today)</h2>
        <p className="text-xs text-slate-500">Estimated closing = opening + production + purchases (direct item linkage first, name fallback for old rows) - sold quantity.</p>
        {stockSummary.map((row) => (
          <article key={row.item} className="grid grid-cols-2 gap-2 rounded border p-3 text-sm md:grid-cols-6">
            <p className="font-semibold md:col-span-1">{row.item}</p>
            <p>Opening: {row.opening}</p>
            <p>Production: {row.production}</p>
            <p>Purchased: {row.purchased}</p>
            <p>Sold: {row.sold}</p>
            <p>Estimated closing: {row.estimatedClosing}</p>
          </article>
        ))}
      </section>
    </DashboardShell>
  );
}
