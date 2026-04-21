import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { MetricCard, EmptyState } from '@/components/ui/fryva-ui';
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

  const cashBalance = (ledgerResult.data ?? []).filter((row: any) => row.ledger_accounts?.account_type === 'cash').reduce((sum: number, row: any) => sum + (row.direction === 'in' ? Number(row.amount) : -Number(row.amount)), 0);
  const mpesaBalance = (ledgerResult.data ?? []).filter((row: any) => row.ledger_accounts?.account_type === 'mpesa').reduce((sum: number, row: any) => sum + (row.direction === 'in' ? Number(row.amount) : -Number(row.amount)), 0);

  const outstandingDebt = (debtResult.data ?? []).reduce((sum, row) => sum + Number(row.remaining_amount), 0);
  const todaySales = (salesResult.data ?? []).reduce((sum, row) => sum + Number(row.total), 0);
  const todayExpenses = (expensesResult.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const todayPurchases = (purchasesResult.data ?? []).reduce((sum, row) => sum + Number(row.total_cost), 0);
  const todayNet = todaySales - todayExpenses - todayPurchases;

  const openingByItem = new Map<number, number>();
  for (const row of openingResult.data ?? []) openingByItem.set(row.menu_item_id, Number(row.qty));
  const productionByItem = new Map<number, number>();
  for (const row of productionResult.data ?? []) productionByItem.set(row.menu_item_id, (productionByItem.get(row.menu_item_id) ?? 0) + Number(row.qty));
  const soldByItem = new Map<number, number>();
  for (const row of soldResult.data ?? []) soldByItem.set(row.menu_item_id, (soldByItem.get(row.menu_item_id) ?? 0) + Number((row as any).quantity));

  const purchasedByItemId = new Map<number, number>();
  const purchasedByName = new Map<string, number>();
  for (const row of purchasedTodayResult.data ?? []) {
    if ((row as any).menu_item_id) purchasedByItemId.set((row as any).menu_item_id, (purchasedByItemId.get((row as any).menu_item_id) ?? 0) + Number(row.qty));
    else purchasedByName.set(row.item_name.trim().toLowerCase(), (purchasedByName.get(row.item_name.trim().toLowerCase()) ?? 0) + Number(row.qty));
  }

  const stockSummary = (trackedItemsResult.data ?? []).map((item) => {
    const opening = openingByItem.get(item.id) ?? 0;
    const production = productionByItem.get(item.id) ?? 0;
    const sold = soldByItem.get(item.id) ?? 0;
    const purchased = purchasedByItemId.get(item.id) ?? purchasedByName.get(item.name.trim().toLowerCase()) ?? 0;
    return { item: item.name, opening, production, sold, purchased, estimatedClosing: opening + production + purchased - sold };
  });

  return (
    <DashboardShell role="owner" title="Owner mission control" description="Live financial and operational visibility with owner-grade controls.">
      <section className="kpi-grid">
        <MetricCard label="Cash now" value={money(cashBalance)} />
        <MetricCard label="Mpesa now" value={money(mpesaBalance)} />
        <MetricCard label="Outstanding debt" value={money(outstandingDebt)} />
        <MetricCard label="Today revenue" value={money(todaySales)} />
        <MetricCard label="Today expenses" value={money(todayExpenses)} />
        <MetricCard label="Today purchases" value={money(todayPurchases)} />
        <MetricCard label="Net position today" value={money(todayNet)} span={6} />
        <MetricCard label="Quick actions" value={<span style={{ fontSize: 14 }}><Link href="/owner/operations" style={{ color: '#9f1239' }}>Reconciliation</Link> · <Link href="/owner/reports">Reports</Link></span>} span={6} />
      </section>

      <section className="panel">
        <h2 className="section-title">Operational stock summary (today)</h2>
        <p className="section-subtitle">Estimated closing = opening + production + purchases − sold quantity.</p>
        {stockSummary.length === 0 ? <EmptyState title="No tracked stock today" description="Opening stock and production entries will appear here." /> : (
          <div className="table-shell" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr><th>Item</th><th className="money">Opening</th><th className="money">Production</th><th className="money">Purchased</th><th className="money">Sold</th><th className="money">Estimated closing</th></tr>
              </thead>
              <tbody>
                {stockSummary.map((row) => (
                  <tr key={row.item}><td>{row.item}</td><td className="money">{row.opening}</td><td className="money">{row.production}</td><td className="money">{row.purchased}</td><td className="money">{row.sold}</td><td className="money">{row.estimatedClosing}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
